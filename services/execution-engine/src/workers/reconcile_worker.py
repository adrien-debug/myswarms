"""Reconcile worker.

Runs every N seconds (default 30). For each (tenant, venue) it knows about:

  1. Pulls venue-side open positions (read-only via adapter.fetch_positions).
  2. Pulls latest DB-side positions from hedge_portfolio_snapshots.
  3. Compares: same symbol+side, |size_diff| within tolerance.
  4. Writes a hedge_position_reconciliations row.
  5. On mismatch:
       a. INSERT hedge_execution_alerts(kind='reconcile_mismatch', severity='critical')
       b. AUTO-ARM tenant-level kill switch (hedge_kill_switches).
       c. INSERT hedge_audit_log entry.

We refuse to silently auto-correct anything. The only auto-action is a kill
switch — humans investigate.

Tenants known to this worker: read from hedge_tenant_risk_profiles (active=true).
"""

from __future__ import annotations

import asyncio
import json
import logging
import socket
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any
from uuid import UUID, uuid4

import asyncpg

from ..adapters import HyperliquidAdapter, VenueAdapter
from ..config import settings
from ..repo import _AUDIT_CHAIN_LOCK, compute_audit_row_hash

logger = logging.getLogger("execution-engine.reconcile")


class ReconcileWorker:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool
        cfg = settings()
        self.interval = cfg.reconcile_interval_seconds
        self.tol_abs = cfg.reconcile_tolerance_abs_usd
        self.tol_rel = cfg.reconcile_tolerance_rel
        self.worker_id = f"reconcile@{socket.gethostname()}"
        self.adapters: dict[str, VenueAdapter] = {
            "hyperliquid": HyperliquidAdapter(
                api_url=cfg.hyperliquid_api_url,
                account_address=cfg.hyperliquid_account_address,
                secret_key=cfg.hyperliquid_secret_key,
                dry_run=cfg.dry_run,
                timeout_seconds=cfg.order_send_timeout_seconds,
            ),
        }
        self.stopping = False

    async def run_forever(self) -> None:
        logger.info("Reconcile worker starting", extra={"interval": self.interval})
        while not self.stopping:
            try:
                await self._cycle()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Reconcile cycle error")
            await asyncio.sleep(self.interval)

    async def _cycle(self) -> None:
        tenants = await self._list_active_tenants()
        for tenant_id in tenants:
            for venue, adapter in self.adapters.items():
                try:
                    await self._reconcile_one(tenant_id=tenant_id, venue=venue, adapter=adapter)
                except Exception:
                    logger.exception("reconcile failed", extra={"tenant_id": str(tenant_id), "venue": venue})

    async def _list_active_tenants(self) -> list[UUID]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "select distinct tenant_id from hedge_tenant_risk_profiles where active = true"
            )
            return [r["tenant_id"] for r in rows]

    async def _reconcile_one(self, *, tenant_id: UUID, venue: str, adapter: VenueAdapter) -> None:
        # 1. Venue-side state.
        try:
            venue_positions: list[dict[str, Any]] = await getattr(adapter, "fetch_positions")()  # type: ignore[misc]
            venue_unreachable = False
        except Exception as e:
            logger.warning("Venue unreachable for reconcile: %s", e)
            venue_positions = []
            venue_unreachable = True

        # 2. DB-side state: latest portfolio snapshot positions.
        db_positions = await self._db_positions(tenant_id)

        # 3. Compare.
        diffs, worst = _diff_positions(venue_positions, db_positions)
        if venue_unreachable:
            status = "venue_unavailable"
        elif not diffs:
            status = "match"
        elif len(diffs) >= 1 and worst >= max(self.tol_abs, abs(_db_notional(db_positions)) * self.tol_rel):
            status = "mismatch"
        else:
            status = "partial"

        # 4. Write reconciliation row.
        remediation: dict[str, Any] = {}
        if status == "mismatch":
            kid = await self._auto_arm_kill_switch(tenant_id=tenant_id, reason="reconcile_mismatch")
            await self._emit_alert(
                tenant_id=tenant_id,
                venue=venue,
                kind="reconcile_mismatch",
                severity="critical",
                payload={"diff_count": len(diffs), "worst_diff_usd": worst, "diffs": diffs},
            )
            remediation = {"kill_switch_id": str(kid) if kid else None, "scope": "tenant"}
        elif status == "venue_unavailable":
            await self._emit_alert(
                tenant_id=tenant_id,
                venue=venue,
                kind="reconcile_unreachable",
                severity="warn",
                payload={},
            )

        await self._write_reconcile_row(
            tenant_id=tenant_id,
            venue=venue,
            venue_positions=venue_positions,
            db_positions=db_positions,
            diffs=diffs,
            status=status,
            worst=worst,
            remediation=remediation,
        )

    async def _db_positions(self, tenant_id: UUID) -> list[dict[str, Any]]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                select payload from hedge_portfolio_snapshots
                where tenant_id = $1
                order by taken_at desc limit 1
                """,
                tenant_id,
            )
            if row is None:
                return []
            payload = row["payload"]
            if isinstance(payload, str):
                payload = json.loads(payload)
            return payload.get("positions", []) or []

    async def _auto_arm_kill_switch(self, *, tenant_id: UUID, reason: str) -> UUID | None:
        # CHAÎNE GLOBALE : tout dans UNE transaction. Advisory xact lock global
        # (même id que repo.signature_failure_audit) → sérialise TOUS les writers
        # de hedge_audit_log, empêche les forks de chaîne au scale-out. fetch tail
        # GLOBAL (ORDER BY chain_seq DESC, aucun WHERE tenant_id), chain_seq =
        # prev_seq + 1, row_hash via compute_audit_row_hash partagé.
        audit_details = {"reason": reason}
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Clear existing tenant-level switches.
                await conn.execute(
                    """
                    update hedge_kill_switches
                    set active=false, cleared_at=now()
                    where scope='tenant' and tenant_id=$1 and active=true
                    """,
                    tenant_id,
                )
                row = await conn.fetchrow(
                    """
                    insert into hedge_kill_switches (scope, tenant_id, active, reason)
                    values ('tenant', $1, true, $2)
                    returning id
                    """,
                    tenant_id,
                    f"auto:{reason}",
                )
                await conn.execute(
                    "select pg_advisory_xact_lock(hashtext($1))",
                    _AUDIT_CHAIN_LOCK,
                )
                tail = await conn.fetchrow(
                    """
                    select chain_seq, row_hash from public.hedge_audit_log
                    order by chain_seq desc
                    limit 1
                    for update
                    """
                )
                prev_seq = tail["chain_seq"] if tail else 0
                prev_hash = tail["row_hash"] if tail else None
                chain_seq = prev_seq + 1
                row_hash = compute_audit_row_hash(
                    chain_seq=chain_seq,
                    prev_hash=prev_hash,
                    tenant_id=tenant_id,
                    actor_kind="system",
                    event_type="kill_switch.auto_set",
                    severity="critical",
                    source_service="execution-engine",
                    request_id=None,
                    details=audit_details,
                )
                await conn.execute(
                    """
                    insert into hedge_audit_log (
                        chain_seq, tenant_id, actor_kind, event_type, severity, details,
                        source_service, prev_hash, row_hash
                    ) values ($1, $2, 'system', 'kill_switch.auto_set', 'critical', $3::jsonb, 'execution-engine', $4, $5)
                    """,
                    chain_seq,
                    tenant_id,
                    json.dumps(audit_details),
                    prev_hash,
                    row_hash,
                )
                return row["id"] if row else None

    async def _emit_alert(
        self,
        *,
        tenant_id: UUID,
        venue: str,
        kind: str,
        severity: str,
        payload: dict,
    ) -> None:
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                insert into hedge_execution_alerts (tenant_id, venue, kind, severity, payload)
                values ($1, $2, $3, $4, $5::jsonb)
                """,
                tenant_id,
                venue,
                kind,
                severity,
                json.dumps(payload),
            )

    async def _write_reconcile_row(
        self,
        *,
        tenant_id: UUID,
        venue: str,
        venue_positions: list[dict[str, Any]],
        db_positions: list[dict[str, Any]],
        diffs: list[dict[str, Any]],
        status: str,
        worst: float,
        remediation: dict[str, Any],
    ) -> None:
        canonical = json.dumps(
            {"tenant": str(tenant_id), "venue": venue, "diffs": diffs, "status": status},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        row_hash = sha256(canonical).hexdigest()
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                insert into hedge_position_reconciliations (
                    id, tenant_id, venue, venue_positions, db_positions,
                    diffs, status, diff_count, worst_diff_usd, remediation,
                    cycle_at, row_hash
                ) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10::jsonb,$11,$12)
                """,
                uuid4(),
                tenant_id,
                venue,
                json.dumps(venue_positions),
                json.dumps(db_positions),
                json.dumps(diffs),
                status,
                len(diffs),
                worst,
                json.dumps(remediation),
                datetime.now(timezone.utc),
                row_hash,
            )


def _diff_positions(
    venue_positions: list[dict[str, Any]], db_positions: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], float]:
    """Returns (diffs[], worst_diff_usd)."""
    by_key_v = {(p.get("symbol"), p.get("side")): p for p in venue_positions}
    by_key_d = {(p.get("symbol"), p.get("side")): p for p in db_positions}
    keys = set(by_key_v.keys()) | set(by_key_d.keys())
    diffs: list[dict[str, Any]] = []
    worst = 0.0
    for k in keys:
        v = by_key_v.get(k, {})
        d = by_key_d.get(k, {})
        v_size = float(v.get("size") or 0)
        d_size = float(d.get("size") or 0)
        v_entry = float(v.get("entry") or 0)
        d_entry = float(d.get("entry") or 0)
        size_diff = v_size - d_size
        usd_diff = abs(size_diff) * (v_entry or d_entry)
        if abs(size_diff) > 1e-9:
            diffs.append(
                {
                    "symbol": k[0],
                    "side": k[1],
                    "venue_size": v_size,
                    "db_size": d_size,
                    "diff_size": size_diff,
                    "diff_usd": usd_diff,
                    "venue_entry": v_entry,
                    "db_entry": d_entry,
                }
            )
            worst = max(worst, usd_diff)
    return diffs, worst


def _db_notional(positions: list[dict[str, Any]]) -> float:
    return sum(abs(float(p.get("size") or 0)) * float(p.get("entry") or 0) for p in positions)
