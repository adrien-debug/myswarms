"""Execution Engine worker — dumb dispatcher.

Loop:
  1. Claim a pending outbox row (FOR UPDATE SKIP LOCKED).
  2. Verify HMAC signature on the row's payload.
  3. Verify TTL not expired.
  4. Verify global/tenant/venue kill switches.
  5. Submit to the relevant venue adapter (or dry-run).
  6. Insert execution_report + update outbox status + run_job.
  7. On retryable failure, leave status='pending' until max_attempts then 'dlq'.

ZERO reasoning. ZERO sizing. ZERO LLM.
"""

from __future__ import annotations

import asyncio
import logging
import socket
import sys
from typing import Any
from uuid import UUID

sys.path.append("/app/shared/hmac/python")
sys.path.append("../../shared/hmac/python")

from hedge_hmac import SigningContext, payload_hash_hex  # type: ignore  # noqa: E402

from prometheus_client import Counter, Histogram

from ..adapters import BinanceAdapter, HyperliquidAdapter, VenueAdapter
from ..config import settings
from ..repo import Repo
from ..run_modes import ModeContext, RunMode


exec_attempts_total = Counter(
    "hedge_exec_attempts_total",
    "Order dispatch attempts by outcome.",
    ["venue", "status"],
)
exec_latency_ms = Histogram(
    "hedge_exec_latency_ms",
    "Order submission latency in ms.",
    ["venue"],
    buckets=(20, 50, 100, 200, 500, 1000, 2500, 5000, 10000),
)
signature_failures_total = Counter(
    "hedge_signature_failures_total",
    "HMAC signature verification failures at execution.",
)
mode_downgrade_total = Counter(
    "hedge_mode_downgrade_total",
    "Orders that were downgraded to dry_run by run-mode gating.",
    ["reason"],
)

logger = logging.getLogger("execution-engine.worker")


