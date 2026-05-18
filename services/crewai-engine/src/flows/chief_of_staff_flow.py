"""Daily Chief of Staff — Flow orchestration.

Replaces the Hello World stub with the real 8-agent hierarchical crew.
In mock mode (AGENT_MOCK_MODE=true), returns structured mock data without LLM calls.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from crewai import Flow
from crewai.flow.flow import listen, start
from pydantic import BaseModel, Field

from ..config import settings
from ..crews.daily_chief_crew import create_daily_chief_crew

logger = logging.getLogger(__name__)


class ChiefOfStaffState(BaseModel):
    # Core input
    trigger: str = "on_demand"
    user_timezone: str = "Asia/Dubai"
    user_language: str = "fr"
    additional_inputs: dict[str, Any] = Field(default_factory=dict)

    # Mock mode: if True, skip real crew and return mock data
    mock_mode: bool = False

    # chief_run_id: kickoff_id (text) propagated from routes/crews.py so that
    # create_daily_chief_crew() can register the task_callback for step persistence.
    # Injected into state via initial_state before flow.kickoff() is called.
    chief_run_id: str = ""

    # Crew output
    crew_result: str = ""
    summary: str = ""

    # Flow metadata
    started_at: str = ""
    completed_at: str = ""
    message: str = ""  # Used by routes/crews.py StatusResponse.result (backward-compat). See routes/crews.py:83.


class ChiefOfStaffFlow(Flow[ChiefOfStaffState]):
    """Daily Chief of Staff orchestration flow.

    In mock mode (AGENT_MOCK_MODE=true), returns structured mock data without calling LLMs.
    In production, delegates to the full 8-agent hierarchical crew.
    """

    @start()
    def initialize(self) -> str:
        """Set flow metadata at start.

        mock_mode priority: AGENT_MOCK_MODE=true env var always wins (global admin
        override — prevents accidental prod calls). If env=false, the caller's
        mock_mode input value (merged into state before initialize() runs) is
        respected as-is, enabling test runs to activate mock without touching env.
        """
        self.state.started_at = datetime.now(timezone.utc).isoformat()

        # Global env override: if AGENT_MOCK_MODE is true, always mock regardless
        # of what the caller requested (admin safety net).
        # If env is false, preserve whatever the caller set via inputs (may be True
        # for integration tests, or False for normal prod calls — both are respected).
        if getattr(settings, "AGENT_MOCK_MODE", False):
            self.state.mock_mode = True

        logger.info(
            "ChiefOfStaffFlow starting — trigger=%s, mock=%s",
            self.state.trigger,
            self.state.mock_mode,
        )
        return self.state.trigger

    @listen(initialize)
    def run_crew(self, trigger: str) -> str:
        """Run the Daily Chief crew (delegated to 8 agents)."""
        if self.state.mock_mode:
            return self._mock_result(trigger)

        try:
            crew = create_daily_chief_crew(
                trigger=self.state.trigger,
                user_timezone=self.state.user_timezone,
                user_language=self.state.user_language,
                # chief_run_id injected from routes/crews.py via initial state — enables
                # task_callback to persist each completed step to chief_run_steps.
                chief_run_id=self.state.chief_run_id or None,
            )
            result = crew.kickoff(
                inputs={
                    "trigger": self.state.trigger,
                    "user_timezone": self.state.user_timezone,
                    "user_language": self.state.user_language,
                }
            )
            self.state.crew_result = str(result)
            return self.state.crew_result
        except Exception as exc:
            logger.error("Crew execution failed: %s", exc, exc_info=True)
            raise

    @listen(run_crew)
    def finalize(self, crew_output: str) -> str:
        """Package the final summary."""
        self.state.completed_at = datetime.now(timezone.utc).isoformat()
        self.state.summary = crew_output
        # Populate backward-compat alias consumed by routes/crews.py StatusResponse.state["message"]
        self.state.message = (
            f"ChiefOfStaffFlow completed (trigger={self.state.trigger})"
        )
        logger.info(
            "ChiefOfStaffFlow completed — trigger=%s", self.state.trigger
        )
        return self.state.summary

    # ── private ──────────────────────────────────────────────────────────────

    def _mock_result(self, trigger: str) -> str:
        """Return structured mock data for testing without LLM API calls."""
        mock_data = {
            "mode": "mock",
            "trigger": trigger,
            "inbox_summary": {
                "total": 5,
                "p0": 1,
                "p1": 2,
                "p2": 1,
                "p3_p4": 1,
            },
            "top_items": [
                {
                    "priority": "P0",
                    "from": "client@example.com",
                    "subject": "Contract review needed today",
                    "action": "Review and respond to contract",
                },
                {
                    "priority": "P1",
                    "from": "Sarah (Slack)",
                    "channel": "#alpha",
                    "action": "Validate option B before 16:00",
                },
            ],
            "schedule": [
                {
                    "time": "09:00-10:00",
                    "type": "deep-work",
                    "description": "Handle P0: contract review",
                },
                {
                    "time": "10:30-11:00",
                    "type": "meeting",
                    "description": "Client call (calendar)",
                },
                {
                    "time": "11:00-11:30",
                    "type": "email",
                    "description": "Respond to P1 emails",
                },
            ],
            "drafts_prepared": 2,
            "actions_automated": 3,
            "note": (
                "MOCK MODE — No real API calls made. "
                "Set AGENT_MOCK_MODE=false for production."
            ),
        }
        result = json.dumps(mock_data, ensure_ascii=False, indent=2)
        self.state.crew_result = result
        return result
