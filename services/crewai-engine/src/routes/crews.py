import asyncio
import logging
import time as _time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..config import settings
from ..flows.chief_of_staff_flow import ChiefOfStaffFlow, ChiefOfStaffState
from ..persistence import run_store
from ..persistence.chief_step_store import list_chief_steps
from ..persistence.chief_decision_store import record_decision

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/crews/chief-of-staff")

# Cache process éphémère — lookup O(1) sans round-trip Supabase pour le worker
# qui a créé le run. Source de vérité : table chief_run_log via run_store
# (save_run au kickoff, update_run à chaque transition success/timeout/cancel/failure).
# Couverture partielle du multi-worker :
#   - POD RESTART et CROSS-WORKER : fallback run_store.get_run() si
#     _runs.get(kid) retourne None — couvert.
#   - NON COUVERT : si le worker propriétaire a le run en cache avec
#     status=running ET que cleanup_stale_runs (run_store.py) a marqué la
#     ligne DB failed, divergence cache/DB jusqu'au prochain restart ou
#     transition d'état explicite.
# Mémoire — aucune purge active sur _runs (cleanup_stale_runs n'agit que sur
# la DB). Sur uptime > 7 j : ~100 k entrées possibles (~100 MB si
# state_payload grossit). Surveiller la mémoire process.
_runs: dict[str, dict[str, Any]] = {}

# Strong references to background asyncio tasks — prevents silent GC-driven cancellation.
# Tasks are added at spawn and removed via done_callback when they finish.
_running_tasks: set[asyncio.Task] = set()

# Allowlist of state-override keys accepted from request.inputs.
# Denylist approach is insufficient — callers could inject crew_result, summary,
# started_at, etc. and pollute persisted state.
_ALLOWED_STATE_OVERRIDES: frozenset[str] = frozenset({
    "mock_mode",
    "user_timezone",
    "user_language",
})

# Rate limit : max N kickoffs per minute, sliding window.
# Per-process (single-worker uvicorn assumption — same as _runs).
# Mitigates compromised bearer token burning Claude API quota.
_RATE_LIMIT_PER_MINUTE = 10
_kickoff_timestamps: deque[float] = deque(maxlen=_RATE_LIMIT_PER_MINUTE * 2)


