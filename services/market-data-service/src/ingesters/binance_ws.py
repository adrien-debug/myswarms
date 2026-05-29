"""Binance USDM Futures WS ingester.

Streams:
  - bookTicker         (L1: bestBid / bestAsk)
  - depth20@100ms      (L2: top 20 levels)
  - aggTrade           (trades)
  - markPriceUpdate    (funding rate)

WS URL pattern:
  wss://fstream.binance.com/stream?streams=btcusdt@bookTicker/btcusdt@depth20@100ms/...

Auto-reconnect on disconnect; emits market_events on every state change.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import websockets

from ..config import settings
from ..state import StateStore, now_ts
from .base import Ingester

logger = logging.getLogger("market-data.binance")


class BinanceIngester(Ingester):
    venue = "binance"

    def __init__(self, symbol: str, store: StateStore) -> None:
        super().__init__(symbol=symbol, store=store)
        self.events_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=1000)

    async def run_forever(self) -> None:
        sym = self.symbol.lower()
        streams = "/".join(
            [f"{sym}@bookTicker", f"{sym}@depth20@100ms", f"{sym}@aggTrade", f"{sym}@markPrice@1s"]
        )
        url = f"{settings().binance_ws_url}/stream?streams={streams}"
        backoff = 1.0
        while not self.stopping:
            try:
                async with websockets.connect(
                    url, ping_interval=20, ping_timeout=10, max_size=2**20
                ) as ws:
                    self.connected = True
                    backoff = 1.0
                    await self._emit_event("ws_connected", "info", {})
                    async for msg in ws:
                        try:
                            data = json.loads(msg)
                            payload = data.get("data") or data
                            self._handle(payload)
                        except json.JSONDecodeError:
                            continue
            except (websockets.ConnectionClosed, OSError, asyncio.TimeoutError) as e:
                self.connected = False
                await self._emit_event(
                    "ws_disconnected", "warn", {"error": f"{type(e).__name__}: {e}"[:300]}
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
            except Exception as e:  # noqa: BLE001
                self.connected = False
                logger.exception("Binance WS unexpected error")
                await self._emit_event(
                    "ws_disconnected", "error", {"error": f"{type(e).__name__}: {e}"[:300]}
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    def _handle(self, payload: dict[str, Any]) -> None:
        e = payload.get("e")
        st = self.store.get(self.venue, self.symbol)
        ts_evt_ms = payload.get("E") or payload.get("T")
        ts = (ts_evt_ms / 1000.0) if ts_evt_ms else now_ts()

        if e == "bookTicker" or "b" in payload and "a" in payload and "u" in payload:
            # bookTicker: {"u":...,"s":"BTCUSDT","b":"...","B":"...","a":"...","A":"..."}
            try:
                bid = float(payload["b"])
                ask = float(payload["a"])
                st.update_l1(bid, ask, ts)
            except (KeyError, ValueError):
                pass
        elif e == "depthUpdate" or "bids" in payload:
            try:
                bids = [[float(p), float(s)] for p, s in payload.get("bids", payload.get("b", []))[:20]]
                asks = [[float(p), float(s)] for p, s in payload.get("asks", payload.get("a", []))[:20]]
                seq = int(payload.get("u", payload.get("lastUpdateId", 0)))
                st.update_book(bids, asks, seq, ts)
            except (KeyError, ValueError, TypeError):
                pass
        elif e == "aggTrade":
            try:
                price = float(payload["p"])
                size = float(payload["q"])
                st.on_trade(price, size, ts)
            except (KeyError, ValueError):
                pass
        elif e == "markPriceUpdate":
            try:
                if "r" in payload:
                    st.funding_rate_8h = float(payload["r"])
            except (ValueError, TypeError):
                pass

    async def _emit_event(self, kind: str, severity: str, payload: dict) -> None:
        try:
            self.events_queue.put_nowait(
                {
                    "venue": self.venue,
                    "symbol": self.symbol,
                    "kind": kind,
                    "severity": severity,
                    "payload": payload,
                }
            )
        except asyncio.QueueFull:
            pass
