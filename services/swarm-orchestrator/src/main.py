"""Swarm Orchestrator FastAPI bootstrap."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

swarm_runs_total = Counter(
    "hedge_swarm_runs_total",
    "Swarm runs by outcome.",
    ["outcome"],
)
swarm_agent_latency_ms = Histogram(
    "hedge_swarm_agent_latency_ms",
    "Per-agent latency.",
    ["agent", "status"],
    buckets=(50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000),
)

from . import __version__
from .config import settings
from .repo import Repo
from .workers import SwarmWorker

logger = logging.getLogger("swarm-orchestrator")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = settings()
    repo = await Repo.create(cfg.supabase_db_url)
    worker = SwarmWorker(repo)
    task = asyncio.create_task(worker.run_forever(), name="swarm-worker")
    app.state.repo = repo
    app.state.worker = worker
    app.state.worker_task = task
    logger.info("Swarm Orchestrator started", extra={"version": __version__})
    try:
        yield
    finally:
        worker.stopping = True
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await repo.close()


app = FastAPI(title="HEDGE Swarm Orchestrator", version=__version__, lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "swarm-orchestrator", "version": __version__}


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
