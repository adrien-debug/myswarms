"""Risk Engine DB repository.

Hot paths only. All reads are tenant-scoped; we use service_role for writes
because workers are cross-tenant. The tenant boundary is enforced by the row
contents (every INSERT carries tenant_id from the upstream payload).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg

logger = logging.getLogger(__name__)


class Repo:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def create(cls, dsn: str, *, min_size: int = 2, max_size: int = 10, command_timeout: float = 10.0) -> "Repo":
        pool = await asyncpg.create_pool(
            dsn=dsn, min_size=min_size, max_size=max_size,
            statement_cache_size=0, command_timeout=command_timeout,
            max_inactive_connection_lifetime=300.0,
        )
        return cls(pool)

    async def close(self) -> None:
        await self._pool.close()

    # ---------- Worker job poll ----------

    async def claim_spec_ready_job(self, worker_id: str) -> dict[str, Any] | None:
        """Atomically claim one run_job that's ready for risk evaluation."""
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    select id, tenant_id, request_id, attempts
                    from hedge_run_jobs
                    where plane = 'risk' and status = 'spec_ready'
                    order by updated_at
                    for update skip locked
                    limit 1
                    """
                )
                if row is None:
                    return None
                await conn.execute(
                    """
                    update hedge_run_jobs
                    set locked_by = $1, locked_at = now()
                    where id = $2
                    """,
                    worker_id,
                    row["id"],
                )
                return dict(row)

    # ---------- Reads ----------

    async def fetch_spec(self, tenant_id: UUID, request_id: UUID) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            return await _row(
                await conn.fetchrow(
                    """
                    select id, tenant_id, request_id, spec, spec_hash, signature,
                           signing_key_id, status, validation_error
                    from hedge_strategy_specs
                    where tenant_id = $1 and request_id = $2
                    """,
                    tenant_id,
                    request_id,
                )
            )

    async def fetch_latest_portfolio(self, tenant_id: UUID) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            return await _row(
                await conn.fetchrow(
                    """
                    select id, tenant_id, payload, signature, taken_at
                    from hedge_portfolio_snapshots
                    where tenant_id = $1
                    order by taken_at desc
                    limit 1
                    """,
                    tenant_id,
                )
            )

    async def fetch_active_risk_profile(self, tenant_id: UUID) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            return await _row(
                await conn.fetchrow(
                    """
                    select id, tenant_id, version, cvar_99_max_pct, kelly_cap,
                           max_leverage, max_drawdown_pct, atr_vol_target_pct,
                           per_asset_notional_cap_usd, daily_loss_limit_usd,
                           allowed_venues, allowed_assets
                    from hedge_tenant_risk_profiles
                    where tenant_id = $1 and active = true
                    order by version desc
                    limit 1
                    """,
                    tenant_id,
                )
            )

    async def is_blocked(self, tenant_id: UUID, venue: str) -> bool:
        async with self._pool.acquire() as conn:
            v = await conn.fetchval("select hedge_is_blocked($1, $2)", tenant_id, venue)
            return bool(v)

    async def outbox_pending_count(self, tenant_id: UUID) -> int:
        async with self._pool.acquire() as conn:
            return int(await conn.fetchval(
                """
                select count(*) from hedge_exec_orders_outbox
                where tenant_id = $1 and status in ('pending', 'locked')
                """,
                tenant_id,
            ))

    async def fetch_latest_market_snapshot(
        self, *, venue: str, symbol: str, timeframe: str = "1m"
    ) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                select id, venue, symbol, payload, timeframe, taken_at,
                       source_event_ts, signature
                from hedge_market_snapshots
                where venue = $1 and symbol = $2 and timeframe = $3
                order by taken_at desc
                limit 1
                """,
                venue,
                symbol,
                timeframe,
            )
            return await _row(row)

    async def fetch_latest_orderbook(
        self, *, venue: str, symbol: str
    ) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                select id, venue, symbol, payload, taken_at, source_event_ts
                from hedge_orderbook_snapshots
                where venue = $1 and symbol = $2
                order by taken_at desc
                limit 1
                """,
                venue,
                symbol,
            )
            return await _row(row)

    # ---------- Writes ----------

    async def write_decision_and_outbox(
        self,
        *,
        decision_row: dict[str, Any],
        outbox_rows: list[dict[str, Any]],
        run_job_id: UUID,
        terminal: bool,
        event_payload: dict[str, Any],
    ) -> None:
        """Single transaction: decision + outbox + run_job status + run_event."""
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    insert into hedge_risk_decisions (
                        id, tenant_id, request_id, spec_id, portfolio_snapshot_id,
                        risk_profile_id, decision, reason_codes, rules_eval,
                        sized_orders, decision_ttl_seconds, expires_at,
                        signature, signing_key_id, engine_version,
                        computed_at, prev_hash, row_hash
                    ) values (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,
                        $13,$14,$15,$16,$17,$18
                    )
                    """,
                    decision_row["id"],
                    decision_row["tenant_id"],
                    decision_row["request_id"],
                    decision_row["spec_id"],
                    decision_row["portfolio_snapshot_id"],
                    decision_row["risk_profile_id"],
                    decision_row["decision"],
                    decision_row["reason_codes"],
                    json.dumps(decision_row["rules_eval"]),
                    json.dumps(decision_row["sized_orders"]),
                    decision_row["decision_ttl_seconds"],
                    decision_row["expires_at"],
                    decision_row["signature"],
                    decision_row["signing_key_id"],
                    decision_row["engine_version"],
                    decision_row["computed_at"],
                    decision_row["prev_hash"],
                    decision_row["row_hash"],
                )

                for row in outbox_rows:
                    await conn.execute(
                        """
                        insert into hedge_exec_orders_outbox (
                            id, tenant_id, request_id, decision_id, leg_index,
                            order_payload, client_order_id, status, ttl_at,
                            signature, prev_hash, row_hash
                        ) values (
                            $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12
                        )
                        """,
                        row["id"],
                        row["tenant_id"],
                        row["request_id"],
                        row["decision_id"],
                        row["leg_index"],
                        json.dumps(row["order_payload"]),
                        row["client_order_id"],
                        row["status"],
                        row["ttl_at"],
                        row["signature"],
                        row["prev_hash"],
                        row["row_hash"],
                    )

                new_status = "done" if terminal else "decided"
                new_plane = "terminal" if terminal else "exec"
                await conn.execute(
                    """
                    update hedge_run_jobs
                    set status = $1, plane = $2, locked_by = null, locked_at = null
                    where id = $3
                    """,
                    new_status,
                    new_plane,
                    run_job_id,
                )

                await conn.execute(
                    """
                    insert into hedge_run_events (
                        tenant_id, request_id, kind, payload, produced_by
                    ) values ($1,$2,$3,$4::jsonb,$5)
                    """,
                    decision_row["tenant_id"],
                    decision_row["request_id"],
                    "risk_decided",
                    json.dumps(event_payload),
                    "risk-engine",
                )

    async def mark_job_failed(
        self,
        *,
        run_job_id: UUID,
        error: str,
        attempts_increment: int = 1,
        poison_after: int = 3,
        tenant_id: UUID,
        request_id: UUID,
    ) -> None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                update hedge_run_jobs
                set attempts = attempts + $1,
                    last_error = $2,
                    locked_by = null,
                    locked_at = null,
                    status = case when attempts + $1 >= $3 then 'poisoned' else status end
                where id = $4
                returning attempts, status
                """,
                attempts_increment,
                error[:1000],
                poison_after,
                run_job_id,
            )
            # "failed" toujours — "poisoned" est un job status, pas un run_event kind
            kind = "failed"
            await conn.execute(
                """
                insert into hedge_run_events (tenant_id, request_id, kind, payload, produced_by)
                values ($1, $2, $3, $4::jsonb, $5)
                """,
                tenant_id,
                request_id,
                kind,
                json.dumps({"error": error[:500], "attempts": row["attempts"] if row else None}),
                "risk-engine",
            )

    # Map: table → colonne timestamp à utiliser pour le tri prev_hash chain.
    # (les tables HEDGE n'ont pas toutes `created_at` ; certaines ont `computed_at`,
    # `taken_at`, `submitted_at` selon leur sémantique métier).
    # NOTE: hedge_audit_log est ABSENTE volontairement — sa chaîne est GLOBALE
    # (ordonnée par chain_seq sous pg_advisory_xact_lock), écrite exclusivement
    # par execution-engine/repo.py + reconcile_worker.py. Un fetch tail per-tenant
    # trié par created_at (ce que ferait cette méthode) contournerait l'advisory
    # lock et forkerait la chaîne → interdit (cf. garde-fou ci-dessous).
    _TIMESTAMP_COL = {
        "hedge_strategy_requests": "created_at",
        "hedge_swarm_signals": "created_at",
        "hedge_strategy_specs": "created_at",
        "hedge_portfolio_snapshots": "taken_at",
        "hedge_tenant_risk_profiles": "created_at",
        "hedge_risk_decisions": "computed_at",
        "hedge_exec_orders_outbox": "created_at",
        "hedge_execution_reports": "submitted_at",
        "hedge_market_snapshots": "taken_at",
        "hedge_orderbook_snapshots": "taken_at",
        "hedge_position_reconciliations": "cycle_at",
    }

    async def prev_hash_for_table(self, table: str, tenant_id: UUID) -> str | None:
        """Fetch latest row_hash for hash chain (per tenant scope)."""
        if table == "hedge_audit_log":
            raise RuntimeError(
                "hedge_audit_log uses a GLOBAL chain_seq chain (advisory-locked) — "
                "never fetch its prev_hash per-tenant here; write via execution-engine."
            )
        ts_col = self._TIMESTAMP_COL.get(table, "created_at")
        async with self._pool.acquire() as conn:
            return await conn.fetchval(
                f"""
                select row_hash from {table}
                where tenant_id = $1
                order by {ts_col} desc nulls last
                limit 1
                """,
                tenant_id,
            )

    # ---------- Kill switches (control table — mutable by design) ----------

    async def arm_kill_switch(
        self, *, scope: str = "global", tenant_id: UUID | None = None,
        venue: str | None = None, reason: str | None = None,
    ) -> str:
        """Arm a kill switch. Clears any existing active switch in the same
        scope first (the unique partial index forbids two active rows)."""
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                # Clear existing active switch in the same scope slot.
                await conn.execute(
                    """
                    update hedge_kill_switches set active = false, cleared_at = now()
                    where active = true and scope = $1
                      and tenant_id is not distinct from $2
                      and venue is not distinct from $3
                    """,
                    scope, tenant_id, venue,
                )
                row = await conn.fetchrow(
                    """
                    insert into hedge_kill_switches (scope, tenant_id, venue, active, reason)
                    values ($1, $2, $3, true, $4)
                    returning id
                    """,
                    scope, tenant_id, venue, reason,
                )
                return str(row["id"])

    async def clear_kill_switches(
        self, *, scope: str | None = None, tenant_id: UUID | None = None,
        venue: str | None = None, exclude_auto: bool = True,
    ) -> int:
        """Clear (deactivate) active kill switches. Returns the number cleared.

        exclude_auto=True (default) refuses to clear switches auto-armed by the
        reconcile worker (reason LIKE 'auto:%') — those protect against a
        venue/DB position divergence and must be lifted only after a human
        investigation. Pass exclude_auto=False (force) to clear them too."""
        clauses = ["active = true"]
        params: list = []
        if scope is not None:
            params.append(scope); clauses.append(f"scope = ${len(params)}")
        if tenant_id is not None:
            params.append(tenant_id); clauses.append(f"tenant_id = ${len(params)}")
        if venue is not None:
            params.append(venue); clauses.append(f"venue = ${len(params)}")
        if exclude_auto:
            clauses.append("(reason is null or reason not like 'auto:%')")
        where = " and ".join(clauses)
        async with self._pool.acquire() as conn:
            res = await conn.execute(
                f"update hedge_kill_switches set active = false, cleared_at = now() where {where}",
                *params,
            )
            # res like "UPDATE 3"
            try:
                return int(res.split()[-1])
            except (ValueError, IndexError):
                return 0

    async def list_active_kill_switches(self) -> list[dict[str, Any]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "select id, scope, tenant_id, venue, reason, set_at from hedge_kill_switches where active = true order by set_at desc"
            )
            return [dict(r) for r in rows]


async def _row(record: asyncpg.Record | None) -> dict[str, Any] | None:
    if record is None:
        return None
    out: dict[str, Any] = {}
    for k, v in dict(record).items():
        if isinstance(v, str) and k in (
            "spec",
            "payload",
            "rules_eval",
            "sized_orders",
            "order_payload",
        ):
            try:
                out[k] = json.loads(v)
                continue
            except Exception:
                pass
        out[k] = v
    return out


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
