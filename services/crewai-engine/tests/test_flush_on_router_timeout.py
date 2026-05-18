"""Test — flush_run_steps is called on _execute_dynamic_flow_background error paths.

Verifies that flush_run_steps() is invoked in the TimeoutError, CancelledError,
and generic Exception handlers of _execute_dynamic_flow_background, preventing
_StepWriter / queue / thread leaks when crew.kickoff() hangs indefinitely.

Pattern notes (mirrors test_flow_timeout.py):
  - Both asyncio.to_thread AND asyncio.wait_for are mocked to avoid the
    "coroutine never awaited" RuntimeWarning (see test_flow_timeout.py header).
  - flush_run_steps is mocked at the swarms module level (where it is imported)
    so the patch intercepts the call-site, not the definition site.
"""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest


async def _run_background(swarm_id: str, run_id: str, trigger: str, inputs: dict):
    """Import and invoke the background function under test."""
    from src.routes.swarms import _execute_dynamic_flow_background  # noqa: PLC0415

    await _execute_dynamic_flow_background(
        swarm_id=swarm_id,
        run_id=run_id,
        trigger=trigger,
        inputs=inputs,
    )


@pytest.mark.asyncio
class TestFlushRunStepsOnRouterErrorPaths:
    """flush_run_steps is called in every error path of _execute_dynamic_flow_background."""

    async def test_flush_called_on_timeout_error(self):
        """flush_run_steps must be called before update_swarm_run on TimeoutError."""
        from src.persistence import swarm_store  # noqa: PLC0415
        from src.routes import swarms as swarms_module  # noqa: PLC0415

        call_order: list[str] = []
        update_mock = MagicMock(side_effect=lambda *a, **kw: call_order.append("update"))
        flush_mock = MagicMock(side_effect=lambda *a: call_order.append("flush"))

        with (
            patch.object(swarms_module.asyncio, "to_thread", new=lambda *a, **kw: object()),
            patch.object(swarms_module.asyncio, "wait_for", side_effect=asyncio.TimeoutError),
            patch.object(swarm_store, "update_swarm_run", update_mock),
            patch.object(swarms_module, "flush_run_steps", flush_mock),
        ):
            await _run_background("swarm-1", "run-flush-1", "on_demand", {})

        flush_mock.assert_called_once_with("run-flush-1")
        update_mock.assert_called_once()
        # flush must happen before update
        assert call_order == ["flush", "update"], (
            f"Expected flush before update, got: {call_order}"
        )

    async def test_flush_called_on_cancelled_error(self):
        """flush_run_steps must be called before re-raise on CancelledError."""
        from src.persistence import swarm_store  # noqa: PLC0415
        from src.routes import swarms as swarms_module  # noqa: PLC0415

        flush_mock = MagicMock()
        update_mock = MagicMock(return_value=True)

        with (
            patch.object(swarms_module.asyncio, "to_thread", new=lambda *a, **kw: object()),
            patch.object(swarms_module.asyncio, "wait_for", side_effect=asyncio.CancelledError),
            patch.object(swarm_store, "update_swarm_run", update_mock),
            patch.object(swarms_module, "flush_run_steps", flush_mock),
            pytest.raises(asyncio.CancelledError),
        ):
            await _run_background("swarm-1", "run-flush-2", "morning", {})

        flush_mock.assert_called_once_with("run-flush-2")
        update_mock.assert_called_once()

    async def test_flush_called_on_generic_exception(self):
        """flush_run_steps must be called before update_swarm_run on generic Exception."""
        from src.persistence import swarm_store  # noqa: PLC0415
        from src.routes import swarms as swarms_module  # noqa: PLC0415

        flush_mock = MagicMock()
        update_mock = MagicMock(return_value=True)
        boom = RuntimeError("LLM hung and then crashed")

        with (
            patch.object(swarms_module.asyncio, "to_thread", new=lambda *a, **kw: object()),
            patch.object(swarms_module.asyncio, "wait_for", side_effect=boom),
            patch.object(swarm_store, "update_swarm_run", update_mock),
            patch.object(swarms_module, "flush_run_steps", flush_mock),
        ):
            await _run_background("swarm-1", "run-flush-3", "evening", {})

        flush_mock.assert_called_once_with("run-flush-3")
        update_mock.assert_called_once()
        call_kwargs = update_mock.call_args
        assert call_kwargs.kwargs.get("status") == "failed"

    async def test_flush_not_called_on_success(self):
        """On success, flush_run_steps is NOT called by _execute_dynamic_flow_background.

        The flow's run_crew() is responsible for flushing on the happy path.
        """
        from src.persistence import swarm_store  # noqa: PLC0415
        from src.routes import swarms as swarms_module  # noqa: PLC0415

        flush_mock = MagicMock()
        update_mock = MagicMock(return_value=True)

        async def _noop(*args, **kwargs):
            return None

        with (
            patch.object(swarms_module.asyncio, "to_thread", new=lambda *a, **kw: object()),
            patch.object(swarms_module.asyncio, "wait_for", new=_noop),
            patch.object(swarm_store, "update_swarm_run", update_mock),
            patch.object(swarms_module, "flush_run_steps", flush_mock),
        ):
            await _run_background("swarm-1", "run-flush-4", "on_demand", {})

        flush_mock.assert_not_called()
        update_mock.assert_not_called()
