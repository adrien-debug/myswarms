"""Persistance des décisions utilisateur sur les P0 du Chief.

Note archi V1: chief_run_id = kickoff_id (text) de chief_run_log.
Pas de FK uuid sur chief_run_log.id — voir commentaire migration 0014.
Dette V2: ajouter get_run_id_by_kickoff dans run_store et migrer vers uuid FK.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
import logging
from typing import Any

from ..config import settings

logger = logging.getLogger(__name__)

_client = None

VALID_ACTIONS = frozenset({"sent", "snoozed", "rejected"})

# Default snooze duration when action='snoozed' but no snooze_hours provided.
# Prevents permanent disappearance of P0 items from the frontend.
DEFAULT_SNOOZE_HOURS = 2


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("[chief_decision_store] Supabase not configured — decisions will not be persisted")
        return None
    try:
        from supabase import create_client
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        return _client
    except Exception as exc:  # noqa: BLE001
        logger.warning("[chief_decision_store] client init failed: %s", exc)
        return None


def record_decision(
    chief_run_id: str,
    action: str,
    snooze_hours: int | None = None,
) -> dict[str, Any] | None:
    """Insert 1 row dans chief_decisions et retourne le record créé.

    Args:
        chief_run_id: kickoff_id du run Chief (text, = chief_run_log.kickoff_id).
        action: 'sent', 'snoozed', ou 'rejected'.
        snooze_hours: durée du snooze en heures (uniquement si action='snoozed').

    Returns:
        Le record inséré (dict), ou None si Supabase non configuré ou erreur.

    Raises:
        ValueError: si action n'est pas dans VALID_ACTIONS.
    """
    if action not in VALID_ACTIONS:
        raise ValueError(f"Invalid action: {action!r}. Must be one of {sorted(VALID_ACTIONS)}")
    client = _get_client()
    if client is None:
        return None
    payload: dict[str, Any] = {
        "chief_run_id": chief_run_id,
        "action": action,
    }
    if action == "snoozed":
        # P2.7 — default to DEFAULT_SNOOZE_HOURS if snooze_hours absent/invalid.
        # Without this, a snoozed item with no duration has no snooze_until and
        # the frontend treats it as permanently hidden.
        hours = snooze_hours if (snooze_hours and snooze_hours > 0) else DEFAULT_SNOOZE_HOURS
        payload["snooze_until"] = (
            datetime.now(timezone.utc) + timedelta(hours=hours)
        ).isoformat()
    try:
        result = client.table("chief_decisions").insert(payload).execute()
        return (result.data or [None])[0]
    except Exception as exc:  # noqa: BLE001
        logger.warning("[chief_decision_store] record_decision failed: %s", exc)
        return None


def list_decisions(chief_run_id: str) -> list[dict[str, Any]]:
    """Retourne toutes les décisions d'un run Chief, ordonnées par created_at desc.

    Args:
        chief_run_id: kickoff_id du run Chief (text).

    Returns:
        Liste de dicts avec id, action, snooze_until, created_at. [] sur erreur.
    """
    client = _get_client()
    if client is None:
        return []
    try:
        result = (
            client.table("chief_decisions")
            .select("id,action,snooze_until,created_at")
            .eq("chief_run_id", chief_run_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("[chief_decision_store] list_decisions failed: %s", exc)
        return []
