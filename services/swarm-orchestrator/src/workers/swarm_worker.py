"""Swarm Orchestrator worker.

For each queued run_job:
  1. Fetch the strategy_request payload.
  2. Run 4 agents in parallel (tolerant: 1 timeout doesn't kill the run).
  3. Sign each agent output with SWARM_SIGNING_KEY.
  4. Insert hedge_swarm_signals + advance run_job to signals_ready.
"""

from __future__ import annotations

import asyncio
import logging
import socket
import sys
from typing import Any
from uuid import UUID, uuid4

sys.path.append("/app/shared/hmac/python")
sys.path.append("../../shared/hmac/python")

from hedge_hmac import SigningContext, payload_hash_hex  # type: ignore  # noqa: E402

from ..agents import AGENTS
from ..config import settings
from ..repo import Repo

logger = logging.getLogger("swarm-orchestrator.worker")


class SwarmWorker:
    def __init__(self, repo: Repo) -> None:
        self.repo = repo
        self.worker_id = f"swarm-orchestrator@{socket.gethostname()}"
        cfg = settings()
        self.poll_interval = cfg.worker_poll_interval_ms / 1000.0
        self.batch_size = cfg.worker_batch_size
        self.max_attempts = cfg.worker_max_attempts
        self.swarm_keys = SigningContext.from_env("SWARM_SIGNING_KEY")
        self.stopping = False

    async def run_forever(self) -> None:
        logger.info("Swarm worker starting", extra={"worker_id": self.worker_id})
        while not self.stopping:
            try:
                processed = 0
                for _ in range(self.batch_size):
                    job = await self.repo.claim_queued_job(self.worker_id)
                    if job is None:
                        break
                    await self._process(job)
                    processed += 1
                if processed == 0:
                    await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                logger.info("Swarm worker cancelled")
                break
            except Exception:
                logger.exception("Swarm worker loop error")
                await asyncio.sleep(self.poll_interval)

    async def _process(self, job: dict[str, Any]) -> None:
        tenant_id: UUID = job["tenant_id"]
        request_id: UUID = job["request_id"]
        run_job_id: UUID = job["id"]

        try:
            req = await self.repo.fetch_request(tenant_id, request_id)
            if req is None:
                raise RuntimeError("strategy_request missing")

            ctx = {
                "tenant_id": str(tenant_id),
                "request_id": str(request_id),
                "raw_intent": req["raw_intent"],
                "normalized": req.get("normalized") or {},
            }

            results = await asyncio.gather(
                *(AGENTS[name](ctx) for name in AGENTS),
                return_exceptions=False,
            )

            # Build signal rows. Sign each.
            prev_hash = await self.repo.prev_hash_for_signals(tenant_id)
            rows: list[dict[str, Any]] = []
            degraded = False
            for r in results:
                if r.status in ("failed", "timeout", "degraded"):
                    degraded = True
                payload = {
                    "tenant_id": str(tenant_id),
                    "request_id": str(request_id),
                    "agent": r.agent,
                    "status": r.status,
                    "payload": r.payload,
                    "confidence": r.confidence,
                }
                signature = self.swarm_keys.sign(payload)
                payload_hash = payload_hash_hex(r.payload)
                row_hash = payload_hash_hex({"prev_hash": prev_hash or "", **payload})
                rows.append(
                    {
                        "id": str(uuid4()),
                        "tenant_id": tenant_id,
                        "request_id": request_id,
                        "agent": r.agent,
                        "status": r.status,
                        "payload": r.payload,
                        "confidence": r.confidence,
                        "payload_hash": payload_hash,
                        "signature": signature,
                        "latency_ms": r.latency_ms,
                        "model": r.model,
                        "langfuse_trace_id": r.langfuse_trace_id,
                        "prev_hash": prev_hash,
                        "row_hash": row_hash,
                    }
                )
                prev_hash = row_hash

            # If ALL agents failed, abort the run.
            if all(r.status in ("failed", "timeout") for r in results):
                raise RuntimeError("all swarm agents failed/timed out")

            await self.repo.write_signals_and_advance(
                run_job_id=run_job_id,
                tenant_id=tenant_id,
                request_id=request_id,
                signal_rows=rows,
                degraded=degraded,
            )
        except Exception as e:
            logger.exception("Swarm processing failed")
            await self.repo.mark_job_failed(
                run_job_id=run_job_id,
                tenant_id=tenant_id,
                request_id=request_id,
                error=f"{type(e).__name__}: {e}",
                max_attempts=self.max_attempts,
            )
