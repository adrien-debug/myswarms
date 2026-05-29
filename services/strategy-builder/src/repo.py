"""Strategy Builder repo."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

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

    async def claim_signals_ready_job(self, worker_id: str) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    select id, tenant_id, request_id, attempts
                    from hedge_run_jobs
                    where plane = 'builder' and status = 'signals_ready'
                    order by updated_at
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
                return dict(row)

    async def fetch_request(self, tenant_id: UUID, request_id: UUID) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                select tenant_id, user_id, request_id, intent_type, raw_intent, normalized
                from hedge_strategy_requests
                where tenant_id = $1 and request_id = $2
                """,
                tenant_id,
                request_id,
            )
            return dict(row) if row else None

    async def fetch_signals(self, tenant_id: UUID, request_id: UUID) -> list[dict[str, Any]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                select id, agent, status, payload, confidence, model
                from hedge_swarm_signals
                where tenant_id = $1 and request_id = $2
                """,
                tenant_id,
                request_id,
            )
            return [_decode(dict(r)) for r in rows]

    async def write_spec_and_advance(
        self,
        *,
        spec_row: dict[str, Any],
        run_job_id: UUID,
        tenant_id: UUID,
        request_id: UUID,
        invalid: bool = False,
        validation_error: str | None = None,
    ) -> None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    insert into hedge_strategy_specs (
                        id, tenant_id, request_id, spec, spec_hash, signature,
                        signing_key_id, swarm_signals_ref, confidence, model,
                        langfuse_trace_id, status, validation_error,
                        prev_hash, row_hash
                    ) values (
                        $1,$2,$3,$4::jsonb,$5,$6,$7,$8::uuid[],$9,$10,$11,$12,$13,$14,$15
                    )
                    """,
                    spec_row["id"],
                    spec_row["tenant_id"],
                    spec_row["request_id"],
                    json.dumps(spec_row["spec"]),
                    spec_row["spec_hash"],
                    spec_row["signature"],
                    spec_row["signing_key_id"],
                    spec_row["swarm_signals_ref"],
                    spec_row["confidence"],
                    spec_row["model"],
                    spec_row.get("langfuse_trace_id"),
                    "spec_invalid" if invalid else "built",
                    validation_error,
                    spec_row.get("prev_hash"),
                    spec_row["row_hash"],
                )
                if invalid:
                    await conn.execute(
                        """
                        update hedge_run_jobs
                        set status='failed', plane='terminal',
                            locked_by=null, locked_at=null,
                            last_error=$1
                        where id=$2
                        """,
                        f"spec_invalid: {validation_error}"[:1000],
                        run_job_id,
                    )
                    kind = "spec_invalid"
                else:
                    await conn.execute(
                        """
                        update hedge_run_jobs
                        set status='spec_ready', plane='risk',
                            locked_by=null, locked_at=null
                        where id=$1
                        """,
                        run_job_id,
                    )
                    kind = "spec_ready"

                await conn.execute(
                    """
                    insert into hedge_run_events (tenant_id, request_id, kind, payload, produced_by)
                    values ($1, $2, $3, $4::jsonb, $5)
                    """,
                    tenant_id,
                    request_id,
                    kind,
                    json.dumps(
                        {
                            "spec_id": str(spec_row["id"]),
                            "confidence": spec_row["confidence"],
                            "model": spec_row["model"],
                        }
                    ),
                    "strategy-builder",
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
                    status = case
                       when attempts + 1 >= $2 then 'poisoned'
                       else 'signals_ready'
                    end
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
                values ($1, $2, 'failed', $3::jsonb, 'strategy-builder')
                """,
                tenant_id,
                request_id,
                json.dumps({"error": error[:500], "attempts": row["attempts"] if row else None}),
            )

    async def prev_hash_for_specs(self, tenant_id: UUID) -> str | None:
        async with self._pool.acquire() as conn:
            return await conn.fetchval(
                """
                select row_hash from hedge_strategy_specs
                where tenant_id = $1
                order by created_at desc
                limit 1
                """,
                tenant_id,
            )


def _decode(row: dict[str, Any]) -> dict[str, Any]:
    if isinstance(row.get("payload"), str):
        try:
            row["payload"] = json.loads(row["payload"])
        except Exception:
            pass
    return row
