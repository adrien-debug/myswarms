"""Persistance des steps Chief of Staff dans chief_run_steps.

Note archi V1: chief_run_id = kickoff_id (text) de chief_run_log.
Pas de FK uuid sur chief_run_log.id — voir commentaire migration 0014.
Dette V2: ajouter get_run_id_by_kickoff dans run_store et migrer vers uuid FK.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import logging

from ..config import settings

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("[chief_step_store] Supabase not configured — steps will not be persisted")
        return None
    try:
        from supabase import create_client
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        return _client
    except Exception as exc:  # noqa: BLE001
        logger.warning("[chief_step_store] client init failed: %s", exc)
        return None


def save_chief_step(
    chief_run_id: str,
    step_index: int,
    agent_name: str,
    task_name: str | None,
    output_text: str | None,
    started_at: datetime,
    finished_at: datetime | None = None,
) -> None:
    """Insert 1 row dans chief_run_steps. Fail-soft sur erreur Supabase.

    Args:
        chief_run_id: kickoff_id du run Chief (text, = chief_run_log.kickoff_id).
        step_index: index séquentiel du step (0-based).
        agent_name: rôle ou nom de l'agent CrewAI.
        task_name: description courte de la task (tronquée à 80 chars en amont).
        output_text: sortie brute de l'agent (tronquée à 2000 chars).
        started_at: datetime UTC de début du step.
        finished_at: datetime UTC de fin (None si pas encore terminé).
    """
    client = _get_client()
    if client is None:
        return
    latency_ms: int | None = None
    if finished_at and started_at:
        latency_ms = int((finished_at - started_at).total_seconds() * 1000)
    try:
        # Tronquer output_text à 2000 chars pour éviter row size explosion
        truncated = (output_text or "")[:2000]
        client.table("chief_run_steps").insert({
            "chief_run_id": chief_run_id,
            "step_index": step_index,
            "agent_name": agent_name,
            "task_name": task_name,
            "output_text": truncated,
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat() if finished_at else None,
            "latency_ms": latency_ms,
        }).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("[chief_step_store] save_chief_step failed: %s", exc)


def list_chief_steps(chief_run_id: str) -> list[dict[str, Any]]:
    """Retourne tous les steps d'un run Chief, ordonnés par step_index.

    Args:
        chief_run_id: kickoff_id du run Chief (text).

    Returns:
        Liste de dicts avec les colonnes step_index, agent_name, task_name,
        output_text, started_at, finished_at, latency_ms. [] sur erreur.
    """
    client = _get_client()
    if client is None:
        return []
    try:
        result = (
            client.table("chief_run_steps")
            .select("step_index,agent_name,task_name,output_text,started_at,finished_at,latency_ms")
            .eq("chief_run_id", chief_run_id)
            .order("step_index")
            .execute()
        )
        return result.data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("[chief_step_store] list_chief_steps failed: %s", exc)
        return []
