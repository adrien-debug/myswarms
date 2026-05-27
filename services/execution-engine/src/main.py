"""Execution Engine FastAPI app — workers: ExecutionWorker, ReconcileWorker, DeadmanWorker."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from . import __version__
from .config import settings
from .repo import Repo
from .run_modes import ModeContext
from .workers import DeadmanWorker, ExecutionWorker, ReconcileWorker

logger = logging.getLogger("execution-engine")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = settings()
    mode = ModeContext.from_env()
    logger.info(
        "Execution Engine starting",
        extra={
            "version": __version__,
            "dry_run": cfg.dry_run,
            "run_mode": mode.mode,
            "live_tenants": len(mode.live_tenant_allowlist),
            "live_venues": len(mode.live_venue_allowlist),
            "live_notional_cap_usd": mode.live_notional_cap_usd,
        },
    )

    repo = await Repo.create(cfg.supabase_db_url)
    exec_worker = ExecutionWorker(repo)
    reconcile_worker = ReconcileWorker(repo.pool)
    deadman_worker = DeadmanWorker()

    tasks = [
        asyncio.create_task(exec_worker.run_forever(), name="exec-worker"),
        asyncio.create_task(reconcile_worker.run_forever(), name="reconcile-worker"),
        asyncio.create_task(deadman_worker.run_forever(), name="deadman-worker"),
    ]

    app.state.repo = repo
    app.state.exec_worker = exec_worker
    app.state.reconcile_worker = reconcile_worker
    app.state.deadman_worker = deadman_worker
    app.state.tasks = tasks
    app.state.mode = mode

    try:
        yield
    finally:
        exec_worker.stopping = True
        reconcile_worker.stopping = True
        deadman_worker.stopping = True
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        await repo.close()
        logger.info("Execution Engine stopped")


app = FastAPI(title="HEDGE Execution Engine", version=__version__, lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    cfg = settings()
    mode = ModeContext.from_env()
    return {
        "status": "ok",
        "service": "execution-engine",
        "version": __version__,
        "dry_run": cfg.dry_run,
        "run_mode": mode.mode,
        "live_tenants_count": len(mode.live_tenant_allowlist),
        "live_venues": sorted(list(mode.live_venue_allowlist)),
        "live_notional_cap_usd": mode.live_notional_cap_usd,
    }


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
