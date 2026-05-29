"""Pydantic models — StrategySpec must match shared/schemas/strategy_spec.schema.json."""

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
    asset: str = Field(..., min_length=1, max_length=16)
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
    rationale: str | None = Field(None, max_length=4000)
    model: str
    created_at: datetime


class SwarmSignalRead(BaseModel):
    """Read-side projection of a swarm_signals row."""

    model_config = ConfigDict(extra="allow")
    id: UUID
    agent: Literal["technical", "sentiment", "macro", "onchain"]
    status: Literal["ok", "degraded", "failed", "timeout"]
    payload: dict
    confidence: float | None = None
    model: str | None = None
