"""Risk Engine worker loop.

Single responsibility: poll run_jobs(plane='risk', status='spec_ready'),
evaluate, write decision + outbox in one transaction, advance the run.

NO LLM. NO exchange calls. NO direct user input. Pure DB→DB.
"""

from __future__ import annotations

import asyncio
import json
import logging
import socket
import sys
from datetime import datetime, timezone
from uuid import UUID, uuid4

# Make shared/ importable when running as a service.
sys.path.append("/app/shared/hmac/python")
sys.path.append("../../shared/hmac/python")

from hedge_hmac import SigningContext, payload_hash_hex  # type: ignore  # noqa: E402

from .. import __version__ as engine_version  # type: ignore
from ..config import settings
from ..evaluator import evaluate
from ..market import MarketContext, build_context
from ..models import PortfolioSnapshot, StrategySpec, TenantRiskProfile
from ..repo import Repo, now_utc

logger = logging.getLogger("risk-engine.worker")


def _symbol_for(*, venue: str, asset: str, quote: str) -> str:
    """Canonical (venue, asset) → symbol mapping. Used by the worker before
    fetching market snapshots. Also defined in evaluator.py for the pure-fn
    code path — keep them in sync."""
    if venue == "hyperliquid":
        return f"{asset}-USD"
    if venue == "binance":
        return f"{asset}{quote}"
    if venue == "bybit":
        return f"{asset}{quote}"
    raise ValueError(f"Unknown venue: {venue}")


