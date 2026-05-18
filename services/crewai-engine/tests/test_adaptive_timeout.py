"""Test — adaptive flow timeout helper.

Tests that _adaptive_flow_timeout() returns:
  - FLOW_TIMEOUT_SECONDS when n_tasks=0 (unknown / no tasks)
  - max(FLOW_TIMEOUT_SECONDS, n_tasks * PER_TASK_TIMEOUT_SECONDS) for n_tasks > 0

No mocking needed — the function is a pure computation using settings values.
"""
from __future__ import annotations


class TestAdaptiveFlowTimeout:
    """_adaptive_flow_timeout() returns the correct effective timeout."""

    def test_zero_tasks_returns_flow_timeout_seconds(self):
        """n_tasks=0 falls back to FLOW_TIMEOUT_SECONDS (no per-task scaling)."""
        from src.config import settings  # noqa: PLC0415
        from src.routes.swarms import _adaptive_flow_timeout  # noqa: PLC0415

        result = _adaptive_flow_timeout(0)
        assert result == settings.FLOW_TIMEOUT_SECONDS

    def test_ten_tasks_returns_max_of_floor_and_per_task_budget(self):
        """n_tasks=10 returns max(FLOW_TIMEOUT_SECONDS, 10 * PER_TASK_TIMEOUT_SECONDS).

        With defaults: max(900, 10 * 120) = max(900, 1200) = 1200.
        """
        from src.config import settings  # noqa: PLC0415
        from src.routes.swarms import _adaptive_flow_timeout  # noqa: PLC0415

        result = _adaptive_flow_timeout(10)
        expected = max(settings.FLOW_TIMEOUT_SECONDS, 10 * settings.PER_TASK_TIMEOUT_SECONDS)
        assert result == expected

    def test_small_task_count_uses_floor(self):
        """n_tasks=2 with defaults: max(900, 2*120)=max(900,240)=900 — floor wins."""
        from src.config import settings  # noqa: PLC0415
        from src.routes.swarms import _adaptive_flow_timeout  # noqa: PLC0415

        result = _adaptive_flow_timeout(2)
        expected = max(settings.FLOW_TIMEOUT_SECONDS, 2 * settings.PER_TASK_TIMEOUT_SECONDS)
        assert result == expected
        # With defaults (900, 120): max(900, 240) = 900
        assert result == settings.FLOW_TIMEOUT_SECONDS

    def test_large_task_count_scales_beyond_floor(self):
        """n_tasks=20 with defaults: max(900, 20*120)=max(900,2400)=2400 — per-task wins."""
        from src.config import settings  # noqa: PLC0415
        from src.routes.swarms import _adaptive_flow_timeout  # noqa: PLC0415

        result = _adaptive_flow_timeout(20)
        expected = max(settings.FLOW_TIMEOUT_SECONDS, 20 * settings.PER_TASK_TIMEOUT_SECONDS)
        assert result == expected
        # With defaults: max(900, 2400) = 2400
        assert result == 20 * settings.PER_TASK_TIMEOUT_SECONDS
