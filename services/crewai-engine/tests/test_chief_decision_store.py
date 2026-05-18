"""Test — chief_decision_store persistence module.

Tests record_decision() and list_decisions() with mocked Supabase client.
All Supabase calls are stubbed — we test payload shape, snooze_until
calculation, ValueError on bad actions, and fail-soft behaviour.
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


# ── Tests: record_decision ────────────────────────────────────────────────────


class TestRecordDecision:
    """record_decision() payload, snooze logic, error handling."""

    def test_rejected_payload_no_snooze_until(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        stub = _chain(data=[{"id": "dec-1", "action": "rejected"}])
        with patch.object(chief_decision_store, "_get_client", return_value=stub):
            chief_decision_store.record_decision("run-1", "rejected")

        insert_payload = stub.insert.call_args[0][0]
        assert insert_payload["chief_run_id"] == "run-1"
        assert insert_payload["action"] == "rejected"
        assert "snooze_until" not in insert_payload

    def test_sent_payload_no_snooze_until(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        stub = _chain(data=[{"id": "dec-2", "action": "sent"}])
        with patch.object(chief_decision_store, "_get_client", return_value=stub):
            chief_decision_store.record_decision("run-1", "sent")

        insert_payload = stub.insert.call_args[0][0]
        assert insert_payload["action"] == "sent"
        assert "snooze_until" not in insert_payload

    def test_snoozed_default_hours_approximately_2h(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        stub = _chain(data=[{"id": "dec-3", "action": "snoozed"}])
        with patch.object(chief_decision_store, "_get_client", return_value=stub):
            chief_decision_store.record_decision("run-1", "snoozed")

        insert_payload = stub.insert.call_args[0][0]
        assert "snooze_until" in insert_payload

        snooze_dt = datetime.fromisoformat(insert_payload["snooze_until"].replace("Z", "+00:00"))
        expected = datetime.now(timezone.utc) + timedelta(hours=chief_decision_store.DEFAULT_SNOOZE_HOURS)
        assert abs((snooze_dt - expected).total_seconds()) < 5, (
            f"snooze_until should be ~{chief_decision_store.DEFAULT_SNOOZE_HOURS}h from now"
        )

    def test_snoozed_custom_hours(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        stub = _chain(data=[{"id": "dec-4", "action": "snoozed"}])
        with patch.object(chief_decision_store, "_get_client", return_value=stub):
            chief_decision_store.record_decision("run-1", "snoozed", snooze_hours=4)

        insert_payload = stub.insert.call_args[0][0]
        snooze_dt = datetime.fromisoformat(insert_payload["snooze_until"].replace("Z", "+00:00"))
        expected = datetime.now(timezone.utc) + timedelta(hours=4)
        assert abs((snooze_dt - expected).total_seconds()) < 5

    def test_snoozed_zero_hours_falls_back_to_default(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        stub = _chain(data=[{"id": "dec-5", "action": "snoozed"}])
        with patch.object(chief_decision_store, "_get_client", return_value=stub):
            chief_decision_store.record_decision("run-1", "snoozed", snooze_hours=0)

        insert_payload = stub.insert.call_args[0][0]
        snooze_dt = datetime.fromisoformat(insert_payload["snooze_until"].replace("Z", "+00:00"))
        expected = datetime.now(timezone.utc) + timedelta(hours=chief_decision_store.DEFAULT_SNOOZE_HOURS)
        assert abs((snooze_dt - expected).total_seconds()) < 5, (
            "snooze_hours=0 should fall back to DEFAULT_SNOOZE_HOURS"
        )

    def test_invalid_action_raises_value_error(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        stub = _chain(data=[])
        with patch.object(chief_decision_store, "_get_client", return_value=stub):
            with pytest.raises(ValueError, match="Invalid action"):
                chief_decision_store.record_decision("run-1", "invalid_action")

    def test_returns_none_when_client_none(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        with patch.object(chief_decision_store, "_get_client", return_value=None):
            result = chief_decision_store.record_decision("run-1", "rejected")

        assert result is None

    def test_no_crash_on_supabase_insert_exception(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        stub = _chain(side_effect=RuntimeError("network error"))
        with patch.object(chief_decision_store, "_get_client", return_value=stub):
            result = chief_decision_store.record_decision("run-1", "sent")

        assert result is None


# ── Tests: list_decisions ─────────────────────────────────────────────────────


class TestListDecisions:
    """list_decisions() behaviour under various conditions."""

    def test_returns_empty_list_when_client_none(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        with patch.object(chief_decision_store, "_get_client", return_value=None):
            result = chief_decision_store.list_decisions("run-1")

        assert result == []

    def test_returns_data_ordered_desc_by_created_at(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        rows = [
            {"id": "dec-2", "action": "sent", "snooze_until": None, "created_at": "2026-01-02T00:00:00"},
            {"id": "dec-1", "action": "rejected", "snooze_until": None, "created_at": "2026-01-01T00:00:00"},
        ]
        stub = _chain(data=rows)
        with patch.object(chief_decision_store, "_get_client", return_value=stub):
            result = chief_decision_store.list_decisions("run-99")

        assert result == rows
        stub.order.assert_called_once_with("created_at", desc=True)
        stub.eq.assert_called_once_with("chief_run_id", "run-99")

    def test_returns_empty_list_on_supabase_exception(self):
        from src.persistence import chief_decision_store  # noqa: PLC0415

        stub = _chain(side_effect=RuntimeError("timeout"))
        with patch.object(chief_decision_store, "_get_client", return_value=stub):
            result = chief_decision_store.list_decisions("run-1")

        assert result == []
