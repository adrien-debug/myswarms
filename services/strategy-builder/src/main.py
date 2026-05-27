"""Strategy Builder FastAPI bootstrap."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

builder_runs_total = Counter(
    "hedge_builder_runs_total",
    "Strategy spec builds by outcome.",
    ["outcome"],
)
builder_latency_ms = Histogram(
    "hedge_builder_latency_ms",
    "LLM fusion latency (ms).",
    buckets=(100, 250, 500, 1000, 2500, 5000, 10000, 30000),
)

from . import __version__
from .config import settings
from .repo import Repo
from .workers import BuilderWorker

logger = logging.getLogger("strategy-builder")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = settings()
    repo = await Repo.create(cfg.supabase_db_url)
    worker = BuilderWorker(repo)
    task = asyncio.create_task(worker.run_forever(), name="builder-worker")
    app.state.repo = repo
    app.state.worker = worker
    app.state.worker_task = task
    logger.info("Strategy Builder started", extra={"version": __version__})
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


app = FastAPI(title="HEDGE Strategy Builder", version=__version__, lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "strategy-builder", "version": __version__}


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
