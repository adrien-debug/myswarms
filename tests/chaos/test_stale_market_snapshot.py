"""Chaos: market data is stale → Risk Engine MUST reject with `market_stale`.

Pure-function test against the evaluator: no DB needed.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import numpy as np
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2] / "services" / "risk-engine"))

from src.evaluator import evaluate  # type: ignore
from src.market import build_context  # type: ignore
from src.models import (  # type: ignore
    Entry, EntryCondition, Exit, PortfolioSnapshot, RiskAssumptions,
    StopLoss, StrategySpec, TakeProfit, TenantRiskProfile,
)


def _spec():
    return StrategySpec(
        spec_id=uuid4(), request_id=uuid4(),
        tenant_id=UUID("00000000-0000-0000-0000-000000000001"),
        asset="BTC", venue="hyperliquid", direction="long", timeframe="1h",
        entry=Entry(type="market", price_hint=50_000.0,
                    conditions=[EntryCondition(indicator="rsi_14", op="<", value=30)]),
        exit=Exit(take_profit=[TakeProfit(price_pct=0.02, size_pct=1.0)],
                  stop_loss=StopLoss(price_pct=0.01, type="fixed")),
        leverage_suggestion=2.0,
        risk_assumptions=RiskAssumptions(expected_vol=0.01, max_loss_pct=0.02,
                                          win_rate_est=0.55, rr_ratio=2.0),
        confidence=0.7, model="kimi-k2.6", created_at=datetime.now(timezone.utc),
    )


def _profile():
    return TenantRiskProfile(
        id=uuid4(), tenant_id=UUID("00000000-0000-0000-0000-000000000001"), version=1,
        cvar_99_max_pct=0.05, kelly_cap=0.25, max_leverage=5.0,
        max_drawdown_pct=0.20, atr_vol_target_pct=0.02,
        per_asset_notional_cap_usd=20_000, daily_loss_limit_usd=1_000,
        allowed_venues=["hyperliquid"], allowed_assets=["BTC"],
    )


def _portfolio():
    return PortfolioSnapshot(
        equity_usd=10_000, available_margin_usd=8_000,
        max_drawdown_pct_30d=0.05, realized_pnl_usd_24h=0,
        positions=[], open_orders=[],
    )


def _market_payload(seed: int = 1, vol: float = 0.01):
    rng = np.random.default_rng(seed)
    log_returns = rng.normal(0.0, vol, 500).tolist()
    return {
        "mid_price": 50_000.0, "best_bid": 49_999.0, "best_ask": 50_001.0,
        "spread_bps": 2.0, "atr_14": 750.0, "atr_pct": 0.015,
        "realized_vol_24h": vol * (24 ** 0.5),
        "log_returns": log_returns,
        "funding_rate_8h": 0.0001, "open_interest_usd": 100_000_000,
        "volume_24h_usd": 1e9,
        "liquidity_top10_usd_bid": 500_000, "liquidity_top10_usd_ask": 500_000,
        "last_trade_ts": datetime.now(timezone.utc).timestamp(),
        "depth_imbalance": 0.0,
    }


def test_stale_market_rejects_unconditionally():
    market_row = {
        "id": "00000000-0000-0000-0000-000000000000",
        "venue": "hyperliquid", "symbol": "BTC-USD", "timeframe": "1m",
        "taken_at": datetime.now(timezone.utc),
        "payload": _market_payload(),
    }
    market = build_context(market_row, age_seconds=120)   # WAY too old
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=market, orderbook_levels=None,
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.5,
        portfolio_max_age_seconds=5, market_max_age_seconds=5,
    )
    assert out.decision == "REJECT"
    assert "market_stale" in out.reason_codes
    assert out.sized_orders == []


def test_no_market_data_rejects():
    out = evaluate(
        spec=_spec(), portfolio=_portfolio(), profile=_profile(),
        market=None, orderbook_levels=None,
        engine_version="0.1.0", decision_ttl_seconds=10,
        kill_switch_active=False, portfolio_age_seconds=0.5,
        portfolio_max_age_seconds=5,
    )
    assert out.decision == "REJECT"
    assert "market_stale" in out.reason_codes
