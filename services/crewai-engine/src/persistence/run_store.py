"""Supabase persistence for Chief of Staff run logs.

Fail-soft: if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set,
operations log a warning and return None without crashing.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
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
        from supabase import create_client  # type: ignore[import-untyped] -- supabase-py sans stubs mypy
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
    owner_id: str | None = None,
) -> bool:
    """Insert a new run record. Returns True on success, False on failure/no-op.

    `owner_id` is written to `chief_run_log.owner_id` (migration 0015).
    The engine uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) so explicit
    owner_id insertion is required for proper multi-tenant scoping.
    Passing owner_id=None preserves legacy behaviour (nullable column).
    """
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
        if owner_id is not None:
            payload["owner_id"] = owner_id
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


def get_run(
    kickoff_id: str,
    owner_id: str | None = None,
) -> dict[str, Any] | None:
    """Fetch a run by kickoff_id. Returns None on miss or failure.

    If `owner_id` is provided, adds an explicit `.eq("owner_id", owner_id)`
    filter — required because the engine bypasses RLS (service-role key).
    Passing owner_id=None returns the run regardless of ownership (legacy).
    """
    client = _get_client()
    if client is None:
        return None
    try:
        query = (
            client.table("chief_run_log")
            .select("*")
            .eq("kickoff_id", kickoff_id)
        )
        if owner_id is not None:
            query = query.eq("owner_id", owner_id)
        result = query.maybe_single().execute()
        return result.data if result else None
    except Exception as exc:  # noqa: BLE001
        logger.error("get_run failed for %s: %s", kickoff_id, exc)
        return None


def cleanup_stale_runs(max_age_minutes: int) -> int:
    """Mark 'running' chief_run_log rows older than max_age_minutes as failed.

    Targets rows with status='running' AND started_at < now(utc) - max_age_minutes.
    Updates status to 'failed', sets error_text and finished_at. Fail-soft:
    returns 0 on any error.

    Returns the number of rows updated.
    """
    client = _get_client()
    if client is None:
        return 0
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)).isoformat()
        result = (
            client.table("chief_run_log")
            .update(
                {
                    "status": "failed",
                    "error_text": "Run abandoned — no heartbeat (stale cleanup)",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("status", "running")
            .lt("started_at", cutoff)
            .execute()
        )
        count = len(result.data) if result and result.data else 0
        return count
    except Exception as exc:  # noqa: BLE001
        logger.warning("cleanup_stale_runs (chief_run_log) failed: %s", exc)
        return 0


def list_runs(
    limit: int = 20,
    owner_id: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch the most recent runs (ordered by started_at desc). Returns [] on failure.

    If `owner_id` is provided, adds an explicit `.eq("owner_id", owner_id)`
    filter — required because the engine bypasses RLS (service-role key).
    Scoping is real since migration 0015 added `owner_id` to `chief_run_log`.
    Passing owner_id=None returns all runs regardless of ownership (legacy).
    """
    client = _get_client()
    if client is None:
        return []
    try:
        query = (
            client.table("chief_run_log")
            .select("kickoff_id,trigger,status,started_at,finished_at,result")
            .order("started_at", desc=True)
            .limit(limit)
        )
        if owner_id is not None:
            query = query.eq("owner_id", owner_id)
        result = query.execute()
        return result.data if result else []
    except Exception as exc:  # noqa: BLE001
        logger.error("list_runs failed: %s", exc)
        return []
