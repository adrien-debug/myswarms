"""Risk Engine evaluator — replay/determinism tests against REAL market shape.

No synthetic fallback. Tests pass an explicit MarketContext built from a
known-good payload dict (same shape as hedge_market_snapshots.payload).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import numpy as np

from src.evaluator import evaluate
from src.market import build_context
from src.models import (
    Entry,
    EntryCondition,
    Exit,
    PortfolioSnapshot,
    RiskAssumptions,
    StopLoss,
    StrategySpec,
    TakeProfit,
    TenantRiskProfile,
)


def _spec(asset: str = "BTC", venue: str = "hyperliquid", direction: str = "long") -> StrategySpec:
    return StrategySpec(
        spec_id=uuid4(),
        request_id=uuid4(),
        tenant_id=UUID("00000000-0000-0000-0000-000000000001"),
        asset=asset,
        venue=venue,  # type: ignore
        direction=direction,  # type: ignore
        timeframe="1h",
        entry=Entry(
            type="market",
            price_hint=50_000.0,
            conditions=[EntryCondition(indicator="rsi_14", op="<", value=30)],
        ),
        exit=Exit(
            take_profit=[TakeProfit(price_pct=0.02, size_pct=1.0)],
            stop_loss=StopLoss(price_pct=0.01, type="fixed"),
        ),
        leverage_suggestion=2.0,
        risk_assumptions=RiskAssumptions(
            expected_vol=0.01, max_loss_pct=0.02, win_rate_est=0.55, rr_ratio=2.0,
        ),
        confidence=0.7,
        model="kimi-k2.6",
        created_at=datetime.now(timezone.utc),
    )


def _portfolio(equity: float = 10_000.0, margin: float = 8_000.0, dd: float = 0.05) -> PortfolioSnapshot:
    return PortfolioSnapshot(
        equity_usd=equity,
        available_margin_usd=margin,
        max_drawdown_pct_30d=dd,
        realized_pnl_usd_24h=0.0,
        positions=[],
        open_orders=[],
    )


def _profile(**overrides) -> TenantRiskProfile:
    base = dict(
        id=uuid4(),
        tenant_id=UUID("00000000-0000-0000-0000-000000000001"),
        version=1,
        cvar_99_max_pct=0.05,
        kelly_cap=0.25,
        max_leverage=5.0,
        max_drawdown_pct=0.20,
        atr_vol_target_pct=0.02,
        per_asset_notional_cap_usd=20_000.0,
        daily_loss_limit_usd=1_000.0,
        allowed_venues=["hyperliquid", "binance"],
        allowed_assets=["BTC", "ETH"],
    )
    base.update(overrides)
    return TenantRiskProfile(**base)


def _market_payload(seed: int = 42, vol: float = 0.01, mid: float = 50_000.0, **kw):
    rng = np.random.default_rng(seed)
    log_returns = rng.normal(loc=0.0, scale=vol, size=500).tolist()
    atr = mid * vol * 1.5
    return {
        "mid_price": mid,
        "best_bid": mid * 0.9999,
        "best_ask": mid * 1.0001,
        "spread_bps": kw.get("spread_bps", 2.0),
        "atr_14": atr,
        "atr_pct": atr / mid,
        "realized_vol_24h": vol * (24 ** 0.5),
        "log_returns": log_returns,
        "funding_rate_8h": 0.0001,
        "open_interest_usd": 100_000_000,
        "volume_24h_usd": 1_000_000_000,
        "liquidity_top10_usd_bid": kw.get("depth_bid", 500_000.0),
        "liquidity_top10_usd_ask": kw.get("depth_ask", 500_000.0),
        "last_trade_ts": datetime.now(timezone.utc).timestamp(),
        "depth_imbalance": 0.0,
    }


def _market(seed=42, age=0.5, **kw):
    row = {
        "id": "00000000-0000-0000-0000-000000000000",
        "venue": "hyperliquid",
        "symbol": "BTC-USD",
        "timeframe": "1m",
        "taken_at": datetime.now(timezone.utc),
        "payload": _market_payload(seed=seed, **kw),
    }
    return build_context(row, age)


def _book(asks=10, bids=10, lvl_size=1.0, mid=50_000.0):
    return {
        "asks": [[mid + i, lvl_size] for i in range(1, asks + 1)],
        "bids": [[mid - i, lvl_size] for i in range(1, bids + 1)],
    }


def test_approve_happy_path():
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=_market(), orderbook_levels=_book()["asks"],
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.5,
        portfolio_max_age_seconds=5,
    )
    assert out.decision in ("APPROVE", "RESIZE")
    assert out.sized_orders


def test_reject_kill_switch():
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=_market(), orderbook_levels=_book()["asks"],
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=True, portfolio_age_seconds=0.0,
        portfolio_max_age_seconds=5,
    )
    assert out.decision == "REJECT"
    assert "kill_switch_active" in out.reason_codes


def test_reject_market_stale():
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=_market(age=999), orderbook_levels=None,
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.0,
        portfolio_max_age_seconds=5, market_max_age_seconds=5,
    )
    assert out.decision == "REJECT"
    assert "market_stale" in out.reason_codes


def test_reject_market_missing():
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=None, orderbook_levels=None,
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.0,
        portfolio_max_age_seconds=5,
    )
    assert out.decision == "REJECT"
    assert "market_stale" in out.reason_codes


def test_reject_spread_too_wide():
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=_market(spread_bps=100.0), orderbook_levels=_book()["asks"],
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.0,
        portfolio_max_age_seconds=5,
    )
    assert out.decision == "REJECT"
    assert "spread_too_wide" in out.reason_codes


def test_reject_insufficient_liquidity():
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=_market(depth_ask=1_000.0, depth_bid=1_000.0),
        orderbook_levels=_book()["asks"],
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.0,
        portfolio_max_age_seconds=5,
    )
    assert out.decision == "REJECT"
    assert "insufficient_liquidity" in out.reason_codes


def test_determinism_replay():
    kwargs = dict(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=_market(seed=42), orderbook_levels=_book()["asks"],
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.5,
        portfolio_max_age_seconds=5,
    )
    a = evaluate(**kwargs)
    b = evaluate(**kwargs)
    assert a.decision == b.decision
    assert a.reason_codes == b.reason_codes
    assert [o.size for o in a.sized_orders] == [o.size for o in b.sized_orders]
    assert [o.client_order_id for o in a.sized_orders] == [
        o.client_order_id for o in b.sized_orders
    ]


def test_reject_outbox_saturated():
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=_market(), orderbook_levels=_book()["asks"],
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.5,
        portfolio_max_age_seconds=5,
        outbox_pending_depth=150, outbox_max_pending_depth=100,
    )
    assert out.decision == "REJECT"
    assert "outbox_saturated" in out.reason_codes
    assert out.sized_orders == []


def test_outbox_under_threshold_does_not_reject():
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=_market(), orderbook_levels=_book()["asks"],
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.5,
        portfolio_max_age_seconds=5,
        outbox_pending_depth=50, outbox_max_pending_depth=100,
    )
    assert out.decision in ("APPROVE", "RESIZE")
    assert "outbox_saturated" not in out.reason_codes


def test_reject_outbox_saturated_at_exact_threshold():
    """At depth == max, MUST reject. The check is >= not >."""
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=_market(), orderbook_levels=_book()["asks"],
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.5,
        portfolio_max_age_seconds=5,
        outbox_pending_depth=100, outbox_max_pending_depth=100,
    )
    assert out.decision == "REJECT"
    assert "outbox_saturated" in out.reason_codes