class RiskWorker:
    def __init__(self, repo: Repo) -> None:
        self.repo = repo
        self.worker_id = f"risk-engine@{socket.gethostname()}"
        cfg = settings()
        self.strategy_keys = SigningContext.from_env("STRATEGY_SIGNING_KEY")
        self.risk_keys = SigningContext.from_env("RISK_DECISION_KEY")
        self.portfolio_max_age = cfg.portfolio_max_age_seconds
        self.decision_ttl = cfg.decision_default_ttl_seconds
        self.poll_interval = cfg.worker_poll_interval_ms / 1000.0
        self.batch_size = cfg.worker_batch_size
        self.stopping = False
        self.market_max_age = cfg.market_max_age_seconds
        self.log_returns_min = cfg.log_returns_min
        self.spread_bps_max = cfg.spread_bps_max
        self.min_depth_usd = cfg.min_depth_usd
        self.slippage_bps_max = cfg.slippage_bps_max

    async def run_forever(self) -> None:
        logger.info("Risk worker starting", extra={"worker_id": self.worker_id})
        while not self.stopping:
            try:
                processed = 0
                for _ in range(self.batch_size):
                    job = await self.repo.claim_spec_ready_job(self.worker_id)
                    if job is None:
                        break
                    await self._process(job)
                    processed += 1
                if processed == 0:
                    await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                logger.info("Risk worker cancelled")
                break
            except Exception:
                logger.exception("Risk worker loop error")
                await asyncio.sleep(self.poll_interval)

    async def _process(self, job: dict) -> None:
        tenant_id: UUID = job["tenant_id"]
        request_id: UUID = job["request_id"]
        run_job_id: UUID = job["id"]
        logger.info(
            "Processing risk job",
            extra={"tenant_id": str(tenant_id), "request_id": str(request_id)},
        )

        try:
            await self._evaluate_and_write(
                tenant_id=tenant_id, request_id=request_id, run_job_id=run_job_id
            )
        except Exception as e:
            logger.exception("Risk evaluation failed")
            await self.repo.mark_job_failed(
                run_job_id=run_job_id,
                error=f"{type(e).__name__}: {e}",
                tenant_id=tenant_id,
                request_id=request_id,
            )

    async def _evaluate_and_write(
        self, *, tenant_id: UUID, request_id: UUID, run_job_id: UUID
    ) -> None:
        spec_row = await self.repo.fetch_spec(tenant_id, request_id)
        if spec_row is None:
            raise RuntimeError(f"No strategy_spec for {tenant_id}/{request_id}")
        if spec_row.get("status") == "spec_invalid":
            # Builder already marked it invalid → REJECT path.
            await self._write_short_circuit_reject(
                tenant_id=tenant_id,
                request_id=request_id,
                run_job_id=run_job_id,
                reason="spec_invalid",
            )
            return

        spec_payload = spec_row["spec"]
        # HMAC verify spec.
        if not self.strategy_keys.verify(spec_payload, spec_row["signature"]):
            logger.error("Strategy spec signature INVALID — refusing")
            await self._write_short_circuit_reject(
                tenant_id=tenant_id,
                request_id=request_id,
                run_job_id=run_job_id,
                reason="spec_invalid",
            )
            return

        spec = StrategySpec.model_validate(spec_payload)

        # Capture reference timestamp ONCE before any fresh-data fetch.
        # All age calculations use t0 so that DB latency is counted toward staleness
        # (fail-safe: a snapshot that arrives exactly at the limit will be correctly
        # rejected as stale rather than silently accepted).
        t0 = now_utc()

        # Symbol depends only on the (already-validated) spec — no I/O. Compute it
        # up-front so the market/orderbook fetches can be parallelised below.
        # Symbol must match what market-data-service ingests for this (venue, asset).
        symbol = _symbol_for(venue=spec.venue, asset=spec.asset, quote=spec.quote)

        # Parallelise the independent DB reads. Each repo fetch_* acquires its OWN
        # connection from the asyncpg pool (min=2/max=10), so gather over 6 reads is
        # safe — no shared connection, no pool exhaustion. This only parallelises I/O;
        # the short-circuit logic below is applied in the SAME order as before, so the
        # decision and the reason-code priority are byte-for-byte identical.
        # NOTE fail-safe (vs the old sequential code): all 6 reads now always execute.
        # If a fetch raises (DB degraded), gather propagates it (no return_exceptions)
        # → _process → mark_job_failed (retry/poison). The old code could short-circuit
        # to a portfolio_stale REJECT before reaching the failing read; the new code
        # may instead surface job-failed. Both outcomes are NO-TRADE — this is strictly
        # a fail-safe divergence (REJECT → job-failed), never fail-open.
        (
            port_row,
            profile_row,
            ks,
            mkt_row,
            book_row,
            outbox_depth,
        ) = await asyncio.gather(
            self.repo.fetch_latest_portfolio(tenant_id),
            self.repo.fetch_active_risk_profile(tenant_id),
            self.repo.is_blocked(tenant_id, spec.venue),
            self.repo.fetch_latest_market_snapshot(
                venue=spec.venue, symbol=symbol, timeframe="1m"
            ),
            self.repo.fetch_latest_orderbook(venue=spec.venue, symbol=symbol),
            self.repo.outbox_pending_count(tenant_id),
        )

        # Portfolio + profile. Court-circuits preserved in original priority order.
        if port_row is None:
            await self._write_short_circuit_reject(
                tenant_id=tenant_id,
                request_id=request_id,
                run_job_id=run_job_id,
                reason="portfolio_stale",
            )
            return
        portfolio_age = (t0 - port_row["taken_at"]).total_seconds()
        portfolio = PortfolioSnapshot.model_validate(port_row["payload"])

        if profile_row is None:
            raise RuntimeError(f"No active risk profile for tenant {tenant_id}")
        profile = TenantRiskProfile.model_validate(profile_row)

        # Market context — REAL data from hedge_market_snapshots. No fallback.
        market_ctx: MarketContext | None = None
        if mkt_row is not None:
            market_age = (t0 - mkt_row["taken_at"]).total_seconds()
            market_ctx = build_context(mkt_row, market_age)

        # Orderbook (top 20). Slippage estimation will be skipped if missing.
        side = "buy" if spec.direction == "long" else "sell"
        ob_levels: list[list[float]] | None = None
        if book_row is not None:
            book_payload = book_row["payload"]
            ob_levels = book_payload.get("asks") if side == "buy" else book_payload.get("bids")

        decision = evaluate(
            spec=spec,
            portfolio=portfolio,
            profile=profile,
            market=market_ctx,
            orderbook_levels=ob_levels,
            engine_version=engine_version,
            decision_ttl_seconds=self.decision_ttl,
            kill_switch_active=ks,
            portfolio_age_seconds=portfolio_age,
            portfolio_max_age_seconds=self.portfolio_max_age,
            outbox_pending_depth=outbox_depth,
            outbox_max_pending_depth=settings().outbox_max_pending_depth,
            market_max_age_seconds=self.market_max_age,
            spread_bps_max=self.spread_bps_max,
            min_depth_usd=self.min_depth_usd,
            slippage_bps_max=self.slippage_bps_max,
            log_returns_min=self.log_returns_min,
        )

        # Build DB rows. Sign decision; sign each outbox row.
        decision_payload = json.loads(decision.model_dump_json())
        decision_signature = self.risk_keys.sign(decision_payload)

        # Hash chain — fetch prev_hash, compute row_hash.
        prev_hash_decisions = await self.repo.prev_hash_for_table(
            "hedge_risk_decisions", tenant_id
        )
        row_hash_decision = payload_hash_hex(
            {"prev_hash": prev_hash_decisions or "", **decision_payload}
        )

        decision_db_row = {
            "id": str(decision.decision_id),
            "tenant_id": str(tenant_id),
            "request_id": str(request_id),
            "spec_id": spec_row["id"],
            "portfolio_snapshot_id": port_row["id"],
            "risk_profile_id": profile_row["id"],
            "decision": decision.decision,
            "reason_codes": list(decision.reason_codes),
            "rules_eval": decision.rules_eval.model_dump(),
            "sized_orders": [o.model_dump() for o in decision.sized_orders],
            "decision_ttl_seconds": self.decision_ttl,
            "expires_at": decision.expires_at,
            "signature": decision_signature,
            "signing_key_id": self.risk_keys.active_key_id,
            "engine_version": engine_version,
            "computed_at": decision.computed_at,
            "prev_hash": prev_hash_decisions,
            "row_hash": row_hash_decision,
        }

        outbox_rows: list[dict] = []
        prev_hash_outbox = await self.repo.prev_hash_for_table(
            "hedge_exec_orders_outbox", tenant_id
        )
        if decision.decision in ("APPROVE", "RESIZE") and decision.sized_orders:
            for idx, order in enumerate(decision.sized_orders):
                outbox_id = uuid4()
                order_payload = order.model_dump()
                outbox_signature_payload = {
                    "decision_id": str(decision.decision_id),
                    "leg_index": idx,
                    "order": order_payload,
                }
                outbox_signature = self.risk_keys.sign(outbox_signature_payload)
                row_hash_outbox = payload_hash_hex(
                    {"prev_hash": prev_hash_outbox or "", **outbox_signature_payload}
                )
                outbox_rows.append(
                    {
                        "id": str(outbox_id),
                        "tenant_id": str(tenant_id),
                        "request_id": str(request_id),
                        "decision_id": str(decision.decision_id),
                        "leg_index": idx,
                        "order_payload": order_payload,
                        "client_order_id": order.client_order_id,
                        "status": "pending",
                        "ttl_at": decision.expires_at,
                        "signature": outbox_signature,
                        "prev_hash": prev_hash_outbox,
                        "row_hash": row_hash_outbox,
                    }
                )
                prev_hash_outbox = row_hash_outbox

        terminal = decision.decision == "REJECT" or not outbox_rows
        await self.repo.write_decision_and_outbox(
            decision_row=decision_db_row,
            outbox_rows=outbox_rows,
            run_job_id=run_job_id,
            terminal=terminal,
            event_payload={
                "decision": decision.decision,
                "reason_codes": list(decision.reason_codes),
                "orders": len(outbox_rows),
                "engine_version": engine_version,
            },
        )

    async def _write_short_circuit_reject(
        self, *, tenant_id: UUID, request_id: UUID, run_job_id: UUID, reason: str
    ) -> None:
        # Build a minimal REJECT decision directly.
        now = datetime.now(timezone.utc)
        decision_id = uuid4()
        payload = {
            "decision_id": str(decision_id),
            "tenant_id": str(tenant_id),
            "request_id": str(request_id),
            "decision": "REJECT",
            "reason_codes": [reason],
            "rules_eval": {},
            "sized_orders": [],
            "expires_at": now.isoformat(),
            "engine_version": engine_version,
            "computed_at": now.isoformat(),
        }
        signature = self.risk_keys.sign(payload)
        prev_hash = await self.repo.prev_hash_for_table("hedge_risk_decisions", tenant_id)
        row_hash = payload_hash_hex({"prev_hash": prev_hash or "", **payload})

        # We have no spec/portfolio FK in some short-circuit cases.
        # If absent, we cannot write to the (NOT NULL) FK columns. Fail loudly.
        spec_row = await self.repo.fetch_spec(tenant_id, request_id)
        port_row = await self.repo.fetch_latest_portfolio(tenant_id)
        profile_row = await self.repo.fetch_active_risk_profile(tenant_id)
        if not all([spec_row, port_row, profile_row]):
            # Don't try to fake FKs. Mark job failed, leave audit trail.
            await self.repo.mark_job_failed(
                run_job_id=run_job_id,
                error=f"Cannot write REJECT decision: missing dependencies (spec={bool(spec_row)}, port={bool(port_row)}, profile={bool(profile_row)})",
                tenant_id=tenant_id,
                request_id=request_id,
            )
            return

        db_row = {
            "id": str(decision_id),
            "tenant_id": str(tenant_id),
            "request_id": str(request_id),
            "spec_id": spec_row["id"],
            "portfolio_snapshot_id": port_row["id"],
            "risk_profile_id": profile_row["id"],
            "decision": "REJECT",
            "reason_codes": [reason],
            "rules_eval": {},
            "sized_orders": [],
            "decision_ttl_seconds": self.decision_ttl,
            "expires_at": now,
            "signature": signature,
            "signing_key_id": self.risk_keys.active_key_id,
            "engine_version": engine_version,
            "computed_at": now,
            "prev_hash": prev_hash,
            "row_hash": row_hash,
        }
        await self.repo.write_decision_and_outbox(
            decision_row=db_row,
            outbox_rows=[],
            run_job_id=run_job_id,
            terminal=True,
            event_payload={"decision": "REJECT", "reason_codes": [reason], "orders": 0},
        )
