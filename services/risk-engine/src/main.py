"""Risk Engine — FastAPI app + worker bootstrap.

- /health        — liveness probe
- /metrics       — Prometheus metrics
- /v1/evaluate   — pure RPC for replay (does NOT write; caller passes market context)
- background worker loop polls hedge_run_jobs and processes
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import numpy as np
from fastapi import FastAPI, HTTPException
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    generate_latest,
)
from pydantic import BaseModel
from starlette.responses import Response

from . import __version__
from .config import settings
from .evaluator import evaluate
from .market import MarketContext, build_context
from .models import PortfolioSnapshot, RiskDecisionOut, StrategySpec, TenantRiskProfile
from .repo import Repo
from .workers import RiskWorker


logger = logging.getLogger("risk-engine")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

decisions_total = Counter(
    "hedge_risk_decisions_total",
    "Risk decisions emitted.",
    ["decision"],
)
reject_reasons_total = Counter(
    "hedge_risk_reject_reasons_total",
    "Distribution of REJECT reason codes.",
    ["reason"],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = settings()
    repo = await Repo.create(cfg.supabase_db_url)
    worker = RiskWorker(repo)
    task = asyncio.create_task(worker.run_forever(), name="risk-worker")
    app.state.repo = repo
    app.state.worker = worker
    app.state.worker_task = task
    logger.info("Risk Engine started", extra={"version": __version__})
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
        logger.info("Risk Engine stopped")


app = FastAPI(title="HEDGE Risk Engine", version=__version__, lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "risk-engine", "version": __version__}


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


class EvaluateRequest(BaseModel):
    spec: StrategySpec
    portfolio: PortfolioSnapshot
    profile: TenantRiskProfile
    # Market context passed explicitly for replay/tests — no DB read here.
    market_payload: dict          # matches hedge_market_snapshots.payload shape
    market_age_seconds: float = 0.0
    orderbook_levels: list[list[float]] | None = None
    kill_switch_active: bool = False
    portfolio_age_seconds: float = 0.0
    outbox_pending_depth: int = 0
    outbox_max_pending_depth: int = 100


@app.post("/v1/evaluate", response_model=RiskDecisionOut)
async def evaluate_rpc(req: EvaluateRequest) -> RiskDecisionOut:
    """RPC endpoint for replay/tests. Does NOT touch DB.

    Caller MUST provide a market_payload (no synthetic fallback). This is a
    pure function over (spec, portfolio, profile, market, orderbook, flags).
    Same inputs ⇒ same outputs.
    """
    cfg = settings()
    if cfg.service_name != "risk-engine":
        raise HTTPException(500, "misconfigured")
    fake_row = {
        "id": "00000000-0000-0000-0000-000000000000",
        "venue": req.spec.venue,
        "symbol": req.spec.asset,
        "timeframe": req.spec.timeframe,
        "taken_at": datetime.now(timezone.utc),
        "payload": req.market_payload,
    }
    market_ctx: MarketContext = build_context(fake_row, req.market_age_seconds)
    out = evaluate(
        spec=req.spec,
        portfolio=req.portfolio,
        profile=req.profile,
        market=market_ctx,
        orderbook_levels=req.orderbook_levels,
        engine_version=__version__,
        decision_ttl_seconds=cfg.decision_default_ttl_seconds,
        kill_switch_active=req.kill_switch_active,
        portfolio_age_seconds=req.portfolio_age_seconds,
        portfolio_max_age_seconds=cfg.portfolio_max_age_seconds,
        outbox_pending_depth=req.outbox_pending_depth,
        outbox_max_pending_depth=req.outbox_max_pending_depth,
    )
    decisions_total.labels(decision=out.decision).inc()
    for r in out.reason_codes:
        reject_reasons_total.labels(reason=r).inc()
    return out
