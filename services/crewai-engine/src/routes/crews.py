import asyncio
import logging
import time as _time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..config import settings
from ..flows.chief_of_staff_flow import ChiefOfStaffFlow, ChiefOfStaffState
from ..persistence import run_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/crews/chief-of-staff")

# WARN: in-memory single-process store.
# Persistence Supabase pas encore branchée (V1 squelette).
# Si Railway scale > 1 worker, runs créés sur worker A invisibles sur worker B.
# Mitigation actuelle : Railway start avec --workers 1 (default uvicorn).
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
async def kickoff(request: KickoffRequest) -> KickoffResponse:
    """Start a Chief of Staff flow run. Returns kickoff_id IMMEDIATELY.

    The flow executes in a background asyncio task — poll /status/{kickoff_id} for progress.
    Decoupling the response from flow completion avoids HTTP timeouts (Vercel 10s, browser 30s).
    """
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

    # Persist to Supabase (fail-soft — in-memory _runs remains the primary store for this process)
    run_store.save_run(kickoff_id, request.trigger, "running", started_at)

    # Build initial state with allowlist override merge.
    initial_state = ChiefOfStaffState(trigger=request.trigger)
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
def status(kickoff_id: UUID) -> StatusResponse:
    """Return status and result for a given kickoff_id. FastAPI validates UUID format → 422 if malformed."""
    kid = str(kickoff_id)
    run = _runs.get(kid)
    if run is None:
        # Fallback to Supabase — handles pod restarts where in-memory store is lost
        db_run = run_store.get_run(kid)
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
def list_runs_endpoint(limit: int = Query(default=20, ge=1, le=100)) -> list[dict]:
    """List recent runs from Supabase. Returns empty list if Supabase not configured."""
    return run_store.list_runs(limit=limit)
