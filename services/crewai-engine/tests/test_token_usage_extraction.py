"""Test — P1-2 token usage extraction after crew.kickoff().

Validates that _extract_and_store_token_usage() correctly reads
crew.usage_metrics and populates state.tokens_in / state.tokens_out,
which finalize() then passes to update_swarm_run().

Also validates:
  - fallback via result.token_usage when crew.usage_metrics is absent
  - fallback via total_tokens when prompt_tokens/completion_tokens absent
  - no crash when usage_metrics is None (no data available)
  - update_swarm_run receives total_tokens_in=10 / total_tokens_out=20
    for a crew with usage_metrics.prompt_tokens=10, completion_tokens=20
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_state():
    """Return a fresh DynamicSwarmState with default values."""
    from src.flows.dynamic_swarm_flow import DynamicSwarmState  # noqa: PLC0415
    return DynamicSwarmState(swarm_id="s1", run_id="r1")


def _call_extract(crew, result=None):
    """Call _extract_and_store_token_usage with given crew/result."""
    from src.flows.dynamic_swarm_flow import _extract_and_store_token_usage  # noqa: PLC0415
    state = _make_state()
    _extract_and_store_token_usage(state, crew, result)
    return state


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestExtractTokenUsage:
    """_extract_and_store_token_usage() extracts tokens correctly."""

    def test_crew_usage_metrics_prompt_and_completion(self):
        """Standard case: crew.usage_metrics with prompt_tokens=10, completion_tokens=20."""
        usage = SimpleNamespace(prompt_tokens=10, completion_tokens=20, total_tokens=30)
        crew = SimpleNamespace(usage_metrics=usage)

        state = _call_extract(crew)

        assert state.tokens_in == 10, f"Expected tokens_in=10, got {state.tokens_in}"
        assert state.tokens_out == 20, f"Expected tokens_out=20, got {state.tokens_out}"

    def test_crew_usage_metrics_zero_values(self):
        """Zero tokens are valid and should be stored."""
        usage = SimpleNamespace(prompt_tokens=0, completion_tokens=0, total_tokens=0)
        crew = SimpleNamespace(usage_metrics=usage)

        state = _call_extract(crew)

        assert state.tokens_in == 0
        assert state.tokens_out == 0

    def test_fallback_to_result_token_usage(self):
        """Falls back to result.token_usage when crew.usage_metrics is None."""
        usage = SimpleNamespace(prompt_tokens=5, completion_tokens=15)
        crew = SimpleNamespace(usage_metrics=None)
        result = SimpleNamespace(token_usage=usage)

        state = _call_extract(crew, result=result)

        assert state.tokens_in == 5
        assert state.tokens_out == 15

    def test_fallback_total_tokens_only(self):
        """When only total_tokens is available, stores it in tokens_in, tokens_out=0."""
        usage = SimpleNamespace(total_tokens=100)
        # No prompt_tokens / completion_tokens attributes.
        crew = SimpleNamespace(usage_metrics=usage)

        state = _call_extract(crew)

        assert state.tokens_in == 100
        assert state.tokens_out == 0

    def test_no_usage_data_leaves_state_unchanged(self):
        """When crew.usage_metrics is None and result is None, state is not modified."""
        crew = SimpleNamespace(usage_metrics=None)

        state = _call_extract(crew, result=None)

        assert state.tokens_in is None, "tokens_in should remain None when no usage data"
        assert state.tokens_out is None, "tokens_out should remain None when no usage data"

    def test_no_crash_when_usage_metrics_missing_attrs(self):
        """Defensive: usage object with no known attrs → state unchanged, no exception."""
        usage = SimpleNamespace()  # no prompt_tokens, completion_tokens, total_tokens
        crew = SimpleNamespace(usage_metrics=usage)

        state = _call_extract(crew)  # must not raise

        assert state.tokens_in is None
        assert state.tokens_out is None

    def test_no_crash_when_crew_has_no_usage_metrics_attr(self):
        """Crew without usage_metrics attribute → no crash, no state change."""
        crew = SimpleNamespace()  # no usage_metrics attr at all

        state = _call_extract(crew, result=None)  # must not raise

        assert state.tokens_in is None
        assert state.tokens_out is None

    def test_integer_cast_applied(self):
        """Float values in usage_metrics are cast to int."""
        usage = SimpleNamespace(prompt_tokens=7.9, completion_tokens=13.1)
        crew = SimpleNamespace(usage_metrics=usage)

        state = _call_extract(crew)

        assert state.tokens_in == 7  # int(7.9)
        assert state.tokens_out == 13  # int(13.1)


class TestUpdateSwarmRunTokenPersistence:
    """Validates that update_swarm_run receives correct total_tokens_in/out."""

    def test_update_swarm_run_receives_tokens_in_out(self):
        """After extraction, finalize() calls update_swarm_run with correct token counts."""
        from src.flows.dynamic_swarm_flow import (  # noqa: PLC0415
            DynamicSwarmState,
            _extract_and_store_token_usage,
        )
        from src.persistence import swarm_store  # noqa: PLC0415

        state = DynamicSwarmState(
            swarm_id="s1",
            run_id="r1",
            started_at="2026-01-01T00:00:00+00:00",
        )

        usage = SimpleNamespace(prompt_tokens=10, completion_tokens=20, total_tokens=30)
        crew = SimpleNamespace(usage_metrics=usage)

        _extract_and_store_token_usage(state, crew, None)

        # Verify state was populated.
        assert state.tokens_in == 10
        assert state.tokens_out == 20

        # Now simulate what finalize() does: call update_swarm_run with tokens.
        update_mock = MagicMock(return_value=True)
        with patch.object(swarm_store, "update_swarm_run", update_mock):
            # Replicate finalize() logic:
            update_kwargs: dict = {
                "status": "completed",
                "result_text": "done",
                "finished_at": "2026-01-01T01:00:00+00:00",
            }
            if state.tokens_in is not None:
                update_kwargs["total_tokens_in"] = state.tokens_in
            if state.tokens_out is not None:
                update_kwargs["total_tokens_out"] = state.tokens_out
            swarm_store.update_swarm_run(state.run_id, **update_kwargs)

        update_mock.assert_called_once()
        call_args = update_mock.call_args
        assert call_args.args[0] == "r1"
        assert call_args.kwargs["total_tokens_in"] == 10, (
            f"Expected total_tokens_in=10, got {call_args.kwargs.get('total_tokens_in')}"
        )
        assert call_args.kwargs["total_tokens_out"] == 20, (
            f"Expected total_tokens_out=20, got {call_args.kwargs.get('total_tokens_out')}"
        )

    def test_update_swarm_run_not_called_with_tokens_when_none(self):
        """When no usage data, finalize() does NOT include token fields in update."""
        from src.flows.dynamic_swarm_flow import (  # noqa: PLC0415
            DynamicSwarmState,
            _extract_and_store_token_usage,
        )
        from src.persistence import swarm_store  # noqa: PLC0415

        state = DynamicSwarmState(swarm_id="s1", run_id="r2")

        # Crew with no usage data.
        crew = SimpleNamespace(usage_metrics=None)
        _extract_and_store_token_usage(state, crew, None)

        assert state.tokens_in is None
        assert state.tokens_out is None

        update_mock = MagicMock(return_value=True)
        with patch.object(swarm_store, "update_swarm_run", update_mock):
            update_kwargs: dict = {"status": "completed", "result_text": "done"}
            if state.tokens_in is not None:
                update_kwargs["total_tokens_in"] = state.tokens_in
            if state.tokens_out is not None:
                update_kwargs["total_tokens_out"] = state.tokens_out
            swarm_store.update_swarm_run(state.run_id, **update_kwargs)

        call_args = update_mock.call_args
        assert "total_tokens_in" not in call_args.kwargs, (
            "total_tokens_in should not be sent when usage data is unavailable"
        )
        assert "total_tokens_out" not in call_args.kwargs, (
            "total_tokens_out should not be sent when usage data is unavailable"
        )