def _check_rate_limit() -> None:
    """Raise HTTPException 429 if more than _RATE_LIMIT_PER_MINUTE kickoffs in the last 60s."""
    now = _time.monotonic()
    # Purge entries older than 60s
    while _kickoff_timestamps and _kickoff_timestamps[0] < now - 60:
        _kickoff_timestamps.popleft()
    if len(_kickoff_timestamps) >= _RATE_LIMIT_PER_MINUTE:
        retry_after = int(60 - (now - _kickoff_timestamps[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit: max {_RATE_LIMIT_PER_MINUTE} kickoffs/min. Retry in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
    _kickoff_timestamps.append(now)


class KickoffRequest(BaseModel):
    trigger: Literal["morning", "evening", "intraday", "on_demand", "webhook"] = "on_demand"
    inputs: dict[str, Any] = {}
    # Snooze duration in hours — 1h min, 8760h max (1 year). None = no snooze.
    snooze_hours: int | None = Field(default=None, ge=1, le=8760)


class KickoffResponse(BaseModel):
    kickoff_id: str


class StatusResponse(BaseModel):
    kickoff_id: str
    status: str
    result: str | None = None
    started_at: str
    finished_at: str | None = None
    state: dict[str, Any] | None = None


async def _execute_flow_background(
    kickoff_id: str,
    trigger: str,
    state_dict: dict[str, Any],
    started_at: str,  # noqa: ARG001 — kept for future structured logging
) -> None:
    """Background task — runs the Chief of Staff flow and updates state stores.

    Lifecycle :
    - Success → status="completed", result + state_json persisted to Supabase
    - Timeout → status="failed", error_text persisted
    - CancelledError (SIGTERM / shutdown) → status="cancelled", re-raised
    - Exception → status="failed", error_text persisted

    SIGTERM caveat : the flow runs inside `asyncio.to_thread()` which delegates to
    a Python thread. Threads are NOT interruptible by CancelledError — the
    coroutine wrapper is cancelled and the DB state is updated to "cancelled",
    but the underlying thread continues CPU work until the next checkpoint or
    completion (typically a few seconds extra). Acceptable for Railway 15s grace
    period; the DB status is consistent regardless of when the thread finally exits.
    """
    try:
        flow = ChiefOfStaffFlow()
        result = await asyncio.wait_for(
            asyncio.to_thread(flow.kickoff, inputs=state_dict),
            timeout=settings.FLOW_TIMEOUT_SECONDS,
        )
        final_state = flow.state
        state_payload = (
            final_state.model_dump() if hasattr(final_state, "model_dump") else {}
        )
        finished_at = datetime.now(timezone.utc).isoformat()
        _runs[kickoff_id].update({
            "status": "completed",
            "result": str(result),
            "finished_at": finished_at,
            "state": state_payload,
        })
        run_store.update_run(
            kickoff_id,
            status="completed",
            result=str(result),
            finished_at=finished_at,
            state_json=state_payload,
        )
    except asyncio.TimeoutError:
        msg = f"Flow execution exceeded {settings.FLOW_TIMEOUT_SECONDS}s timeout"
        finished_at = datetime.now(timezone.utc).isoformat()
        _runs[kickoff_id].update({
            "status": "failed",
            "result": msg,
            "finished_at": finished_at,
        })
        run_store.update_run(kickoff_id, status="failed", result=msg, finished_at=finished_at, error_text=msg)
    except asyncio.CancelledError:
        cancelled_msg = "Server shutdown or background task cancelled"
        finished_at = datetime.now(timezone.utc).isoformat()
        _runs[kickoff_id].update({
            "status": "cancelled",
            "result": cancelled_msg,
            "finished_at": finished_at,
        })
        run_store.update_run(kickoff_id, status="cancelled", result=cancelled_msg, finished_at=finished_at, error_text="cancelled")
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("Background kickoff %s failed: %s", kickoff_id, exc, exc_info=True)
        finished_at = datetime.now(timezone.utc).isoformat()
        _runs[kickoff_id].update({
            "status": "failed",
            "result": str(exc),
            "finished_at": finished_at,
        })
        run_store.update_run(kickoff_id, status="failed", result=str(exc), finished_at=finished_at, error_text=str(exc))


@router.post("/kickoff", response_model=KickoffResponse)
async def kickoff(
    request: KickoffRequest,
    owner_id: str | None = Query(default=None),
) -> KickoffResponse:
    """Start a Chief of Staff flow run. Returns kickoff_id IMMEDIATELY.

    The flow executes in a background asyncio task — poll /status/{kickoff_id} for progress.
    Decoupling the response from flow completion avoids HTTP timeouts (Vercel 10s, browser 30s).

    `owner_id` is propagated from Next.js and written to `chief_run_log.owner_id`
    (migration 0015). Explicit scoping is required because the engine bypasses RLS
    via SUPABASE_SERVICE_ROLE_KEY.
    """
    logger.debug("chief-of-staff kickoff owner_id=%s", owner_id)
    _check_rate_limit()

    kickoff_id = str(uuid4())
    started_at = datetime.now(timezone.utc).isoformat()

    _runs[kickoff_id] = {
        "kickoff_id": kickoff_id,
        "status": "running",
        "started_at": started_at,
        "result": None,
        "finished_at": None,
        "state": None,
    }

    # Persist to Supabase — owner_id written to chief_run_log.owner_id (migration 0015).
    # Fail-soft: in-memory _runs remains the primary store for this process.
    run_store.save_run(kickoff_id, request.trigger, "running", started_at, owner_id=owner_id)

    # Build initial state with allowlist override merge.
    # chief_run_id injected here so the flow can pass it to create_daily_chief_crew()
    # which registers the task_callback for step persistence in chief_run_steps.
    initial_state = ChiefOfStaffState(trigger=request.trigger, chief_run_id=kickoff_id)
    state_dict = initial_state.model_dump()
    extra_inputs = {
        k: v for k, v in (request.inputs or {}).items()
        if k in _ALLOWED_STATE_OVERRIDES
    }
    # trigger is always sourced from request.trigger — never from inputs.
    overlapping_keys = set(extra_inputs.keys()) & set(state_dict.keys())
    if overlapping_keys:
        logger.warning(
            "Kickoff %s : caller overrides state fields %s",
            kickoff_id, sorted(overlapping_keys),
        )
    state_dict.update(extra_inputs)

    # Fire-and-forget background task with strong reference to prevent GC.
    task = asyncio.create_task(
        _execute_flow_background(kickoff_id, request.trigger, state_dict, started_at)
    )
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)

    return KickoffResponse(kickoff_id=kickoff_id)


@router.get("/status/{kickoff_id}", response_model=StatusResponse)
def status(
    kickoff_id: UUID,
    owner_id: str | None = Query(default=None),
) -> StatusResponse:
    """Return status and result for a given kickoff_id. FastAPI validates UUID format → 422 if malformed.

    `owner_id` is propagated from Next.js and used to scope the Supabase fallback
    lookup — if provided, only runs belonging to this owner are returned (migration
    0015 scoping via explicit `.eq("owner_id", owner_id)` since the engine bypasses RLS).
    """
    logger.debug("chief-of-staff status owner_id=%s", owner_id)
    kid = str(kickoff_id)
    run = _runs.get(kid)
    if run is None:
        # Fallback to Supabase — handles pod restarts where in-memory store is lost.
        # owner_id scopes the query to prevent cross-tenant data leakage.
        db_run = run_store.get_run(kid, owner_id=owner_id)
        if db_run is None:
            raise HTTPException(status_code=404, detail=f"kickoff_id {kid!r} not found")
        # Map DB column names to StatusResponse fields.
        # DB schema uses state_json / error_text; Pydantic model uses state / result.
        # Pydantic v2 rejects unknown fields by default → explicit mapping required.
        result_val = db_run.get("result")
        run = {
            "kickoff_id": db_run.get("kickoff_id", kid),
            "status":     db_run.get("status", "unknown"),
            "result":     result_val if result_val is not None else db_run.get("error_text"),
            "started_at": db_run.get("started_at", ""),
            "finished_at": db_run.get("finished_at"),
            "state":      db_run.get("state_json"),  # DB col = state_json, model field = state
        }

    return StatusResponse(**run)


@router.get("/runs")
def list_runs_endpoint(
    limit: int = Query(default=20, ge=1, le=100),
    owner_id: str | None = Query(default=None),
) -> list[dict]:
    """List recent Chief of Staff runs from Supabase.

    If `owner_id` is provided, filters rows to that owner via an explicit
    `.eq("owner_id", owner_id)` — required because the engine bypasses RLS
    (service-role key). Scoping is real since migration 0015 added `owner_id`
    to `chief_run_log`. Returns empty list if Supabase is not configured.
    """
    return run_store.list_runs(limit=limit, owner_id=owner_id)


@router.get("/runs/{kickoff_id}/steps")
def get_run_steps(kickoff_id: str) -> list[dict]:
    """Return all completed task steps for a given run, ordered by step_index.

    kickoff_id is a text string (UUID stringified) — no UUID validation applied
    here since the store uses text comparison (not uuid cast).

    Returns [] if run not found, Supabase not configured, or no steps recorded yet.
    """
    return list_chief_steps(chief_run_id=kickoff_id)


@router.get("/runs/{kickoff_id}/decisions")
def list_run_decisions_endpoint(kickoff_id: str) -> list[dict]:
    """Return all recorded user decisions for a given run, ordered by created_at desc.

    kickoff_id is a text string (UUID stringified) — same convention as /steps.

    Returns [] if run not found, Supabase not configured, or no decisions recorded yet.
    """
    from ..persistence.chief_decision_store import list_decisions
    return list_decisions(kickoff_id)


class DecisionRequest(BaseModel):
    kickoff_id: str
    action: Literal["sent", "snoozed", "rejected"]
    snooze_hours: int | None = None


class DecisionResponse(BaseModel):
    ok: bool
    record: dict | None = None


@router.post("/decisions", response_model=DecisionResponse)
def post_decision(request: DecisionRequest) -> DecisionResponse:
    """Record a user decision on a Chief run P0 item.

    Body:
        kickoff_id: the run's kickoff_id (text).
        action: 'sent' | 'snoozed' | 'rejected'.
        snooze_hours: optional int — only meaningful when action='snoozed'.
            If provided, snooze_until = now + snooze_hours.

    Returns 200 with {ok: true, record: {...}} on success.
    Returns 422 if action is invalid (Pydantic Literal validation).
    Returns 500 if Supabase write failed unexpectedly.
    """
    try:
        created = record_decision(
            chief_run_id=request.kickoff_id,
            action=request.action,
            snooze_hours=request.snooze_hours,
        )
    except ValueError as exc:
        # Should not happen — Pydantic Literal already validates action.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return DecisionResponse(ok=True, record=created)
