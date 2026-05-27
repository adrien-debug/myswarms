"""Snapshot worker.

Reads current StateStore values on a fixed interval and writes them to DB,
signed with MARKET_SIGNING_KEY.

Two cadences:
  - market snapshots: every market_snapshot_interval_seconds
  - orderbook snapshots: every orderbook_snapshot_interval_seconds (faster)
  - market_events: drained from each ingester's queue continuously

WS silence detection:
  if (now - state.last_event_ts) > rest_fallback_after_ws_silence_seconds
    → emit 'snapshot_stale' event AND skip writing a snapshot (do NOT write
      stale data; downstream Risk will reject naturally on freshness).
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime, timezone
from typing import Iterable
from uuid import uuid4

sys.path.append("/app/shared/hmac/python")
sys.path.append("../../shared/hmac/python")

from hedge_hmac import SigningContext, payload_hash_hex  # type: ignore  # noqa: E402

from ..config import settings
from ..ingesters import INGESTERS
from ..ingesters.base import Ingester
from ..repo import Repo
from ..state import StateStore, now_ts

logger = logging.getLogger("market-data.snapshot-worker")


class SnapshotWorker:
    def __init__(self, repo: Repo, store: StateStore, ingesters: list[Ingester]) -> None:
        self.repo = repo
        self.store = store
        self.ingesters = ingesters
        cfg = settings()
        self.market_interval = cfg.market_snapshot_interval_seconds
        self.book_interval = cfg.orderbook_snapshot_interval_seconds
        self.ws_silence_threshold = cfg.rest_fallback_after_ws_silence_seconds
        self.keys = SigningContext.from_env("MARKET_SIGNING_KEY")
        self.stopping = False

    async def run_forever(self) -> None:
        await asyncio.gather(
            self._market_loop(),
            self._book_loop(),
            self._events_loop(),
        )

    async def _market_loop(self) -> None:
        while not self.stopping:
            try:
                await self._snapshot_market()
            except Exception:
                logger.exception("market snapshot loop error")
            await asyncio.sleep(self.market_interval)

    async def _book_loop(self) -> None:
        while not self.stopping:
            try:
                await self._snapshot_books()
            except Exception:
                logger.exception("book snapshot loop error")
            await asyncio.sleep(self.book_interval)

    async def _events_loop(self) -> None:
        while not self.stopping:
            drained = 0
            for ing in self.ingesters:
                q = getattr(ing, "events_queue", None)
                if q is None:
                    continue
                while True:
                    try:
                        evt = q.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                    try:
                        await self.repo.write_market_event(
                            venue=evt["venue"],
                            symbol=evt.get("symbol"),
                            kind=evt["kind"],
                            severity=evt["severity"],
                            payload=evt.get("payload", {}),
                        )
                        drained += 1
                    except Exception:
                        logger.exception("Failed to write market event")
            if drained == 0:
                await asyncio.sleep(0.25)
            else:
                await asyncio.sleep(0.05)

    async def _snapshot_market(self) -> None:
        now = now_ts()
        for st in self.store.all():
            age = now - st.last_event_ts if st.last_event_ts > 0 else float("inf")
            if age > self.ws_silence_threshold:
                # No fresh data → emit stale event, do not write a stale snapshot.
                await self.repo.write_market_event(
                    venue=st.venue,
                    symbol=st.symbol,
                    kind="snapshot_stale",
                    severity="warn",
                    payload={"age_seconds": round(age, 2)},
                )
                continue

            payload = st.market_snapshot_payload()
            if payload["mid_price"] <= 0:
                continue   # not yet warmed up

            sig_payload = {
                "venue": st.venue,
                "symbol": st.symbol,
                "timeframe": "1m",
                "payload_hash": payload_hash_hex(payload),
            }
            signature = self.keys.sign(sig_payload)
            prev = await self.repo.prev_hash("hedge_market_snapshots", st.venue, st.symbol)
            row_hash = payload_hash_hex({"prev_hash": prev or "", **sig_payload})

            try:
                await self.repo.write_market_snapshot(
                    id=uuid4(),
                    venue=st.venue,
                    symbol=st.symbol,
                    payload=payload,
                    timeframe="1m",
                    source_event_ts=datetime.fromtimestamp(st.last_event_ts, tz=timezone.utc),
                    source="ws_ingest",
                    signature=signature,
                    prev_hash=prev,
                    row_hash=row_hash,
                )
            except Exception:
                logger.exception("Failed to insert market snapshot")

    async def _snapshot_books(self) -> None:
        now = now_ts()
        for st in self.store.all():
            if not st.orderbook_bids or not st.orderbook_asks:
                continue
            age = now - st.last_event_ts
            if age > self.ws_silence_threshold:
                continue
            payload = st.orderbook_snapshot_payload()
            sig_payload = {
                "venue": st.venue,
                "symbol": st.symbol,
                "seq": payload["seq"],
                "mid": payload["mid"],
            }
            signature = self.keys.sign(sig_payload)
            prev = await self.repo.prev_hash("hedge_orderbook_snapshots", st.venue, st.symbol)
            row_hash = payload_hash_hex({"prev_hash": prev or "", **sig_payload})
            try:
                await self.repo.write_orderbook_snapshot(
                    id=uuid4(),
                    venue=st.venue,
                    symbol=st.symbol,
                    payload=payload,
                    source_event_ts=datetime.fromtimestamp(st.last_event_ts, tz=timezone.utc),
                    signature=signature,
                    prev_hash=prev,
                    row_hash=row_hash,
                )
            except Exception:
                logger.exception("Failed to insert orderbook snapshot")
