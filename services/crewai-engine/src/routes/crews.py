from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..flows.chief_of_staff_flow import ChiefOfStaffFlow, ChiefOfStaffState

router = APIRouter(prefix="/v1/crews/chief-of-staff")

# WARN: in-memory single-process store.
# Persistence Supabase pas encore branchée (V1 squelette).
# Si Railway scale > 1 worker, runs créés sur worker A invisibles sur worker B.
# Mitigation actuelle : Railway start avec --workers 1 (default uvicorn).
_runs: dict[str, dict[str, Any]] = {}


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


@router.post("/kickoff", response_model=KickoffResponse)
def kickoff(request: KickoffRequest) -> KickoffResponse:
    """Start a Chief of Staff flow run. Returns kickoff_id immediately.

    For this skeleton the flow is executed synchronously (< 1s, Hello World only).
    Background async execution will be added when LLM agents are wired.
    """
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

    try:
        flow = ChiefOfStaffFlow()
        initial_state = ChiefOfStaffState(trigger=request.trigger)
        result = flow.kickoff(inputs=initial_state.model_dump())
        final_state = flow.state

        _runs[kickoff_id].update(
            {
                "status": "completed",
                "result": str(result),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "state": final_state.model_dump()
                if hasattr(final_state, "model_dump")
                else {},
            }
        )
    except Exception as exc:  # noqa: BLE001
        _runs[kickoff_id].update(
            {
                "status": "failed",
                "result": str(exc),
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    return KickoffResponse(kickoff_id=kickoff_id)


@router.get("/status/{kickoff_id}", response_model=StatusResponse)
def status(kickoff_id: UUID) -> StatusResponse:
    """Return status and result for a given kickoff_id. FastAPI validates UUID format → 422 if malformed."""
    kid = str(kickoff_id)
    run = _runs.get(kid)
    if run is None:
        raise HTTPException(status_code=404, detail=f"kickoff_id {kid!r} not found")

    return StatusResponse(**run)
