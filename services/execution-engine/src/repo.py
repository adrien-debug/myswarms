"""Execution Engine repository — outbox poll + report writes."""

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

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool

    @classmethod
    async def create(cls, dsn: str, *, min_size: int = 2, max_size: int = 10) -> "Repo":
        pool = await asyncpg.create_pool(dsn=dsn, min_size=min_size, max_size=max_size, statement_cache_size=0)
        return cls(pool)

    async def close(self) -> None:
        await self._pool.close()

    # ---------- Outbox claim ----------

    async def claim_pending_order(self, worker_id: str) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    select id, tenant_id, request_id, decision_id, leg_index,
                           order_payload, client_order_id, signature, ttl_at, attempts
                    from hedge_exec_orders_outbox
                    where status = 'pending'
                      and ttl_at > now()
                    order by created_at
                    for update skip locked
                    limit 1
                    """
                )
                if row is None:
                    # Mark TTL-expired rows in passing.
                    await conn.execute(
                        """
                        update hedge_exec_orders_outbox
                        set status = 'expired'
                        where status = 'pending' and ttl_at <= now()
                        """
                    )
                    return None
                await conn.execute(
                    """
                    update hedge_exec_orders_outbox
                    set status = 'locked', locked_by = $1, locked_at = now()
                    where id = $2
                    """,
                    worker_id,
                    row["id"],
                )
                return _decode(dict(row))

    # ---------- Verification context ----------

    async def fetch_decision(self, decision_id: UUID) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                select id, tenant_id, request_id, decision, sized_orders,
                       expires_at, signature, signing_key_id, engine_version
                from hedge_risk_decisions
                where id = $1
                """,
                decision_id,
            )
            return _decode(dict(row)) if row else None

    async def is_blocked(self, tenant_id: UUID, venue: str) -> bool:
        async with self._pool.acquire() as conn:
            v = await conn.fetchval("select hedge_is_blocked($1, $2)", tenant_id, venue)
            return bool(v)

    # ---------- Write attempts ----------

    async def write_execution_attempt(
        self,
        *,
        outbox_id: UUID,
        decision_id: UUID,
        tenant_id: UUID,
        request_id: UUID,
        venue: str,
        symbol: str,
        side: str,
        requested_size: float,
        client_order_id: str,
        attempt: dict[str, Any],
        dry_run: bool,
        next_outbox_status: str,           # 'sent' | 'failed' | 'dlq'
        last_error: str | None,
        row_hash: str,
        prev_hash: str | None,
    ) -> None:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    insert into hedge_execution_reports (
                        id, tenant_id, request_id, outbox_id, decision_id,
                        venue, symbol, client_order_id, venue_order_id,
                        status, side, requested_size, filled_size,
                        avg_fill_price, fees_usd, venue_response,
                        error_code, error_message, latency_ms, dry_run,
                        submitted_at, prev_hash, row_hash
                    ) values (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21,$22,$23
                    )
                    """,
                    uuid4(),
                    tenant_id,
                    request_id,
                    outbox_id,
                    decision_id,
                    venue,
                    symbol,
                    client_order_id,
                    attempt.get("venue_order_id"),
                    attempt["status"],
                    side,
                    requested_size,
                    attempt.get("filled_size"),
                    attempt.get("avg_fill_price"),
                    attempt.get("fees_usd"),
                    json.dumps(attempt.get("venue_response") or {}),
                    attempt.get("error_code"),
                    attempt.get("error_message"),
                    attempt.get("latency_ms"),
                    dry_run,
                    datetime.now(timezone.utc),
                    prev_hash,
                    row_hash,
                )
                await conn.execute(
                    """
                    update hedge_exec_orders_outbox
                    set status = $1,
                        attempts = attempts + 1,
                        last_error = $2,
                        locked_by = null,
                        locked_at = null
                    where id = $3
                    """,
                    next_outbox_status,
                    last_error[:1000] if last_error else None,
                    outbox_id,
                )
                # Bump the run_job too if this leg completes the run.
                # (For multi-leg, we'd track per-leg state; v0.1 = single leg.)
                if next_outbox_status in ("sent", "failed", "dlq"):
                    await conn.execute(
                        """
                        update hedge_run_jobs
                        set status = case when $1 = 'sent' then 'executed' else 'failed' end,
                            plane = 'terminal'
                        where tenant_id = $2 and request_id = $3
                        """,
                        next_outbox_status,
                        tenant_id,
                        request_id,
                    )
                await conn.execute(
                    """
                    insert into hedge_run_events (tenant_id, request_id, kind, payload, produced_by)
                    values ($1, $2, $3, $4::jsonb, $5)
                    """,
                    tenant_id,
                    request_id,
                    "exec_report",
                    json.dumps(
                        {
                            "status": attempt["status"],
                            "client_order_id": client_order_id,
                            "venue_order_id": attempt.get("venue_order_id"),
                            "latency_ms": attempt.get("latency_ms"),
                            "dry_run": dry_run,
                        }
                    ),
                    "execution-engine",
                )

    async def signature_failure_audit(
        self,
        *,
        tenant_id: UUID,
        request_id: UUID,
        outbox_id: UUID,
        reason: str,
    ) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                insert into hedge_audit_log (
                    tenant_id, actor_kind, event_type, severity, details,
                    request_id, source_service, prev_hash, row_hash
                ) values ($1, 'service', $2, 'critical', $3::jsonb, $4, 'execution-engine', null, $5)
                """,
                tenant_id,
                "signature.invalid",
                json.dumps({"outbox_id": str(outbox_id), "reason": reason}),
                request_id,
                _hash({"outbox_id": str(outbox_id), "reason": reason}),
            )
            await conn.execute(
                """
                update hedge_exec_orders_outbox
                set status = 'failed', last_error = $1, locked_by = null, locked_at = null
                where id = $2
                """,
                f"signature_invalid: {reason}"[:500],
                outbox_id,
            )

    async def prev_hash_for_reports(self, tenant_id: UUID) -> str | None:
        async with self._pool.acquire() as conn:
            return await conn.fetchval(
                """
                select row_hash from hedge_execution_reports
                where tenant_id = $1
                order by submitted_at desc
                limit 1
                """,
                tenant_id,
            )


def _decode(row: dict[str, Any]) -> dict[str, Any]:
    for k in ("order_payload", "sized_orders", "venue_response"):
        if isinstance(row.get(k), str):
            try:
                row[k] = json.loads(row[k])
            except Exception:
                pass
    return row


def _hash(payload: dict[str, Any]) -> str:
    import hashlib
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
