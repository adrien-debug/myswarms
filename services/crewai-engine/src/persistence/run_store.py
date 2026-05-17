"""Supabase persistence for Chief of Staff run logs.

Fail-soft: if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set,
operations log a warning and return None without crashing.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from ..config import settings

logger = logging.getLogger(__name__)

_supabase_client = None


def _get_client():
    """Return a singleton Supabase client or None if not configured."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured — run logs will be in-memory only")
        return None
    try:
        from supabase import create_client  # type: ignore[import-untyped]
        # Uses SUPABASE_SERVICE_ROLE_KEY which bypasses Row Level Security (RLS) entirely.
        # This client must never be used to serve browser-facing data directly.
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        return _supabase_client
    except Exception as exc:  # noqa: BLE001
        logger.warning("Supabase client init failed: %s", exc)
        return None


def save_run(
    kickoff_id: str,
    trigger: str,
    status: str = "running",
    started_at: str | None = None,
) -> bool:
    """Insert a new run record. Returns True on success, False on failure/no-op."""
    client = _get_client()
    if client is None:
        return False
    try:
        payload: dict[str, Any] = {
            "kickoff_id": kickoff_id,
            "trigger": trigger,
            "status": status,
            "started_at": started_at or datetime.now(timezone.utc).isoformat(),
        }
        client.table("chief_run_log").insert(payload).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("save_run failed for %s: %s", kickoff_id, exc)
        return False


def update_run(
    kickoff_id: str,
    status: str,
    result: str | None = None,
    finished_at: str | None = None,
    error_text: str | None = None,
    langfuse_trace_id: str | None = None,
    state_json: dict | None = None,
    total_tokens_in: int = 0,
    total_tokens_out: int = 0,
) -> bool:
    """Update an existing run record. Returns True on success."""
    client = _get_client()
    if client is None:
        return False
    try:
        payload: dict[str, Any] = {
            "status": status,
            "finished_at": finished_at or datetime.now(timezone.utc).isoformat(),
        }
        if result is not None:
            payload["result"] = result
        if error_text is not None:
            payload["error_text"] = error_text
        if langfuse_trace_id is not None:
            payload["langfuse_trace_id"] = langfuse_trace_id
        if state_json is not None:
            payload["state_json"] = state_json
        if total_tokens_in:
            payload["total_tokens_in"] = total_tokens_in
        if total_tokens_out:
            payload["total_tokens_out"] = total_tokens_out

        client.table("chief_run_log").update(payload).eq("kickoff_id", kickoff_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_run failed for %s: %s", kickoff_id, exc)
        return False


def get_run(kickoff_id: str) -> dict[str, Any] | None:
    """Fetch a run by kickoff_id. Returns None on miss or failure."""
    client = _get_client()
    if client is None:
        return None
    try:
        result = (
            client.table("chief_run_log")
            .select("*")
            .eq("kickoff_id", kickoff_id)
            .maybe_single()
            .execute()
        )
        return result.data if result else None
    except Exception as exc:  # noqa: BLE001
        logger.error("get_run failed for %s: %s", kickoff_id, exc)
        return None


def list_runs(limit: int = 20) -> list[dict[str, Any]]:
    """Fetch the most recent runs (ordered by started_at desc). Returns [] on failure."""
    client = _get_client()
    if client is None:
        return []
    try:
        result = (
            client.table("chief_run_log")
            .select("kickoff_id,trigger,status,started_at,finished_at,result")
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data if result else []
    except Exception as exc:  # noqa: BLE001
        logger.error("list_runs failed: %s", exc)
        return []
