"""Swarm Orchestrator repo."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID, uuid4

import asyncpg

logger = logging.getLogger(__name__)


class Repo:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def create(cls, dsn: str, *, min_size: int = 2, max_size: int = 8) -> "Repo":
        pool = await asyncpg.create_pool(dsn=dsn, min_size=min_size, max_size=max_size, statement_cache_size=0)
        return cls(pool)

    async def close(self) -> None:
        await self._pool.close()

    async def claim_queued_job(self, worker_id: str) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    select id, tenant_id, request_id, attempts
                    from hedge_run_jobs
                    where plane = 'swarm' and status = 'queued'
                    order by created_at
                    for update skip locked
                    limit 1
                    """
                )
                if row is None:
                    return None
                await conn.execute(
                    "update hedge_run_jobs set locked_by=$1, locked_at=now() where id=$2",
                    worker_id,
                    row["id"],
                )
                # Emit signals_started.
                await conn.execute(
                    """
                    insert into hedge_run_events (tenant_id, request_id, kind, payload, produced_by)
                    values ($1, $2, 'signals_started', '{}'::jsonb, 'swarm-orchestrator')
                    """,
                    row["tenant_id"],
                    row["request_id"],
                )
                return dict(row)

    async def fetch_request(self, tenant_id: UUID, request_id: UUID) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                select tenant_id, request_id, raw_intent, normalized, context
                from hedge_strategy_requests
                where tenant_id = $1 and request_id = $2
                """,
                tenant_id,
                request_id,
            )
            return _decode(dict(row)) if row else None

    async def write_signals_and_advance(
        self,
        *,
        run_job_id: UUID,
        tenant_id: UUID,
        request_id: UUID,
        signal_rows: list[dict[str, Any]],
        degraded: bool,
    ) -> None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                for row in signal_rows:
                    await conn.execute(
                        """
                        insert into hedge_swarm_signals (
                            id, tenant_id, request_id, agent, status,
                            payload, confidence, payload_hash, signature,
                            latency_ms, model, langfuse_trace_id,
                            prev_hash, row_hash
                        ) values (
                            $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14
                        )
                        on conflict (tenant_id, request_id, agent) do nothing
                        """,
                        row["id"],
                        row["tenant_id"],
                        row["request_id"],
                        row["agent"],
                        row["status"],
                        json.dumps(row["payload"]),
                        row["confidence"],
                        row["payload_hash"],
                        row["signature"],
                        row["latency_ms"],
                        row["model"],
                        row.get("langfuse_trace_id"),
                        row.get("prev_hash"),
                        row["row_hash"],
                    )
                await conn.execute(
                    """
                    update hedge_run_jobs
                    set status='signals_ready', plane='builder',
                        locked_by=null, locked_at=null
                    where id=$1
                    """,
                    run_job_id,
                )
                await conn.execute(
                    """
                    insert into hedge_run_events (tenant_id, request_id, kind, payload, produced_by)
                    values ($1, $2, 'signals_ready', $3::jsonb, 'swarm-orchestrator')
                    """,
                    tenant_id,
                    request_id,
                    json.dumps(
                        {
                            "agents_emitted": [r["agent"] for r in signal_rows],
                            "degraded": degraded,
                        }
                    ),
                )

    async def mark_job_failed(
        self,
        *,
        run_job_id: UUID,
        tenant_id: UUID,
        request_id: UUID,
        error: str,
        max_attempts: int,
    ) -> None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                update hedge_run_jobs
                set attempts = attempts + 1,
                    last_error = $1,
                    locked_by = null,
                    locked_at = null,
                    status = case when attempts + 1 >= $2 then 'poisoned' else 'queued' end
                where id = $3
                returning attempts, status
                """,
                error[:1000],
                max_attempts,
                run_job_id,
            )
            await conn.execute(
                """
                insert into hedge_run_events (tenant_id, request_id, kind, payload, produced_by)
                values ($1, $2, 'failed', $3::jsonb, 'swarm-orchestrator')
                """,
                tenant_id,
                request_id,
                json.dumps({"error": error[:500], "attempts": row["attempts"] if row else None}),
            )

    async def prev_hash_for_signals(self, tenant_id: UUID) -> str | None:
        async with self._pool.acquire() as conn:
            return await conn.fetchval(
                """
                select row_hash from hedge_swarm_signals
                where tenant_id = $1
                order by created_at desc
                limit 1
                """,
                tenant_id,
            )


def _decode(row: dict[str, Any]) -> dict[str, Any]:
    for k in ("normalized", "context"):
        if isinstance(row.get(k), str):
            try:
                row[k] = json.loads(row[k])
            except Exception:
                pass
    return row
