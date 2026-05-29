"""Risk Engine evaluator — pure, deterministic, replayable.

Given:
  - StrategySpec (LLM output, HMAC-verified upstream)
  - PortfolioSnapshot (fresh)
  - TenantRiskProfile (active)
  - MarketContext (REAL, from hedge_market_snapshots) — REQUIRED
  - orderbook (top 20 each side) — for slippage estimation
  - kill_switch_active flag

Decision ladder (short-circuits to REJECT):
  1. kill switch
  1bis. outbox backpressure
  2. portfolio stale
  3. market stale (no fresh snapshot)
  4. asset/venue not allowed
  5. drawdown limit hit
  6. spread anomaly (> spread_bps_max)
  7. log returns sample insufficient
  8. Kelly + ATR-target sizing
  9. notional cap (may RESIZE)
 10. margin check
 11. CVaR99 historical simulation (uses real log_returns)
 12. liquidity check (min depth top-10)
 13. slippage estimation (walk book vs proposed size)

NO LLM. NO randomness. NO network. Same inputs ⇒ same outputs.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import numpy as np
from numpy.typing import NDArray

from .market import (
    DEFAULT_LOG_RETURNS_MIN,
    DEFAULT_MIN_DEPTH_USD,
    DEFAULT_SLIPPAGE_BPS_MAX,
    DEFAULT_SPREAD_BPS_MAX,
    MarketContext,
    estimate_slippage_bps,
)
from .models import (
    PortfolioSnapshot,
    ReasonCode,
    RiskDecisionOut,
    RulesEval,
    SizedOrder,
    StrategySpec,
    TenantRiskProfile,
)
from .rules import (
    atr_vol_target_size,
    compute_notional_and_margin,
    cvar_99_historical,
    drawdown_within_limit,
    kelly_fraction_capped,
    resolve_sized_order,
)

logger = logging.getLogger(__name__)


def evaluate(
    *,
    spec: StrategySpec,
    portfolio: PortfolioSnapshot,
    profile: TenantRiskProfile,
    market: MarketContext | None,
    orderbook_levels: list[list[float]] | None,         # side-specific (asks for buy, bids for sell)
    engine_version: str,
    decision_ttl_seconds: int,
    kill_switch_active: bool,
    portfolio_age_seconds: float,
    portfolio_max_age_seconds: int,
    outbox_pending_depth: int = 0,
    outbox_max_pending_depth: int = 100,
    market_max_age_seconds: int = 5,
    spread_bps_max: float = DEFAULT_SPREAD_BPS_MAX,
    min_depth_usd: float = DEFAULT_MIN_DEPTH_USD,
    slippage_bps_max: float = DEFAULT_SLIPPAGE_BPS_MAX,
    log_returns_min: int = DEFAULT_LOG_RETURNS_MIN,
) -> RiskDecisionOut:
    """Pure deterministic evaluator. See module docstring for ladder."""
    now = datetime.now(timezone.utc)
    eval_data = RulesEval()
    reason_codes: list[ReasonCode] = []
    sized_orders: list[SizedOrder] = []

    # -- 1. Kill switch --
    if kill_switch_active:
        return _reject(spec, ["kill_switch_active"], eval_data, engine_version, decision_ttl_seconds, now)

    # -- 1bis. Outbox backpressure --
    if outbox_pending_depth >= outbox_max_pending_depth:
        eval_data.model_extra["outbox_pending_depth"] = outbox_pending_depth  # type: ignore[index]
        eval_data.model_extra["outbox_max_pending_depth"] = outbox_max_pending_depth  # type: ignore[index]
        return _reject(spec, ["outbox_saturated"], eval_data, engine_version, decision_ttl_seconds, now)

    # -- 2. Portfolio freshness --
    if portfolio_age_seconds > portfolio_max_age_seconds:
        return _reject(spec, ["portfolio_stale"], eval_data, engine_version, decision_ttl_seconds, now)

    # -- 3. Market freshness --
    if market is None or market.age_seconds > market_max_age_seconds:
        return _reject(spec, ["market_stale"], eval_data, engine_version, decision_ttl_seconds, now)

    # -- 4. Allow-listing --
    if spec.venue not in profile.allowed_venues:
        return _reject(spec, ["venue_not_allowed"], eval_data, engine_version, decision_ttl_seconds, now)
    if spec.asset not in profile.allowed_assets:
        return _reject(spec, ["asset_not_allowed"], eval_data, engine_version, decision_ttl_seconds, now)

    # -- 5. Drawdown --
    dd = drawdown_within_limit(
        current_drawdown_pct=portfolio.max_drawdown_pct_30d,
        max_drawdown_pct=profile.max_drawdown_pct,
    )
    eval_data.drawdown_30d_pct = dd.drawdown_pct
    if not dd.within_limit:
        return _reject(spec, ["drawdown_limit"], eval_data, engine_version, decision_ttl_seconds, now)

    # -- 6. Spread anomaly --
    if market.spread_bps > spread_bps_max:
        return _reject(spec, ["spread_too_wide"], eval_data, engine_version, decision_ttl_seconds, now)

    # -- 7. Log returns sufficient --
    if market.log_returns.size < log_returns_min:
        return _reject(spec, ["log_returns_insufficient"], eval_data, engine_version, decision_ttl_seconds, now)

    # -- 8. Kelly + ATR sizing --
    win_rate = spec.risk_assumptions.win_rate_est or 0.5
    rr_ratio = spec.risk_assumptions.rr_ratio or 1.5
    kelly = kelly_fraction_capped(
        win_rate=win_rate, rr_ratio=rr_ratio, kelly_cap=profile.kelly_cap,
    )
    eval_data.kelly_size = kelly.raw_kelly
    eval_data.kelly_cap_applied = kelly.applied_fraction

    leverage = min(spec.leverage_suggestion, profile.max_leverage)
    eval_data.leverage_used = leverage

    atr_size = atr_vol_target_size(
        equity_usd=portfolio.equity_usd,
        vol_target_pct=profile.atr_vol_target_pct,
        atr_usd=market.atr_usd,
        leverage=leverage,
    )
    eval_data.atr_target = atr_size.size_base

    entry_price = market.mid_price
    kelly_implied_notional = portfolio.equity_usd * kelly.applied_fraction * leverage
    kelly_size_base = kelly_implied_notional / entry_price if entry_price > 0 else 0.0
    proposed_size = min(kelly_size_base, atr_size.size_base)

    if proposed_size <= 0:
        reasons: list[ReasonCode] = ["kelly_cap_hit" if kelly.capped else "vol_target_breach"]
        return _reject(spec, reasons, eval_data, engine_version, decision_ttl_seconds, now)

    # -- 9. Notional + margin caps (RESIZE on notional cap) --
    nm = compute_notional_and_margin(
        size_base=proposed_size,
        entry_price=entry_price,
        leverage=leverage,
        available_margin_usd=portfolio.available_margin_usd,
        per_asset_notional_cap_usd=profile.per_asset_notional_cap_usd,
    )
    eval_data.notional_usd = nm.notional_usd
    eval_data.margin_required_usd = nm.margin_required_usd
    eval_data.margin_available_usd = portfolio.available_margin_usd

    resized = False
    if not nm.within_notional_cap:
        original = proposed_size
        scale = profile.per_asset_notional_cap_usd / nm.notional_usd
        proposed_size = proposed_size * scale
        nm = compute_notional_and_margin(
            size_base=proposed_size,
            entry_price=entry_price,
            leverage=leverage,
            available_margin_usd=portfolio.available_margin_usd,
            per_asset_notional_cap_usd=profile.per_asset_notional_cap_usd,
        )
        eval_data.resized_from_size = original
        eval_data.resized_to_size = proposed_size
        eval_data.notional_usd = nm.notional_usd
        reason_codes.append("notional_cap")
        resized = True

    if not nm.within_margin:
        return _reject(
            spec, [*reason_codes, "insufficient_margin"], eval_data, engine_version, decision_ttl_seconds, now
        )

    # -- 10. CVaR99 on REAL log returns --
    cvar = cvar_99_historical(
        log_returns=market.log_returns,
        side=spec.direction,
        leverage=leverage,
        entry_price=entry_price,
        size_base=proposed_size,
        limit_pct=profile.cvar_99_max_pct,
        min_samples=log_returns_min,
    )
    eval_data.cvar_99 = cvar.cvar_99_pct
    eval_data.cvar_99_limit = cvar.limit_pct
    if not cvar.passed:
        return _reject(
            spec, [*reason_codes, "cvar_breach"], eval_data, engine_version, decision_ttl_seconds, now
        )

    # -- 11. Liquidity minimum --
    side: str = "buy" if spec.direction == "long" else "sell"
    relevant_depth = market.depth_ask_top10_usd if side == "buy" else market.depth_bid_top10_usd
    eval_data.model_extra["depth_top10_usd"] = relevant_depth  # type: ignore[index]
    if relevant_depth < min_depth_usd:
        return _reject(
            spec, [*reason_codes, "insufficient_liquidity"], eval_data, engine_version, decision_ttl_seconds, now
        )

    # -- 12. Slippage estimation against book --
    if orderbook_levels:
        slip_bps = estimate_slippage_bps(
            side=side,
            size_base=proposed_size,
            book_levels_usd=orderbook_levels,
            mid_price=entry_price,
        )
        eval_data.model_extra["slippage_bps"] = slip_bps  # type: ignore[index]
        if slip_bps > slippage_bps_max:
            return _reject(
                spec, [*reason_codes, "slippage_too_high"], eval_data, engine_version, decision_ttl_seconds, now
            )

    # -- 13. Build sized order --
    symbol = _symbol_for(venue=spec.venue, asset=spec.asset, quote=spec.quote)
    entry_type = "market" if spec.entry.type == "market" else "limit"
    limit_price = spec.entry.price_hint if entry_type == "limit" else None

    order_dict = resolve_sized_order(
        request_id=spec.request_id,
        leg_index=0,
        venue=spec.venue,
        symbol=symbol,
        side=side,
        final_size_base=proposed_size,
        entry_type=entry_type,
        limit_price=limit_price,
        leverage=leverage,
        reduce_only=False,
    )
    sized_orders.append(SizedOrder.model_validate(order_dict))

    decision = "RESIZE" if resized else "APPROVE"
    reason_codes = reason_codes or ["ok"]
    eval_data.model_extra["market_snapshot_id"] = market.snapshot_id  # type: ignore[index]
    eval_data.model_extra["spread_bps"] = market.spread_bps  # type: ignore[index]
    eval_data.model_extra["mid_price"] = market.mid_price  # type: ignore[index]

    return RiskDecisionOut(
        decision_id=uuid4(),
        tenant_id=spec.tenant_id,
        request_id=spec.request_id,
        decision=decision,
        reason_codes=reason_codes,
        rules_eval=eval_data,
        sized_orders=sized_orders,
        expires_at=now + timedelta(seconds=decision_ttl_seconds),
        engine_version=engine_version,
        computed_at=now,
    )


def _reject(
    spec: StrategySpec,
    reasons: list[ReasonCode],
    eval_data: RulesEval,
    engine_version: str,
    decision_ttl_seconds: int,
    now: datetime,
) -> RiskDecisionOut:
    return RiskDecisionOut(
        decision_id=uuid4(),
        tenant_id=spec.tenant_id,
        request_id=spec.request_id,
        decision="REJECT",
        reason_codes=reasons or ["spec_invalid"],
        rules_eval=eval_data,
        sized_orders=[],
        expires_at=now + timedelta(seconds=decision_ttl_seconds),
        engine_version=engine_version,
        computed_at=now,
    )


def _symbol_for(*, venue: str, asset: str, quote: str) -> str:
    if venue == "hyperliquid":
        return f"{asset}-USD"
    if venue == "binance":
        return f"{asset}{quote}"
    if venue == "bybit":
        return f"{asset}{quote}"
    raise ValueError(f"Unknown venue: {venue}")
