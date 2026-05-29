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
from uuid import UUID

import numpy as np
from fastapi import Body, FastAPI, HTTPException
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    generate_latest,
)
from pydantic import BaseModel, model_validator
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
    repo = await Repo.create(cfg.supabase_db_url, command_timeout=cfg.db_command_timeout_seconds)
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

    REPLAY-ONLY: this endpoint never reads from nor writes to the database, and
    cannot submit any order. The actual kill-switch enforcement happens inside
    the background worker (RiskWorker), which calls hedge_is_blocked() in DB
    before writing each risk decision — that is the real enforcement barrier.
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
        market_max_age_seconds=cfg.market_max_age_seconds,
        spread_bps_max=cfg.spread_bps_max,
        min_depth_usd=cfg.min_depth_usd,
        slippage_bps_max=cfg.slippage_bps_max,
        log_returns_min=cfg.log_returns_min,
    )
    decisions_total.labels(decision=out.decision).inc()
    for r in out.reason_codes:
        reject_reasons_total.labels(reason=r).inc()
    return out


class KillSwitchRequest(BaseModel):
    scope: str = "global"            # 'global' | 'tenant' | 'venue'
    tenant_id: str | None = None
    venue: str | None = None
    reason: str | None = None
    force: bool = False              # /resume only: also clear auto-armed (reason 'auto:%') switches

    @model_validator(mode="after")
    def _check_shape(self) -> "KillSwitchRequest":
        if self.scope == "global" and (self.tenant_id or self.venue):
            raise ValueError("scope=global requires no tenant_id and no venue")
        if self.scope == "tenant" and (not self.tenant_id or self.venue):
            raise ValueError("scope=tenant requires tenant_id and no venue")
        if self.scope == "venue" and (not self.venue or self.tenant_id):
            raise ValueError("scope=venue requires venue and no tenant_id")
        if self.scope not in ("global", "tenant", "venue"):
            raise ValueError("scope must be one of: global, tenant, venue")
        return self


@app.post("/kill")
async def kill(req: KillSwitchRequest = Body(default=KillSwitchRequest())) -> dict:
    """EMERGENCY STOP — arms a kill switch (default: global). No auth by design
    (CLAUDE.md invariant: max reactivity during a live incident). Execution +
    risk workers consult hedge_is_blocked() before every order."""
    tid = UUID(req.tenant_id) if req.tenant_id else None
    sid = await app.state.repo.arm_kill_switch(
        scope=req.scope, tenant_id=tid, venue=req.venue,
        reason=req.reason or "manual_kill",
    )
    logger.warning("KILL SWITCH ARMED scope=%s tenant=%s venue=%s", req.scope, req.tenant_id, req.venue)
    return {"status": "killed", "kill_switch_id": sid, "scope": req.scope}


@app.post("/pause")
async def pause(req: KillSwitchRequest = Body(default=KillSwitchRequest())) -> dict:
    """Freeze new orders (same mechanism as /kill, semantically a soft hold).
    No auth by design."""
    tid = UUID(req.tenant_id) if req.tenant_id else None
    sid = await app.state.repo.arm_kill_switch(
        scope=req.scope, tenant_id=tid, venue=req.venue,
        reason=req.reason or "manual_pause",
    )
    logger.warning("PAUSE ARMED scope=%s tenant=%s venue=%s", req.scope, req.tenant_id, req.venue)
    return {"status": "paused", "kill_switch_id": sid, "scope": req.scope}


@app.post("/resume")
async def resume(req: KillSwitchRequest = Body(default=KillSwitchRequest())) -> dict:
    """Clear active kill switches. No auth by design.

    By default, switches AUTO-ARMED by the reconcile worker (reason 'auto:%',
    raised on a venue/DB position divergence) are NOT cleared — they require a
    human investigation. Pass force=true to clear them too."""
    tid = UUID(req.tenant_id) if req.tenant_id else None
    # If body is fully default (global, no tenant/venue), clear everything in scope.
    if req.scope == "global" and tid is None and req.venue is None:
        cleared = await app.state.repo.clear_kill_switches(exclude_auto=not req.force)
    else:
        cleared = await app.state.repo.clear_kill_switches(
            scope=req.scope, tenant_id=tid, venue=req.venue, exclude_auto=not req.force
        )
    logger.warning("KILL SWITCHES CLEARED count=%d force=%s", cleared, req.force)
    return {"status": "resumed", "cleared": cleared, "force": req.force}


@app.get("/kill/status")
async def kill_status() -> dict:
    switches = await app.state.repo.list_active_kill_switches()
    return {"active": len(switches), "switches": [
        {"id": str(s["id"]), "scope": s["scope"],
         "tenant_id": str(s["tenant_id"]) if s["tenant_id"] else None,
         "venue": s["venue"], "reason": s["reason"]}
        for s in switches
    ]}
