"""Hyperliquid WS ingester.

HL exposes a single WS endpoint where you subscribe to channels:
  - l2Book      { type: 'l2Book', coin: 'BTC' }
  - trades      { type: 'trades', coin: 'BTC' }
  - allMids     { type: 'allMids' }            (mid-price feed)
  - activeAssetCtx { ... }                     (funding / oi / mark)

Reference: https://hyperliquid.gitbook.io/hyperliquid-docs
We use 'BTC' as coin id; the symbol passed in (e.g. 'BTC-USD') is split.
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

logger = logging.getLogger("market-data.hyperliquid")


class HyperliquidIngester(Ingester):
    venue = "hyperliquid"

    def __init__(self, symbol: str, store: StateStore) -> None:
        super().__init__(symbol=symbol, store=store)
        self.events_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=1000)

    @property
    def coin(self) -> str:
        # 'BTC-USD' → 'BTC'
        return self.symbol.split("-")[0]

    async def run_forever(self) -> None:
        url = settings().hyperliquid_ws_url
        backoff = 1.0
        while not self.stopping:
            try:
                async with websockets.connect(
                    url, ping_interval=20, ping_timeout=10, max_size=2**20
                ) as ws:
                    self.connected = True
                    backoff = 1.0
                    await self._subscribe(ws)
                    await self._emit_event("ws_connected", "info", {})
                    async for msg in ws:
                        try:
                            data = json.loads(msg)
                            self._handle(data)
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
                logger.exception("Hyperliquid WS unexpected error")
                await self._emit_event(
                    "ws_disconnected", "error", {"error": f"{type(e).__name__}: {e}"[:300]}
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    async def _subscribe(self, ws) -> None:
        coin = self.coin
        for sub in (
            {"method": "subscribe", "subscription": {"type": "l2Book", "coin": coin}},
            {"method": "subscribe", "subscription": {"type": "trades", "coin": coin}},
            {"method": "subscribe", "subscription": {"type": "activeAssetCtx", "coin": coin}},
        ):
            await ws.send(json.dumps(sub))

    def _handle(self, data: dict[str, Any]) -> None:
        channel = data.get("channel")
        d = data.get("data", {})
        st = self.store.get(self.venue, self.symbol)
        ts = now_ts()  # HL doesn't always carry server ts on every msg
        if channel == "l2Book":
            # data: { coin, levels: [bids[], asks[]], time }
            try:
                levels = d.get("levels") or [[], []]
                bids = [
                    [float(lvl["px"]), float(lvl["sz"])] for lvl in levels[0][:20]
                ]
                asks = [
                    [float(lvl["px"]), float(lvl["sz"])] for lvl in levels[1][:20]
                ]
                seq = int(d.get("time", 0))
                if "time" in d:
                    ts = float(d["time"]) / 1000.0
                st.update_book(bids, asks, seq, ts)
            except (KeyError, ValueError, TypeError):
                pass
        elif channel == "trades":
            # data: [ { coin, side, px, sz, time, hash, ... }, ... ]
            try:
                trades = d if isinstance(d, list) else [d]
                for tr in trades:
                    price = float(tr["px"])
                    size = float(tr["sz"])
                    ts_t = float(tr.get("time", 0)) / 1000.0 or now_ts()
                    st.on_trade(price, size, ts_t)
            except (KeyError, ValueError, TypeError):
                pass
        elif channel == "activeAssetCtx":
            try:
                ctx = d.get("ctx") if isinstance(d, dict) else None
                if isinstance(ctx, dict):
                    if "funding" in ctx:
                        st.funding_rate_8h = float(ctx["funding"])
                    if "openInterest" in ctx and "markPx" in ctx:
                        oi = float(ctx["openInterest"])
                        mark = float(ctx["markPx"])
                        st.open_interest_usd = oi * mark
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
