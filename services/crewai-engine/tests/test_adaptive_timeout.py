"""Test — adaptive flow timeout helper.

Tests that _adaptive_flow_timeout() returns:
  - FLOW_TIMEOUT_SECONDS when n_tasks=0 (unknown / no tasks)
  - min(MAX_FLOW_TIMEOUT_SECONDS, max(FLOW_TIMEOUT_SECONDS, n_tasks * PER_TASK_TIMEOUT_SECONDS))
    for n_tasks > 0

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
        """n_tasks=10 returns min(MAX, max(FLOW_TIMEOUT_SECONDS, 10 * PER_TASK_TIMEOUT_SECONDS)).

        With defaults: min(1800, max(900, 10 * 120)) = min(1800, 1200) = 1200.
        """
        from src.config import settings  # noqa: PLC0415
        from src.routes.swarms import _adaptive_flow_timeout  # noqa: PLC0415

        result = _adaptive_flow_timeout(10)
        expected = min(
            settings.MAX_FLOW_TIMEOUT_SECONDS,
            max(settings.FLOW_TIMEOUT_SECONDS, 10 * settings.PER_TASK_TIMEOUT_SECONDS),
        )
        assert result == expected

    def test_small_task_count_uses_floor(self):
        """n_tasks=2 with defaults: min(1800, max(900, 2*120))=min(1800,900)=900 — floor wins."""
        from src.config import settings  # noqa: PLC0415
        from src.routes.swarms import _adaptive_flow_timeout  # noqa: PLC0415

        result = _adaptive_flow_timeout(2)
        expected = min(
            settings.MAX_FLOW_TIMEOUT_SECONDS,
            max(settings.FLOW_TIMEOUT_SECONDS, 2 * settings.PER_TASK_TIMEOUT_SECONDS),
        )
        assert result == expected
        # With defaults (900, 120, cap=1800): min(1800, max(900, 240)) = 900
        assert result == settings.FLOW_TIMEOUT_SECONDS

    def test_large_task_count_is_capped_by_max_flow_timeout(self):
        """n_tasks=20 with defaults: min(1800, max(900, 20*120))=min(1800,2400)=1800 — cap wins.

        Before the fix this returned 2400 (> STALE_RUN_MAX_AGE_MINUTES * 60 = 1800),
        which caused the cleanup job to kill a still-running valid run.
        """
        from src.config import settings  # noqa: PLC0415
        from src.routes.swarms import _adaptive_flow_timeout  # noqa: PLC0415

        result = _adaptive_flow_timeout(20)
        # With defaults: min(1800, max(900, 2400)) = min(1800, 2400) = 1800
        assert result == settings.MAX_FLOW_TIMEOUT_SECONDS

    def test_very_large_task_count_always_returns_max_cap(self):
        """Any n_tasks producing per-task budget > MAX_FLOW_TIMEOUT_SECONDS is capped."""
        from src.config import settings  # noqa: PLC0415
        from src.routes.swarms import _adaptive_flow_timeout  # noqa: PLC0415

        # 1000 tasks × 120s = 120 000s >> cap of 1800s
        result = _adaptive_flow_timeout(1000)
        assert result == settings.MAX_FLOW_TIMEOUT_SECONDS

    def test_stale_run_invariant_holds_with_defaults(self):
        """STALE_RUN_MAX_AGE_MINUTES * 60 must be strictly > MAX_FLOW_TIMEOUT_SECONDS.

        This invariant ensures the cleanup job never marks a still-running
        (within adaptive budget) run as failed.
        """
        from src.config import settings  # noqa: PLC0415

        stale_cutoff_seconds = settings.STALE_RUN_MAX_AGE_MINUTES * 60
        assert stale_cutoff_seconds > settings.MAX_FLOW_TIMEOUT_SECONDS, (
            f"Invariant violated: STALE_RUN_MAX_AGE_MINUTES*60={stale_cutoff_seconds}s "
            f"must be > MAX_FLOW_TIMEOUT_SECONDS={settings.MAX_FLOW_TIMEOUT_SECONDS}s"
        )
