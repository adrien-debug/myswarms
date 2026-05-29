"""Strict Pydantic models for Risk Engine I/O.

These mirror shared/schemas/*.json. Pydantic v2.
Validation here = first line of defense against malformed upstream payloads.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EntryCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    indicator: str
    op: Literal["<", "<=", ">", ">=", "==", "cross_up", "cross_down"]
    value: float | str


class Entry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["market", "limit", "conditional"]
    price_hint: float | None = None
    conditions: list[EntryCondition] = Field(..., min_length=1, max_length=10)


class TakeProfit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    price_pct: float
    size_pct: float = Field(..., ge=0, le=1)


class StopLoss(BaseModel):
    model_config = ConfigDict(extra="forbid")
    price_pct: float = Field(..., ge=0, le=1)
    type: Literal["fixed", "trailing", "atr"]


class Exit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    take_profit: list[TakeProfit] = Field(..., min_length=1, max_length=5)
    stop_loss: StopLoss
    time_stop_seconds: int | None = Field(None, ge=0)


class RiskAssumptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_vol: float = Field(..., ge=0)
    max_loss_pct: float = Field(..., ge=0, le=1)
    win_rate_est: float | None = Field(None, ge=0, le=1)
    rr_ratio: float | None = Field(None, ge=0)


class StrategySpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spec_id: UUID
    request_id: UUID
    tenant_id: UUID
    asset: str
    quote: str = "USDT"
    venue: Literal["hyperliquid", "binance", "bybit"]
    direction: Literal["long", "short"]
    timeframe: Literal["1m", "5m", "15m", "1h", "4h", "1d"]
    entry: Entry
    exit: Exit
    leverage_suggestion: float = Field(1, ge=1, le=50)
    risk_assumptions: RiskAssumptions
    swarm_signals_ref: list[UUID] = Field(default_factory=list)
    confidence: float = Field(..., ge=0, le=1)
    rationale: str | None = None
    model: str
    created_at: datetime


class SizedOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    venue: Literal["hyperliquid", "binance", "bybit"]
    symbol: str
    side: Literal["buy", "sell"]
    type: Literal["market", "limit", "stop", "stop_limit"]
    size: float = Field(..., gt=0)
    limit_price: float | None = Field(None, gt=0)
    stop_price: float | None = Field(None, gt=0)
    time_in_force: Literal["IOC", "GTC", "FOK"]
    reduce_only: bool
    client_order_id: str = Field(..., pattern=r"^[a-f0-9]{32}$")
    leverage: float | None = Field(None, ge=1, le=50)


Decision = Literal["APPROVE", "RESIZE", "REJECT"]
ReasonCode = Literal[
    "ok",
    "cvar_breach",
    "kelly_cap_hit",
    "leverage_cap",
    "drawdown_limit",
    "market_stale",
    "spread_too_wide",
    "insufficient_liquidity",
    "slippage_too_high",
    "log_returns_insufficient",
    "vol_target_breach",
    "notional_cap",
    "daily_loss_limit",
    "venue_not_allowed",
    "asset_not_allowed",
    "portfolio_stale",
    "kill_switch_active",
    "outbox_saturated",
    "spec_invalid",
    "insufficient_margin",
]


class RulesEval(BaseModel):
    """Trace of every rule evaluation. Required for replay/audit."""

    model_config = ConfigDict(extra="allow")
    cvar_99: float | None = None
    cvar_99_limit: float | None = None
    kelly_size: float | None = None
    kelly_cap_applied: float | None = None
    atr_target: float | None = None
    notional_usd: float | None = None
    leverage_used: float | None = None
    drawdown_30d_pct: float | None = None
    margin_required_usd: float | None = None
    margin_available_usd: float | None = None
    resized_from_size: float | None = None
    resized_to_size: float | None = None


class RiskDecisionOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision_id: UUID
    tenant_id: UUID
    request_id: UUID
    decision: Decision
    reason_codes: list[ReasonCode]
    rules_eval: RulesEval
    sized_orders: list[SizedOrder]
    expires_at: datetime
    engine_version: str
    computed_at: datetime


class PortfolioSnapshot(BaseModel):
    """Read-side projection from hedge_portfolio_snapshots.payload."""

    model_config = ConfigDict(extra="allow")
    equity_usd: float = Field(..., gt=0)
    available_margin_usd: float = Field(..., ge=0)
    max_drawdown_pct_30d: float = Field(0, ge=0, le=1)
    realized_pnl_usd_24h: float = 0
    positions: list[dict] = Field(default_factory=list)
    open_orders: list[dict] = Field(default_factory=list)


class TenantRiskProfile(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: UUID
    tenant_id: UUID
    version: int
    cvar_99_max_pct: float
    kelly_cap: float
    max_leverage: float
    max_drawdown_pct: float
    atr_vol_target_pct: float
    per_asset_notional_cap_usd: float
    daily_loss_limit_usd: float
    allowed_venues: list[str]
    allowed_assets: list[str]
