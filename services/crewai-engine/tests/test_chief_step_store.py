"""Test — chief_step_store persistence module.

Tests save_chief_step() and list_chief_steps() with mocked Supabase client.
All Supabase calls are stubbed — we test the logic, payload shape, and
fail-soft behaviour, not real DB writes.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest


# ── Stub builder ──────────────────────────────────────────────────────────────


def _chain(side_effect=None, data=None):
    """Build a minimal fluent Supabase chain stub."""
    chain = MagicMock()
    for method in (
        "table", "select", "eq", "in_", "order", "limit", "maybe_single",
        "insert", "update", "delete",
    ):
        getattr(chain, method).return_value = chain
    if side_effect is not None:
        chain.execute.side_effect = side_effect
    else:
        r = MagicMock()
        r.data = data
        chain.execute.return_value = r
    return chain


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture()
def _now():
    """Return a pair of (started_at, finished_at) datetimes 500ms apart."""
    started = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    finished = started + timedelta(milliseconds=500)
    return started, finished


# ── Tests: save_chief_step ────────────────────────────────────────────────────


class TestSaveChiefStep:
    """save_chief_step() behaviour under various conditions."""

    def test_no_crash_when_client_none(self, _now):
        from src.persistence import chief_step_store  # noqa: PLC0415

        started, finished = _now
        with patch.object(chief_step_store, "_get_client", return_value=None):
            # Must not raise
            chief_step_store.save_chief_step(
                chief_run_id="run-1",
                step_index=0,
                agent_name="ResearchAgent",
                task_name="search task",
                output_text="some output",
                started_at=started,
                finished_at=finished,
            )

    def test_correct_payload_sent_to_supabase(self, _now):
        from src.persistence import chief_step_store  # noqa: PLC0415

        started, finished = _now
        stub = _chain(data=[{"id": "step-uuid-1"}])

        with patch.object(chief_step_store, "_get_client", return_value=stub):
            chief_step_store.save_chief_step(
                chief_run_id="run-42",
                step_index=3,
                agent_name="WriterAgent",
                task_name="draft email",
                output_text="Dear friend,",
                started_at=started,
                finished_at=finished,
            )

        stub.table.assert_called_once_with("chief_run_steps")
        insert_call = stub.insert.call_args[0][0]

        assert insert_call["chief_run_id"] == "run-42"
        assert insert_call["step_index"] == 3
        assert insert_call["agent_name"] == "WriterAgent"
        assert insert_call["task_name"] == "draft email"
        assert insert_call["output_text"] == "Dear friend,"
        assert insert_call["started_at"] == started.isoformat()
        assert insert_call["finished_at"] == finished.isoformat()
        assert insert_call["latency_ms"] == 500

    def test_output_text_truncated_to_2000_chars(self, _now):
        from src.persistence import chief_step_store  # noqa: PLC0415

        started, finished = _now
        long_text = "x" * 5000
        stub = _chain(data=[{}])

        with patch.object(chief_step_store, "_get_client", return_value=stub):
            chief_step_store.save_chief_step(
                chief_run_id="run-1",
                step_index=0,
                agent_name="Agent",
                task_name=None,
                output_text=long_text,
                started_at=started,
                finished_at=finished,
            )

        insert_payload = stub.insert.call_args[0][0]
        assert len(insert_payload["output_text"]) == 2000
        assert insert_payload["output_text"] == "x" * 2000

    def test_finished_at_none_gives_latency_ms_none(self, _now):
        from src.persistence import chief_step_store  # noqa: PLC0415

        started, _ = _now
        stub = _chain(data=[{}])

        with patch.object(chief_step_store, "_get_client", return_value=stub):
            chief_step_store.save_chief_step(
                chief_run_id="run-1",
                step_index=1,
                agent_name="Agent",
                task_name="task",
                output_text="partial",
                started_at=started,
                finished_at=None,
            )

        insert_payload = stub.insert.call_args[0][0]
        assert insert_payload["latency_ms"] is None
        assert insert_payload["finished_at"] is None

    def test_no_crash_on_supabase_insert_exception(self, _now):
        from src.persistence import chief_step_store  # noqa: PLC0415

        started, finished = _now
        stub = _chain(side_effect=RuntimeError("DB is down"))

        with patch.object(chief_step_store, "_get_client", return_value=stub):
            # Must not raise
            chief_step_store.save_chief_step(
                chief_run_id="run-1",
                step_index=0,
                agent_name="Agent",
                task_name=None,
                output_text="output",
                started_at=started,
                finished_at=finished,
            )


# ── Tests: list_chief_steps ───────────────────────────────────────────────────


class TestListChiefSteps:
    """list_chief_steps() behaviour under various conditions."""

    def test_returns_empty_list_when_client_none(self):
        from src.persistence import chief_step_store  # noqa: PLC0415

        with patch.object(chief_step_store, "_get_client", return_value=None):
            result = chief_step_store.list_chief_steps("run-1")

        assert result == []

    def test_returns_data_from_supabase(self):
        from src.persistence import chief_step_store  # noqa: PLC0415

        rows = [
            {"step_index": 0, "agent_name": "A", "output_text": "first"},
            {"step_index": 1, "agent_name": "B", "output_text": "second"},
        ]
        stub = _chain(data=rows)

        with patch.object(chief_step_store, "_get_client", return_value=stub):
            result = chief_step_store.list_chief_steps("run-99")

        assert result == rows
        stub.order.assert_called_once_with("step_index")
        stub.eq.assert_called_once_with("chief_run_id", "run-99")

    def test_returns_empty_list_on_supabase_exception(self):
        from src.persistence import chief_step_store  # noqa: PLC0415

        stub = _chain(side_effect=RuntimeError("connection reset"))

        with patch.object(chief_step_store, "_get_client", return_value=stub):
            result = chief_step_store.list_chief_steps("run-1")

        assert result == []
