"""Market Data Service — FastAPI + ingesters + snapshot workers."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    generate_latest,
)

from . import __version__
from .config import parse_ingest_pairs, settings
from .ingesters import INGESTERS
from .repo import Repo
from .state import StateStore
from .workers import SnapshotWorker

logger = logging.getLogger("market-data-service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

ms_snapshots_written = Counter(
    "hedge_market_snapshots_written_total",
    "Market snapshots successfully written.",
    ["venue", "symbol"],
)
ms_stale_events = Counter(
    "hedge_market_stale_events_total",
    "Stale snapshot events emitted (per venue/symbol).",
    ["venue", "symbol"],
)
ms_ws_connected = Gauge(
    "hedge_market_ws_connected",
    "1 if WS is currently connected for a venue/symbol, 0 otherwise.",
    ["venue", "symbol"],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = settings()
    pairs = parse_ingest_pairs(cfg.ingest_pairs)
    if not pairs:
        raise RuntimeError("INGEST_PAIRS is empty — refuse to start.")

    repo = await Repo.create(cfg.supabase_db_url)
    store = StateStore()

    ingesters = []
    tasks: list[asyncio.Task] = []
    for venue, symbol in pairs:
        cls = INGESTERS.get(venue)
        if cls is None:
            raise RuntimeError(f"Unknown venue '{venue}' in INGEST_PAIRS")
        ing = cls(symbol=symbol, store=store)
        ingesters.append(ing)
        tasks.append(asyncio.create_task(ing.run_forever(), name=f"ingest-{venue}-{symbol}"))

    worker = SnapshotWorker(repo=repo, store=store, ingesters=ingesters)
    tasks.append(asyncio.create_task(worker.run_forever(), name="snapshot-worker"))

    app.state.repo = repo
    app.state.store = store
    app.state.ingesters = ingesters
    app.state.worker = worker
    app.state.tasks = tasks
    logger.info("Market Data Service started", extra={"version": __version__, "pairs": pairs})

    # Periodic metric refresh (WS gauges).
    async def refresh_gauges():
        while True:
            for ing in ingesters:
                ms_ws_connected.labels(venue=ing.venue, symbol=ing.symbol).set(
                    1 if getattr(ing, "connected", False) else 0
                )
            await asyncio.sleep(5)

    gauge_task = asyncio.create_task(refresh_gauges(), name="gauges")
    tasks.append(gauge_task)

    try:
        yield
    finally:
        for ing in ingesters:
            await ing.stop()
        worker.stopping = True
        for t in tasks:
            t.cancel()
        for t in tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        await repo.close()
        logger.info("Market Data Service stopped")


app = FastAPI(title="HEDGE Market Data Service", version=__version__, lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "market-data-service", "version": __version__}


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