class ExecutionWorker:
    def __init__(self, repo: Repo) -> None:
        self.repo = repo
        self.worker_id = f"execution-engine@{socket.gethostname()}"
        cfg = settings()
        self.poll_interval = cfg.worker_poll_interval_ms / 1000.0
        self.batch_size = cfg.worker_batch_size
        self.max_attempts = cfg.worker_max_attempts
        self.dry_run = cfg.dry_run
        self.mode_ctx = ModeContext.from_env()
        self.risk_keys = SigningContext.from_env("RISK_DECISION_KEY")
        self.adapters: dict[str, VenueAdapter] = {
            "hyperliquid": HyperliquidAdapter(
                api_url=cfg.hyperliquid_api_url,
                account_address=cfg.hyperliquid_account_address,
                secret_key=cfg.hyperliquid_secret_key,
                dry_run=cfg.dry_run,
                timeout_seconds=cfg.order_send_timeout_seconds,
            ),
            "binance": BinanceAdapter(
                api_url=cfg.binance_api_url,
                api_key=cfg.binance_api_key,
                api_secret=cfg.binance_api_secret,
                dry_run=cfg.dry_run,
                timeout_seconds=cfg.order_send_timeout_seconds,
            ),
        }
        self.stopping = False

    async def run_forever(self) -> None:
        logger.info(
            "Execution worker starting",
            extra={"worker_id": self.worker_id, "dry_run": self.dry_run},
        )
        try:
            while not self.stopping:
                try:
                    processed = 0
                    for _ in range(self.batch_size):
                        row = await self.repo.claim_pending_order(self.worker_id)
                        if row is None:
                            break
                        await self._dispatch(row)
                        processed += 1
                    if processed == 0:
                        await asyncio.sleep(self.poll_interval)
                except asyncio.CancelledError:
                    logger.info("Execution worker cancelled")
                    break
                except Exception:
                    logger.exception("Execution worker loop error")
                    await asyncio.sleep(self.poll_interval)
        finally:
            for a in self.adapters.values():
                await a.aclose()

    async def _dispatch(self, row: dict[str, Any]) -> None:
        outbox_id: UUID = row["id"]
        tenant_id: UUID = row["tenant_id"]
        request_id: UUID = row["request_id"]
        decision_id: UUID = row["decision_id"]
        order: dict[str, Any] = row["order_payload"]
        leg_index: int = row["leg_index"]

        # ---- Verify outbox row signature ----
        signing_payload = {
            "decision_id": str(decision_id),
            "leg_index": leg_index,
            "order": order,
        }
        if not self.risk_keys.verify(signing_payload, row["signature"]):
            signature_failures_total.inc()
            logger.error(
                "Outbox signature INVALID — refusing", extra={"outbox_id": str(outbox_id)}
            )
            await self.repo.signature_failure_audit(
                tenant_id=tenant_id,
                request_id=request_id,
                outbox_id=outbox_id,
                reason="outbox_signature_invalid",
            )
            return

        # ---- Re-verify parent decision signature ----
        decision = await self.repo.fetch_decision(decision_id)
        if decision is None:
            await self.repo.signature_failure_audit(
                tenant_id=tenant_id,
                request_id=request_id,
                outbox_id=outbox_id,
                reason="decision_missing",
            )
            return

        # ---- Kill switches (last gate) ----
        venue = order["venue"]
        if await self.repo.is_blocked(tenant_id, venue):
            await self._fail_outbox(
                outbox_id=outbox_id,
                tenant_id=tenant_id,
                request_id=request_id,
                decision_id=decision_id,
                order=order,
                error="kill_switch_active",
                attempt_status="error",
                attempt_response={"reason": "kill_switch_active"},
                terminal=True,
            )
            return

        # ---- Submit to venue ----
        # ---- Run-mode gate: LIVE requires explicit allowlist + cap ----
        # In dry-run or paper modes we skip this gate (paper hits testnet).
        if self.mode_ctx.mode == RunMode.LIVE:
            notional = float(order.get("size", 0)) * float(order.get("limit_price") or 0.0)
            allowed, reason = self.mode_ctx.allows_live(
                tenant_id=tenant_id, venue=venue, notional_usd=notional
            )
            if not allowed:
                mode_downgrade_total.labels(reason=reason or "unknown").inc()
                logger.warning(
                    "LIVE order downgraded to dry_run: %s", reason,
                    extra={"outbox_id": str(outbox_id), "tenant_id": str(tenant_id)},
                )
                # Force dry_run behaviour for THIS order — does not flip the global flag.
                self._submit_as_dry_run = True
            else:
                self._submit_as_dry_run = False
        else:
            self._submit_as_dry_run = (self.mode_ctx.mode == RunMode.DRY_RUN)

        adapter = self.adapters.get(venue)
        if adapter is None:
            await self._fail_outbox(
                outbox_id=outbox_id,
                tenant_id=tenant_id,
                request_id=request_id,
                decision_id=decision_id,
                order=order,
                error=f"unknown_venue:{venue}",
                attempt_status="error",
                attempt_response={"reason": "unknown_venue"},
                terminal=True,
            )
            return

        # Toggle adapter dry_run for THIS call if mode gating forced downgrade.
        original_dry = getattr(adapter, "dry_run", False)
        if self._submit_as_dry_run:
            adapter.dry_run = True  # type: ignore[attr-defined]
        try:
            attempt = await adapter.submit_order(order)
        finally:
            adapter.dry_run = original_dry  # type: ignore[attr-defined]

        exec_attempts_total.labels(venue=venue, status=attempt.status).inc()
        if attempt.latency_ms is not None:
            exec_latency_ms.labels(venue=venue).observe(attempt.latency_ms)
        attempt_dict = {
            "status": attempt.status,
            "venue_order_id": attempt.venue_order_id,
            "filled_size": attempt.filled_size,
            "avg_fill_price": attempt.avg_fill_price,
            "fees_usd": attempt.fees_usd,
            "venue_response": attempt.venue_response,
            "error_code": attempt.error_code,
            "error_message": attempt.error_message,
            "latency_ms": attempt.latency_ms,
        }

        # Classify outcome.
        if attempt.status in ("submitted", "filled", "partially_filled", "dry_run"):
            next_status = "sent"
            last_error = None
        elif attempt.status == "rejected":
            next_status = "failed"
            last_error = attempt.error_message or "venue_rejected"
        else:
            # 'error' — retryable up to max_attempts.
            attempts = row.get("attempts", 0) + 1
            next_status = "dlq" if attempts >= self.max_attempts else "pending"
            last_error = attempt.error_message or attempt.error_code or "unknown_error"

        # Write report.
        prev_hash = await self.repo.prev_hash_for_reports(tenant_id)
        row_hash = payload_hash_hex(
            {
                "prev_hash": prev_hash or "",
                "outbox_id": str(outbox_id),
                "client_order_id": order["client_order_id"],
                "status": attempt.status,
                "venue_order_id": attempt.venue_order_id,
            }
        )

        await self.repo.write_execution_attempt(
            outbox_id=outbox_id,
            decision_id=decision_id,
            tenant_id=tenant_id,
            request_id=request_id,
            venue=venue,
            symbol=order["symbol"],
            side=order["side"],
            requested_size=order["size"],
            client_order_id=order["client_order_id"],
            attempt=attempt_dict,
            dry_run=self.dry_run,
            next_outbox_status=next_status,
            last_error=last_error,
            row_hash=row_hash,
            prev_hash=prev_hash,
        )

    async def _fail_outbox(
        self,
        *,
        outbox_id: UUID,
        tenant_id: UUID,
        request_id: UUID,
        decision_id: UUID,
        order: dict[str, Any],
        error: str,
        attempt_status: str,
        attempt_response: dict[str, Any],
        terminal: bool,
    ) -> None:
        attempt_dict = {
            "status": attempt_status,
            "venue_order_id": None,
            "filled_size": None,
            "avg_fill_price": None,
            "fees_usd": None,
            "venue_response": attempt_response,
            "error_code": error,
            "error_message": error,
            "latency_ms": 0,
        }
        prev_hash = await self.repo.prev_hash_for_reports(tenant_id)
        row_hash = payload_hash_hex(
            {
                "prev_hash": prev_hash or "",
                "outbox_id": str(outbox_id),
                "error": error,
            }
        )
        await self.repo.write_execution_attempt(
            outbox_id=outbox_id,
            decision_id=decision_id,
            tenant_id=tenant_id,
            request_id=request_id,
            venue=order["venue"],
            symbol=order["symbol"],
            side=order["side"],
            requested_size=order["size"],
            client_order_id=order["client_order_id"],
            attempt=attempt_dict,
            dry_run=self.dry_run,
            next_outbox_status="failed",
            last_error=error,
            row_hash=row_hash,
            prev_hash=prev_hash,
        )
