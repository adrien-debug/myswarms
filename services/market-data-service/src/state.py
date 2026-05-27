"""In-memory rolling state per (venue, symbol).

Buffers recent trades/candles to compute:
  - mid price (from best bid/ask)
  - spread bps
  - ATR-14 over 1m candles
  - realized volatility from 1m log returns
  - rolling top-of-book imbalance

We re-emit snapshots on a regular cadence (the worker's job).
"""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Optional


@dataclass
class Candle:
    open_ts: float
    open: float
    high: float
    low: float
    close: float


@dataclass
class SymbolState:
    venue: str
    symbol: str
    last_event_ts: float = 0.0
    # L1
    best_bid: float = 0.0
    best_ask: float = 0.0
    # L2 depth (top 10)
    depth_bid_top10_usd: float = 0.0
    depth_ask_top10_usd: float = 0.0
    orderbook_bids: list[list[float]] = field(default_factory=list)
    orderbook_asks: list[list[float]] = field(default_factory=list)
    orderbook_seq: int = 0
    # Trades
    last_trade_price: float = 0.0
    last_trade_ts: float = 0.0
    volume_24h_usd: float = 0.0
    # Candles (1m, rolling)
    candles_1m: Deque[Candle] = field(default_factory=lambda: deque(maxlen=1440))
    _current_minute: int = 0
    # Funding / OI
    funding_rate_8h: Optional[float] = None
    open_interest_usd: Optional[float] = None
    # Health
    ws_connected: bool = False

    def update_l1(self, bid: float, ask: float, ts: float) -> None:
        self.best_bid = bid
        self.best_ask = ask
        self.last_event_ts = max(self.last_event_ts, ts)

    def update_book(
        self,
        bids: list[list[float]],
        asks: list[list[float]],
        seq: int,
        ts: float,
    ) -> None:
        self.orderbook_bids = bids[:20]
        self.orderbook_asks = asks[:20]
        self.orderbook_seq = seq
        if bids:
            self.best_bid = float(bids[0][0])
        if asks:
            self.best_ask = float(asks[0][0])
        # USD depth top 10 (assuming size is in base asset, multiply by price).
        self.depth_bid_top10_usd = sum(
            float(p) * float(s) for p, s in bids[:10]
        )
        self.depth_ask_top10_usd = sum(
            float(p) * float(s) for p, s in asks[:10]
        )
        self.last_event_ts = max(self.last_event_ts, ts)

    def on_trade(self, price: float, size_base: float, ts: float) -> None:
        self.last_trade_price = price
        self.last_trade_ts = ts
        # Approx volume; resets daily in production via reconcile.
        self.volume_24h_usd += price * size_base
        self.last_event_ts = max(self.last_event_ts, ts)
        # 1m candle aggregation.
        minute = int(ts // 60)
        if not self.candles_1m or self._current_minute != minute:
            self.candles_1m.append(Candle(open_ts=ts, open=price, high=price, low=price, close=price))
            self._current_minute = minute
        else:
            c = self.candles_1m[-1]
            c.high = max(c.high, price)
            c.low = min(c.low, price)
            c.close = price

    def mid(self) -> float:
        if self.best_bid > 0 and self.best_ask > 0:
            return (self.best_bid + self.best_ask) / 2.0
        return self.last_trade_price

    def spread_bps(self) -> float:
        m = self.mid()
        if m <= 0 or self.best_bid <= 0 or self.best_ask <= 0:
            return 0.0
        return (self.best_ask - self.best_bid) / m * 10_000

    def atr(self, period: int = 14) -> float:
        """Wilder ATR over 1m candles."""
        if len(self.candles_1m) < period + 1:
            return 0.0
        candles = list(self.candles_1m)[-(period + 1):]
        trs: list[float] = []
        prev_close = candles[0].close
        for c in candles[1:]:
            tr = max(c.high - c.low, abs(c.high - prev_close), abs(c.low - prev_close))
            trs.append(tr)
            prev_close = c.close
        # Wilder average.
        return sum(trs) / len(trs) if trs else 0.0

    def log_returns_1m(self, n: int = 500) -> list[float]:
        candles = list(self.candles_1m)[-n - 1 :]
        out: list[float] = []
        prev_close = candles[0].close if candles else 0.0
        for c in candles[1:]:
            if prev_close > 0 and c.close > 0:
                out.append(math.log(c.close / prev_close))
            prev_close = c.close
        return out

    def realized_vol_24h(self) -> float:
        """Stdev of 1m log returns, annualised to 24h (×√1440)."""
        rs = self.log_returns_1m(1440)
        if len(rs) < 30:
            return 0.0
        mean = sum(rs) / len(rs)
        var = sum((r - mean) ** 2 for r in rs) / max(len(rs) - 1, 1)
        return math.sqrt(var) * math.sqrt(1440)

    def depth_imbalance(self) -> float:
        b = self.depth_bid_top10_usd
        a = self.depth_ask_top10_usd
        if b + a <= 0:
            return 0.0
        return (b - a) / (b + a)

    def market_snapshot_payload(self) -> dict:
        m = self.mid()
        atr_v = self.atr(14)
        return {
            "mid_price": m,
            "best_bid": self.best_bid,
            "best_ask": self.best_ask,
            "spread_bps": round(self.spread_bps(), 4),
            "atr_14": round(atr_v, 8),
            "atr_pct": round(atr_v / m, 8) if m > 0 else 0.0,
            "realized_vol_24h": round(self.realized_vol_24h(), 8),
            "log_returns": self.log_returns_1m(500),
            "funding_rate_8h": self.funding_rate_8h,
            "open_interest_usd": self.open_interest_usd,
            "volume_24h_usd": self.volume_24h_usd,
            "liquidity_top10_usd_bid": self.depth_bid_top10_usd,
            "liquidity_top10_usd_ask": self.depth_ask_top10_usd,
            "last_trade_ts": self.last_trade_ts,
            "depth_imbalance": round(self.depth_imbalance(), 6),
        }

    def orderbook_snapshot_payload(self) -> dict:
        return {
            "bids": self.orderbook_bids,
            "asks": self.orderbook_asks,
            "depth_bid_top10_usd": self.depth_bid_top10_usd,
            "depth_ask_top10_usd": self.depth_ask_top10_usd,
            "mid": self.mid(),
            "spread_bps": round(self.spread_bps(), 4),
            "imbalance": round(self.depth_imbalance(), 6),
            "seq": self.orderbook_seq,
        }


class StateStore:
    """Lookup by (venue, symbol). Single-process. Thread-safe-ish under asyncio."""

    def __init__(self) -> None:
        self._states: dict[tuple[str, str], SymbolState] = {}

    def get(self, venue: str, symbol: str) -> SymbolState:
        key = (venue, symbol)
        st = self._states.get(key)
        if st is None:
            st = SymbolState(venue=venue, symbol=symbol)
            self._states[key] = st
        return st

    def all(self) -> list[SymbolState]:
        return list(self._states.values())


def now_ts() -> float:
    return time.time()
