"""Market Data Service repo — write snapshots + events (append-only)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

import asyncpg

logger = logging.getLogger(__name__)


class Repo:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def create(cls, dsn: str, *, min_size: int = 2, max_size: int = 6) -> "Repo":
        pool = await asyncpg.create_pool(dsn=dsn, min_size=min_size, max_size=max_size, statement_cache_size=0)
        return cls(pool)

    async def close(self) -> None:
        await self._pool.close()

    async def write_market_snapshot(
        self,
        *,
        id: UUID,
        venue: str,
        symbol: str,
        payload: dict[str, Any],
        timeframe: str,
        source_event_ts: datetime,
        source: str,
        signature: str,
        prev_hash: str | None,
        row_hash: str,
    ) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                insert into hedge_market_snapshots (
                    id, venue, symbol, payload, timeframe, source_event_ts,
                    source, signature, prev_hash, row_hash
                ) values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10)
                """,
                id,
                venue,
                symbol,
                json.dumps(payload),
                timeframe,
                source_event_ts,
                source,
                signature,
                prev_hash,
                row_hash,
            )

    async def write_orderbook_snapshot(
        self,
        *,
        id: UUID,
        venue: str,
        symbol: str,
        payload: dict[str, Any],
        source_event_ts: datetime,
        signature: str,
        prev_hash: str | None,
        row_hash: str,
    ) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                insert into hedge_orderbook_snapshots (
                    id, venue, symbol, payload, source_event_ts,
                    signature, prev_hash, row_hash
                ) values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
                """,
                id,
                venue,
                symbol,
                json.dumps(payload),
                source_event_ts,
                signature,
                prev_hash,
                row_hash,
            )

    async def write_market_event(
        self,
        *,
        venue: str,
        symbol: str | None,
        kind: str,
        severity: str,
        payload: dict[str, Any],
        source_event_ts: datetime | None = None,
    ) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                insert into hedge_market_events (
                    venue, symbol, kind, severity, payload, source_event_ts
                ) values ($1,$2,$3,$4,$5::jsonb,$6)
                """,
                venue,
                symbol,
                kind,
                severity,
                json.dumps(payload),
                source_event_ts,
            )

    async def prev_hash(self, table: str, venue: str, symbol: str) -> str | None:
        async with self._pool.acquire() as conn:
            return await conn.fetchval(
                f"select row_hash from {table} where venue=$1 and symbol=$2 order by taken_at desc limit 1",
                venue,
                symbol,
            )


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
