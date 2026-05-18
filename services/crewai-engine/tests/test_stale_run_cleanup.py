"""Test — stale-run cleanup functions.

Tests that swarm_store.cleanup_stale_runs() and run_store.cleanup_stale_runs()
behave correctly under three scenarios:
  (a) Client None → return 0 (fail-soft, no exception).
  (b) Query shape: calls .update(status=failed) .eq(status,running) .lt(started_at, cutoff).
  (c) Happy path: returns the count of rows updated.

All Supabase calls are mocked — we test the LOGIC, not real DB queries.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch


# ── Stub builder (same pattern as test_owner_scoping.py) ─────────────────────


def _chain(side_effect=None, data=None):
    """Build a minimal fluent Supabase chain stub."""
    chain = MagicMock()
    for method in (
        "table", "select", "eq", "in_", "order", "limit", "maybe_single",
        "insert", "update", "delete", "lt",
    ):
        getattr(chain, method).return_value = chain
    if side_effect is not None:
        chain.execute.side_effect = side_effect
    else:
        r = MagicMock()
        r.data = data
        chain.execute.return_value = r
    return chain


# ── swarm_store.cleanup_stale_runs ────────────────────────────────────────────


class TestSwarmStoreCleanupStaleRuns:
    """swarm_store.cleanup_stale_runs() behaviour."""

    def test_returns_zero_when_client_none(self):
        """Returns 0 and does not raise when Supabase client is None."""
        from src.persistence import swarm_store  # noqa: PLC0415

        with patch.object(swarm_store, "_get_client", return_value=None):
            result = swarm_store.cleanup_stale_runs(30)

        assert result == 0

    def test_builds_correct_query(self):
        """Calls .update(status=failed) .eq('status','running') .lt('started_at', cutoff)."""
        from src.persistence import swarm_store  # noqa: PLC0415

        stub = _chain(data=[{"id": "run-1"}])

        with patch.object(swarm_store, "_get_client", return_value=stub):
            swarm_store.cleanup_stale_runs(30)

        # Verify .update was called with the right status
        update_calls = stub.update.call_args_list
        assert len(update_calls) == 1
        update_payload = update_calls[0].args[0]
        assert update_payload["status"] == "failed"
        assert update_payload["error_text"] == "Run abandoned — no heartbeat (stale cleanup)"
        assert "finished_at" in update_payload

        # Verify .eq("status", "running") was called
        eq_calls = stub.eq.call_args_list
        eq_args = [c.args for c in eq_calls]
        assert ("status", "running") in eq_args

        # Verify .lt("started_at", ...) was called
        lt_calls = stub.lt.call_args_list
        assert len(lt_calls) == 1
        assert lt_calls[0].args[0] == "started_at"

    def test_returns_count_of_updated_rows(self):
        """Returns the number of rows returned by the DB update."""
        from src.persistence import swarm_store  # noqa: PLC0415

        stub = _chain(data=[{"id": "run-1"}, {"id": "run-2"}])

        with patch.object(swarm_store, "_get_client", return_value=stub):
            result = swarm_store.cleanup_stale_runs(30)

        assert result == 2

    def test_returns_zero_on_exception(self):
        """Returns 0 and does not raise if the DB call throws."""
        from src.persistence import swarm_store  # noqa: PLC0415

        stub = _chain(side_effect=RuntimeError("DB exploded"))

        with patch.object(swarm_store, "_get_client", return_value=stub):
            result = swarm_store.cleanup_stale_runs(30)

        assert result == 0


# ── run_store.cleanup_stale_runs ──────────────────────────────────────────────


class TestRunStoreCleanupStaleRuns:
    """run_store.cleanup_stale_runs() behaviour."""

    def test_returns_zero_when_client_none(self):
        """Returns 0 and does not raise when Supabase client is None."""
        from src.persistence import run_store  # noqa: PLC0415

        with patch.object(run_store, "_get_client", return_value=None):
            result = run_store.cleanup_stale_runs(30)

        assert result == 0

    def test_builds_correct_query(self):
        """Calls .update(status=failed) .eq('status','running') .lt('started_at', cutoff)."""
        from src.persistence import run_store  # noqa: PLC0415

        stub = _chain(data=[{"kickoff_id": "k-1"}])

        with patch.object(run_store, "_get_client", return_value=stub):
            run_store.cleanup_stale_runs(30)

        update_calls = stub.update.call_args_list
        assert len(update_calls) == 1
        update_payload = update_calls[0].args[0]
        assert update_payload["status"] == "failed"
        assert update_payload["error_text"] == "Run abandoned — no heartbeat (stale cleanup)"
        assert "finished_at" in update_payload

        eq_calls = stub.eq.call_args_list
        eq_args = [c.args for c in eq_calls]
        assert ("status", "running") in eq_args

        lt_calls = stub.lt.call_args_list
        assert len(lt_calls) == 1
        assert lt_calls[0].args[0] == "started_at"

    def test_returns_count_of_updated_rows(self):
        """Returns the number of rows returned by the DB update."""
        from src.persistence import run_store  # noqa: PLC0415

        stub = _chain(data=[{"kickoff_id": "k-1"}, {"kickoff_id": "k-2"}, {"kickoff_id": "k-3"}])

        with patch.object(run_store, "_get_client", return_value=stub):
            result = run_store.cleanup_stale_runs(30)

        assert result == 3

    def test_returns_zero_on_exception(self):
        """Returns 0 and does not raise if the DB call throws."""
        from src.persistence import run_store  # noqa: PLC0415

        stub = _chain(side_effect=RuntimeError("timeout"))

        with patch.object(run_store, "_get_client", return_value=stub):
            result = run_store.cleanup_stale_runs(30)

        assert result == 0
