"""Strategy Builder worker loop.

Poll → fetch signals → LLM fusion → validate → sign → write strategy_specs.
On Pydantic validation failure → status='spec_invalid' (run terminates).
On LLM failure → retry up to max_attempts then poison.
"""

from __future__ import annotations

import asyncio
import logging
import socket
import sys
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

sys.path.append("/app/shared/hmac/python")
sys.path.append("../../shared/hmac/python")

from hedge_hmac import SigningContext, payload_hash_hex  # type: ignore  # noqa: E402

from ..config import settings
from ..llm import LLMError, fuse_signals
from ..models import StrategySpec, SwarmSignalRead
from ..repo import Repo

logger = logging.getLogger("strategy-builder.worker")


class BuilderWorker:
    def __init__(self, repo: Repo) -> None:
        self.repo = repo
        self.worker_id = f"strategy-builder@{socket.gethostname()}"
        cfg = settings()
        self.poll_interval = cfg.worker_poll_interval_ms / 1000.0
        self.batch_size = cfg.worker_batch_size
        self.max_attempts = cfg.worker_max_attempts
        self.strategy_keys = SigningContext.from_env("STRATEGY_SIGNING_KEY")
        self.stopping = False

    async def run_forever(self) -> None:
        logger.info("Builder worker starting", extra={"worker_id": self.worker_id})
        while not self.stopping:
            try:
                processed = 0
                for _ in range(self.batch_size):
                    job = await self.repo.claim_signals_ready_job(self.worker_id)
                    if job is None:
                        break
                    await self._process(job)
                    processed += 1
                if processed == 0:
                    await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                logger.info("Builder worker cancelled")
                break
            except Exception:
                logger.exception("Builder worker loop error")
                await asyncio.sleep(self.poll_interval)

    async def _process(self, job: dict[str, Any]) -> None:
        tenant_id: UUID = job["tenant_id"]
        request_id: UUID = job["request_id"]
        run_job_id: UUID = job["id"]

        try:
            req = await self.repo.fetch_request(tenant_id, request_id)
            if req is None:
                raise RuntimeError("strategy_request missing")

            sig_rows = await self.repo.fetch_signals(tenant_id, request_id)
            if not sig_rows:
                raise RuntimeError("no swarm_signals for this run")

            signals = [SwarmSignalRead.model_validate(r) for r in sig_rows]
            spec_partial, model_used = await fuse_signals(
                request_id=str(request_id),
                tenant_id=str(tenant_id),
                raw_intent=req["raw_intent"],
                signals=signals,
            )

            # Augment with identifiers + created_at; validate against StrategySpec.
            now = datetime.now(timezone.utc)
            spec_partial.update(
                {
                    "spec_id": str(uuid4()),
                    "request_id": str(request_id),
                    "tenant_id": str(tenant_id),
                    "model": model_used,
                    "created_at": now.isoformat(),
                }
            )

            try:
                spec = StrategySpec.model_validate(spec_partial)
            except Exception as ve:
                # Builder hallucinated → mark spec_invalid, end the run.
                logger.error("StrategySpec validation failed", extra={"error": str(ve)[:300]})
                await self._write_invalid(
                    tenant_id=tenant_id,
                    request_id=request_id,
                    run_job_id=run_job_id,
                    raw_spec=spec_partial,
                    error=str(ve)[:1000],
                    signals=signals,
                )
                return

            spec_dict = spec.model_dump(mode="json")
            signature = self.strategy_keys.sign(spec_dict)
            spec_hash = payload_hash_hex(spec_dict)

            prev_hash = await self.repo.prev_hash_for_specs(tenant_id)
            row_hash = payload_hash_hex(
                {"prev_hash": prev_hash or "", **spec_dict}
            )

            spec_row = {
                "id": spec.spec_id,
                "tenant_id": spec.tenant_id,
                "request_id": spec.request_id,
                "spec": spec_dict,
                "spec_hash": spec_hash,
                "signature": signature,
                "signing_key_id": self.strategy_keys.active_key_id,
                "swarm_signals_ref": [str(s.id) for s in signals],
                "confidence": spec.confidence,
                "model": spec.model,
                "langfuse_trace_id": None,
                "prev_hash": prev_hash,
                "row_hash": row_hash,
            }
            await self.repo.write_spec_and_advance(
                spec_row=spec_row,
                run_job_id=run_job_id,
                tenant_id=tenant_id,
                request_id=request_id,
            )
        except LLMError as e:
            logger.warning("LLM error, will retry", extra={"error": str(e)[:300]})
            await self.repo.mark_job_failed(
                run_job_id=run_job_id,
                tenant_id=tenant_id,
                request_id=request_id,
                error=f"LLMError: {e}",
                max_attempts=self.max_attempts,
            )
        except Exception as e:
            logger.exception("Builder failed")
            await self.repo.mark_job_failed(
                run_job_id=run_job_id,
                tenant_id=tenant_id,
                request_id=request_id,
                error=f"{type(e).__name__}: {e}",
                max_attempts=self.max_attempts,
            )

    async def _write_invalid(
        self,
        *,
        tenant_id: UUID,
        request_id: UUID,
        run_job_id: UUID,
        raw_spec: dict[str, Any],
        error: str,
        signals: list[SwarmSignalRead],
    ) -> None:
        now = datetime.now(timezone.utc)
        invalid_spec = {
            "spec_id": str(uuid4()),
            "request_id": str(request_id),
            "tenant_id": str(tenant_id),
            "raw": raw_spec,
            "validation_error": error,
            "created_at": now.isoformat(),
        }
        sig = self.strategy_keys.sign(invalid_spec)
        spec_hash = payload_hash_hex(invalid_spec)
        prev_hash = await self.repo.prev_hash_for_specs(tenant_id)
        row_hash = payload_hash_hex({"prev_hash": prev_hash or "", **invalid_spec})
        spec_row = {
            "id": invalid_spec["spec_id"],
            "tenant_id": tenant_id,
            "request_id": request_id,
            "spec": invalid_spec,
            "spec_hash": spec_hash,
            "signature": sig,
            "signing_key_id": self.strategy_keys.active_key_id,
            "swarm_signals_ref": [str(s.id) for s in signals],
            "confidence": 0.0,
            "model": "invalid",
            "langfuse_trace_id": None,
            "prev_hash": prev_hash,
            "row_hash": row_hash,
        }
        await self.repo.write_spec_and_advance(
            spec_row=spec_row,
            run_job_id=run_job_id,
            tenant_id=tenant_id,
            request_id=request_id,
            invalid=True,
            validation_error=error,
        )
