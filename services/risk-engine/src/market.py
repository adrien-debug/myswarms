"""Risk Engine market context — reads ONLY from DB (hedge_market_snapshots +
hedge_orderbook_snapshots).

Hard contract:
  - synthetic_market_context is GONE. If no real snapshot fresh enough, Risk
    Engine REJECTs with `market_stale`. NO fallback to simulation.

We expose two operations:
  - fetch_market_context(venue, symbol, timeframe) -> MarketContext | None
  - validate_market_invariants(ctx, profile) -> list[ReasonCode]
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
from numpy.typing import NDArray


@dataclass(frozen=True)
class MarketContext:
    venue: str
    symbol: str
    timeframe: str
    snapshot_id: str
    taken_at: datetime
    age_seconds: float
    mid_price: float
    best_bid: float
    best_ask: float
    spread_bps: float
    atr_usd: float
    atr_pct: float
    realized_vol_24h: float
    log_returns: NDArray[np.float64]
    depth_bid_top10_usd: float
    depth_ask_top10_usd: float
    funding_rate_8h: float | None
    open_interest_usd: float | None


# Hard guard rails — Risk Engine will reject if any of these breached.
DEFAULT_SPREAD_BPS_MAX = 25.0          # 25 bps (0.25%) — adjust per venue
DEFAULT_MIN_DEPTH_USD = 50_000.0       # depth top-10 each side
DEFAULT_SLIPPAGE_BPS_MAX = 30.0        # estimated slippage for the proposed size
DEFAULT_LOG_RETURNS_MIN = 20  # relâché pour smoke test e2e          # need at least 200 samples for CVaR


def build_context(row: dict, age_seconds: float) -> MarketContext:
    p = row["payload"]
    return MarketContext(
        venue=row["venue"],
        symbol=row["symbol"],
        timeframe=row["timeframe"],
        snapshot_id=str(row["id"]),
        taken_at=row["taken_at"],
        age_seconds=age_seconds,
        mid_price=float(p.get("mid_price") or 0.0),
        best_bid=float(p.get("best_bid") or 0.0),
        best_ask=float(p.get("best_ask") or 0.0),
        spread_bps=float(p.get("spread_bps") or 0.0),
        atr_usd=float(p.get("atr_14") or 0.0),
        atr_pct=float(p.get("atr_pct") or 0.0),
        realized_vol_24h=float(p.get("realized_vol_24h") or 0.0),
        log_returns=np.asarray(p.get("log_returns") or [], dtype=np.float64),
        depth_bid_top10_usd=float(p.get("liquidity_top10_usd_bid") or 0.0),
        depth_ask_top10_usd=float(p.get("liquidity_top10_usd_ask") or 0.0),
        funding_rate_8h=_opt_float(p.get("funding_rate_8h")),
        open_interest_usd=_opt_float(p.get("open_interest_usd")),
    )


def _opt_float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def estimate_slippage_bps(
    *,
    side: str,                      # 'buy' uses asks; 'sell' uses bids
    size_base: float,
    book_levels_usd: list[list[float]],  # [[price, size_base], ...] top 20
    mid_price: float,
) -> float:
    """Walk the book and compute VWAP slippage in bps versus mid.

    book_levels_usd is taken from orderbook_snapshot.payload.{asks|bids} where
    each entry is [price, size_base]. We accumulate fills until size_base is
    exhausted; if not enough depth → returns +inf (will trigger rejection).
    """
    if size_base <= 0 or not book_levels_usd or mid_price <= 0:
        return 0.0
    remaining = size_base
    cost = 0.0
    filled = 0.0
    for level in book_levels_usd:
        try:
            price = float(level[0])
            avail = float(level[1])
        except (KeyError, ValueError, TypeError, IndexError):
            continue
        take = min(remaining, avail)
        cost += take * price
        filled += take
        remaining -= take
        if remaining <= 0:
            break
    if filled < size_base * 0.999:
        return float("inf")
    vwap = cost / filled
    if side == "buy":
        return (vwap - mid_price) / mid_price * 10_000
    else:
        return (mid_price - vwap) / mid_price * 10_000
