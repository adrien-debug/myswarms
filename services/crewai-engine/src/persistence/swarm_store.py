"""Supabase persistence — multi-swarm dynamic engine.

CRUD pour les tables `swarms`, `swarm_agents`, `swarm_tasks`, `tools`,
`swarm_tool_bindings`, `swarm_runs`, `swarm_run_steps`.

# TODO V2 [H7] : ce fichier dépasse 1200 lignes. Cohésion forte par domaine
# (toutes les opérations Supabase swarm-side), splitter en sous-modules
# (e.g. `swarm_crud.py` + `runs_crud.py` + `tools_crud.py`) introduirait
# une indirection sans bénéfice immédiat. Plan V2 : extraire en sous-modules
# par table principale et garder ce fichier comme façade qui ré-exporte.
# Critère de déclenchement : si on dépasse 1500L ou si plus de 3 contributeurs
# modifient le fichier en parallèle.

Fail-soft : si SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY est absent, ou si la
table n'existe pas encore, les opérations renvoient des valeurs neutres
(`None` / `False` / `[]`) avec un warning log — jamais d'exception remontée.

Contrat de colonnes (cf migration 0006_swarms_dynamic.sql) :

- swarms(id, owner_id, name, description, version, config_json, is_active,
         is_template, created_at, updated_at)
- swarm_agents(id, swarm_id, name, role, system_prompt, model_provider, model_name,
               temperature, max_tokens, parent_agent_id, position_x, position_y,
               created_at, updated_at)
  NB : pas de colonne `llm_tier`, pas de colonne `position` agrégée — uniquement
  `position_x` et `position_y`.
- swarm_tasks(id, swarm_id, agent_id, name, description, expected_output,
              depends_on_task_id, position_x, position_y, created_at, updated_at)
- tools(id, owner_id, name, category, description, endpoint_url, auth_type,
        schema_json, is_active, created_at, updated_at)
- swarm_tool_bindings(id, swarm_id, agent_id, tool_id, priority, config_json,
                      created_at)
- swarm_runs(id, swarm_id, trigger, status, inputs_json, result_text, started_at,
             finished_at, error_text, total_tokens_in, total_tokens_out,
             total_cost_usd, langfuse_trace_id, created_at)
- swarm_run_steps(id, run_id, agent_id, task_id, step_number, input_text,
                  output_text, tokens_in, tokens_out, cost_usd, latency_ms,
                  status, error_text, langfuse_span_id, created_at, finished_at)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from ..config import settings

logger = logging.getLogger(__name__)

_supabase_client = None


def _get_client():
    """Singleton Supabase client (service-role) — None si non configuré.

    Réutilise la même logique que `persistence/run_store.py` (ne partage pas
    le module-level cache pour éviter un couplage import-side).
    """
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured — swarm operations no-op")
        return None
    try:
        from supabase import create_client  # type: ignore[import-untyped]
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        return _supabase_client
    except Exception as exc:  # noqa: BLE001
        logger.warning("Supabase client init failed: %s", exc)
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Colonnes autorisées par table (whitelists pour éviter les écritures sauvages).
_AGENT_COLUMNS: set[str] = {
    "name",
    "role",
    "system_prompt",
    "model_provider",
    "model_name",
    "temperature",
    "max_tokens",
    "parent_agent_id",
    "position_x",
    "position_y",
}

_TASK_COLUMNS: set[str] = {
    "agent_id",
    "name",
    "description",
    "expected_output",
    "depends_on_task_id",
    "position_x",
    "position_y",
}

_BINDING_COLUMNS: set[str] = {
    "agent_id",
    "tool_id",
    "priority",
    "config_json",
}


def _filter_payload(payload: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
    """Filtre un payload selon une whitelist de colonnes (drop None et clés inconnues)."""
    return {k: v for k, v in payload.items() if k in allowed and v is not None}


# ── Swarms CRUD ──────────────────────────────────────────────────────────────


def get_swarm(
    swarm_id: str,
    owner_id: str | None = None,
) -> dict[str, Any] | None:
    """Charge un swarm complet (agents + tasks + tool_bindings).

    Si `owner_id` est fourni, filtre sur `swarms.owner_id` AVANT le filtre id —
    un swarm n'appartenant pas à l'owner renvoie None (404 côté route).
    Si `owner_id is None`, comportement service-role : pas de scoping.

    Renvoie un dict :
        {
          "swarm": {...colonnes swarms},
          "agents": [{...colonnes swarm_agents}],
          "tasks": [{...colonnes swarm_tasks}],
          "tool_bindings": [{...colonnes swarm_tool_bindings, "tool": {...}}]
        }
    Renvoie None si swarm introuvable, owner mismatch ou Supabase indispo.
    """
    client = _get_client()
    if client is None:
        return None
    try:
        query = client.table("swarms").select("*")
        if owner_id:
            query = query.eq("owner_id", owner_id)
        swarm_res = (
            query.eq("id", swarm_id)
            .maybe_single()
            .execute()
        )
        swarm = swarm_res.data if swarm_res else None
        if not swarm:
            return None

        agents_res = (
            client.table("swarm_agents")
            .select("*")
            .eq("swarm_id", swarm_id)
            .order("position_y", desc=False)
            .order("position_x", desc=False)
            .execute()
        )
        agents = agents_res.data if agents_res else []

        tasks_res = (
            client.table("swarm_tasks")
            .select("*")
            .eq("swarm_id", swarm_id)
            .order("position_y", desc=False)
            .order("position_x", desc=False)
            .execute()
        )
        tasks = tasks_res.data if tasks_res else []

        # Joint tools via swarm_tool_bindings.tool_id → tools.id.
        # On évite une vraie jointure PostgREST (syntaxe sensible aux FK names)
        # en faisant 2 selects + merge côté Python (plus robuste, fail-soft par tool).
        bindings_res = (
            client.table("swarm_tool_bindings")
            .select("*")
            .eq("swarm_id", swarm_id)
            .execute()
        )
        bindings = bindings_res.data if bindings_res else []

        tool_ids = list({b["tool_id"] for b in bindings if b.get("tool_id")})
        tools_map: dict[str, dict[str, Any]] = {}
        if tool_ids:
            try:
                tools_res = (
                    client.table("tools")
                    .select("*")
                    .in_("id", tool_ids)
                    .execute()
                )
                tools_map = {t["id"]: t for t in (tools_res.data or [])}
            except Exception as exc:  # noqa: BLE001
                logger.warning("get_swarm: failed to load tools %s: %s", tool_ids, exc)

        for b in bindings:
            b["tool"] = tools_map.get(b.get("tool_id"))

        return {
            "swarm": swarm,
            "agents": agents,
            "tasks": tasks,
            "tool_bindings": bindings,
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("get_swarm failed for %s: %s", swarm_id, exc)
        return None


def list_swarms(owner_id: str | None = None) -> list[dict[str, Any]]:
    """Liste les swarms actifs, filtrés optionnellement par propriétaire.

    Inclut `agents_count`, `last_run_at` et `last_run_status` (n+1 simple — OK
    tant que la liste reste modérée). À switcher en vraie agrégation Postgres
    via un RPC si la volumétrie explose.

    # TODO V2 perf : n+1 problem — 1 query swarms + 2 queries (agents_count,
    # last_run) PAR swarm. Seuil critique observé : ~200 swarms ⇒ latence
    # explose au-delà (>2s). Rework attendu en V2 : vue Postgres ou RPC
    # `list_swarms_with_stats(owner_id)` qui retourne tout en 1 round-trip
    # avec sous-requêtes LATERAL pour les agrégats. Voir migration future.
    """
    client = _get_client()
    if client is None:
        return []
    try:
        query = (
            client.table("swarms")
            .select(
                "id,owner_id,name,description,version,is_active,is_template,"
                "created_at,updated_at"
            )
            .eq("is_active", True)
            .order("created_at", desc=True)
        )
        if owner_id:
            query = query.eq("owner_id", owner_id)
        result = query.execute()
        swarms = result.data if result else []

        # Enrichit chaque swarm avec agents_count + last_run_*
        for s in swarms:
            sid = s.get("id")
            if not sid:
                continue
            # agents_count
            try:
                count_res = (
                    client.table("swarm_agents")
                    .select("id", count="exact")
                    .eq("swarm_id", sid)
                    .execute()
                )
                s["agents_count"] = count_res.count or 0
            except Exception as exc:  # noqa: BLE001
                logger.warning("agents_count failed for swarm %s: %s", sid, exc)
                s["agents_count"] = 0

            # last_run_*
            try:
                last_run_res = (
                    client.table("swarm_runs")
                    .select("started_at,status")
                    .eq("swarm_id", sid)
                    .order("started_at", desc=True)
                    .limit(1)
                    .execute()
                )
                last_runs = last_run_res.data or []
                if last_runs:
                    s["last_run_at"] = last_runs[0].get("started_at")
                    s["last_run_status"] = last_runs[0].get("status")
                else:
                    s["last_run_at"] = None
                    s["last_run_status"] = None
            except Exception as exc:  # noqa: BLE001
                logger.warning("last_run lookup failed for swarm %s: %s", sid, exc)
                s["last_run_at"] = None
                s["last_run_status"] = None

        return swarms
    except Exception as exc:  # noqa: BLE001
        logger.error("list_swarms failed: %s", exc)
        return []


def create_swarm(payload: dict[str, Any]) -> str | None:
    """Insère un nouveau swarm. Renvoie l'id (str) ou None en cas d'échec.

    Le payload accepte les colonnes natives de la table `swarms` :
    `owner_id`, `name`, `description`, `version`, `config_json`, `is_active`,
    `is_template`. `created_at` / `updated_at` sont posés ici si absents.
    """
    client = _get_client()
    if client is None:
        return None
    try:
        now = _now_iso()
        row: dict[str, Any] = {
            "name": payload.get("name") or "Untitled swarm",
            "description": payload.get("description", ""),
            "version": payload.get("version", 1),
            "config_json": payload.get("config_json", {}),
            "is_active": payload.get("is_active", True),
            "is_template": payload.get("is_template", False),
            "created_at": payload.get("created_at", now),
            "updated_at": payload.get("updated_at", now),
        }
        if payload.get("owner_id"):
            row["owner_id"] = payload["owner_id"]
        if payload.get("id"):
            row["id"] = payload["id"]

        result = client.table("swarms").insert(row).execute()
        if not result or not result.data:
            return None
        inserted = result.data[0]
        return inserted.get("id")
    except Exception as exc:  # noqa: BLE001
        logger.error("create_swarm failed: %s", exc)
        return None


def update_swarm(
    swarm_id: str,
    payload: dict[str, Any],
    owner_id: str | None = None,
) -> bool:
    """Patch un swarm. `updated_at` toujours rafraîchi.

    Si `owner_id` est fourni, la query UPDATE est filtrée sur owner_id —
    une tentative d'update cross-owner est silencieusement no-op côté DB.
    """
    client = _get_client()
    if client is None:
        return False
    try:
        row = {k: v for k, v in payload.items() if k not in {"id", "created_at"}}
        row["updated_at"] = _now_iso()
        query = client.table("swarms").update(row).eq("id", swarm_id)
        if owner_id:
            query = query.eq("owner_id", owner_id)
        query.execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_swarm failed for %s: %s", swarm_id, exc)
        return False


def delete_swarm(
    swarm_id: str,
    hard: bool = False,
    owner_id: str | None = None,
) -> bool:
    """Soft-delete par défaut (`is_active = false`).

    Si `hard=True`, supprime réellement la ligne (utile pour rollback partiel
    d'une création échouée). Les FK ON DELETE CASCADE de la migration 0003
    s'occupent des agents/tasks/bindings/runs liés.

    Si `owner_id` est fourni, scope la suppression sur ce propriétaire.
    """
    if not hard:
        return update_swarm(swarm_id, {"is_active": False}, owner_id=owner_id)

    client = _get_client()
    if client is None:
        return False
    try:
        query = client.table("swarms").delete().eq("id", swarm_id)
        if owner_id:
            query = query.eq("owner_id", owner_id)
        query.execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("delete_swarm(hard=True) failed for %s: %s", swarm_id, exc)
        return False


# ── Swarm agents CRUD ────────────────────────────────────────────────────────


def create_agent(
    swarm_id: str,
    payload: dict[str, Any],
    agent_id: str | None = None,
) -> str | None:
    """Insère un agent rattaché à un swarm. Renvoie l'id (UUID str) ou None.

    `agent_id` peut être imposé par l'appelant (utile pour préserver les UUIDs
    locaux émis côté front lors d'un POST swarm complet — facilite le mapping
    `agent_id` vers les tasks dans le même round-trip).
    """
    client = _get_client()
    if client is None:
        return None
    try:
        row: dict[str, Any] = _filter_payload(payload, _AGENT_COLUMNS)
        row["swarm_id"] = swarm_id
        if agent_id:
            row["id"] = agent_id

        result = client.table("swarm_agents").insert(row).execute()
        if not result or not result.data:
            return None
        return result.data[0].get("id")
    except Exception as exc:  # noqa: BLE001
        logger.error("create_agent failed for swarm %s: %s", swarm_id, exc)
        return None


def update_agent(agent_id: str, payload: dict[str, Any]) -> bool:
    """Patch un agent existant."""
    client = _get_client()
    if client is None:
        return False
    try:
        row = _filter_payload(payload, _AGENT_COLUMNS)
        if not row:
            return True
        row["updated_at"] = _now_iso()
        client.table("swarm_agents").update(row).eq("id", agent_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_agent failed for %s: %s", agent_id, exc)
        return False


def delete_agent(agent_id: str) -> bool:
    """Hard delete d'un agent. Cascade DB sur tasks/bindings liés."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.table("swarm_agents").delete().eq("id", agent_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("delete_agent failed for %s: %s", agent_id, exc)
        return False


# ── Swarm tasks CRUD ─────────────────────────────────────────────────────────


def create_task(
    swarm_id: str,
    payload: dict[str, Any],
    task_id: str | None = None,
) -> str | None:
    """Insère une task rattachée à un swarm. Renvoie l'id (UUID str) ou None."""
    client = _get_client()
    if client is None:
        return None
    try:
        row: dict[str, Any] = _filter_payload(payload, _TASK_COLUMNS)
        row["swarm_id"] = swarm_id
        if task_id:
            row["id"] = task_id

        result = client.table("swarm_tasks").insert(row).execute()
        if not result or not result.data:
            return None
        return result.data[0].get("id")
    except Exception as exc:  # noqa: BLE001
        logger.error("create_task failed for swarm %s: %s", swarm_id, exc)
        return None


def update_task(task_id: str, payload: dict[str, Any]) -> bool:
    """Patch une task existante."""
    client = _get_client()
    if client is None:
        return False
    try:
        row = _filter_payload(payload, _TASK_COLUMNS)
        if not row:
            return True
        row["updated_at"] = _now_iso()
        client.table("swarm_tasks").update(row).eq("id", task_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_task failed for %s: %s", task_id, exc)
        return False


def delete_task(task_id: str) -> bool:
    """Hard delete d'une task."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.table("swarm_tasks").delete().eq("id", task_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("delete_task failed for %s: %s", task_id, exc)
        return False


# ── Tool bindings CRUD ───────────────────────────────────────────────────────


def create_tool_binding(
    swarm_id: str,
    agent_id: str,
    tool_id: str,
    priority: int = 0,
    config_json: dict[str, Any] | None = None,
    binding_id: str | None = None,
) -> str | None:
    """Crée un binding tool↔agent dans un swarm. Renvoie l'id (UUID str) ou None."""
    client = _get_client()
    if client is None:
        return None
    try:
        row: dict[str, Any] = {
            "swarm_id": swarm_id,
            "agent_id": agent_id,
            "tool_id": tool_id,
            "priority": priority,
            "config_json": config_json or {},
        }
        if binding_id:
            row["id"] = binding_id
        result = client.table("swarm_tool_bindings").insert(row).execute()
        if not result or not result.data:
            return None
        return result.data[0].get("id")
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "create_tool_binding failed (swarm=%s, agent=%s, tool=%s): %s",
            swarm_id, agent_id, tool_id, exc,
        )
        return None


def update_tool_binding(binding_id: str, payload: dict[str, Any]) -> bool:
    """Patch un tool_binding existant (priority / config_json / agent_id / tool_id)."""
    client = _get_client()
    if client is None:
        return False
    try:
        row = _filter_payload(payload, _BINDING_COLUMNS)
        if not row:
            return True
        client.table("swarm_tool_bindings").update(row).eq("id", binding_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_tool_binding failed for %s: %s", binding_id, exc)
        return False


def delete_tool_binding(binding_id: str) -> bool:
    """Hard delete d'un binding."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.table("swarm_tool_bindings").delete().eq("id", binding_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("delete_tool_binding failed for %s: %s", binding_id, exc)
        return False


# ── Replace bulk helpers (delete-all-then-insert pour les saves complets) ────
#
# F6 fix : snapshot-rollback applicatif.
#
# supabase-py n'expose pas de transaction PostgreSQL native simple (pas de
# `BEGIN/COMMIT` via REST). Workaround : avant tout `delete + insert`, on
# snapshot l'état courant. Si un insert échoue en cours de boucle, on
# restore depuis le snapshot (delete + re-insert des rows originales). Best-
# effort — si la restauration elle-même échoue, on log un warning explicit.


def _snapshot_rows(table: str, swarm_id: str) -> list[dict[str, Any]] | None:
    """Snapshot toutes les rows d'une table filtrées par swarm_id.

    Renvoie une liste (potentiellement vide) ou None si Supabase indispo / erreur.
    Les rows sont retournées telles quelles (avec leur id) pour permettre une
    ré-insertion fidèle en cas de rollback.

    # TODO V2 : add pagination LIMIT 5000 + warning if exceeded (un swarm avec
    # plus de 5000 rows par sous-table reste un cas dégénéré, mais la limite
    # PostgREST par défaut est ~1000 — il faudra paginer explicitement).
    """
    client = _get_client()
    if client is None:
        return None
    try:
        res = client.table(table).select("*").eq("swarm_id", swarm_id).execute()
        return res.data if res else []
    except Exception as exc:  # noqa: BLE001
        logger.error("_snapshot_rows: snapshot failed for %s/%s: %s", table, swarm_id, exc)
        return None


def _snapshot_swarm_tree(swarm_id: str) -> dict[str, list[dict[str, Any]]] | None:
    """G1 fix : snapshot multi-tables (agents + tasks + bindings) atomique.

    Avant `replace_agents`, on doit capturer l'ensemble du sous-arbre lié au
    swarm — sinon la CASCADE (ou désormais le SET NULL après la migration 0009)
    laisse partir des rows que F6 ne peut pas restaurer.

    Renvoie `{"agents": [...], "tasks": [...], "bindings": [...]}` ou None si
    une seule des 3 lectures échoue (sécurité : on préfère interrompre plutôt
    que de risquer un rollback partiel).

    # TODO V2 : add pagination LIMIT 5000 + warning if exceeded.
    """
    agents = _snapshot_rows("swarm_agents", swarm_id)
    tasks = _snapshot_rows("swarm_tasks", swarm_id)
    bindings = _snapshot_rows("swarm_tool_bindings", swarm_id)
    if agents is None or tasks is None or bindings is None:
        return None
    return {"agents": agents, "tasks": tasks, "bindings": bindings}


def _restore_swarm_tree(
    swarm_id: str,
    snapshot: dict[str, list[dict[str, Any]]],
) -> bool:
    """G1 fix : restore multi-tables après un échec de replace_agents.

    Stratégie : delete les 3 tables en cascade-friendly order (bindings →
    tasks → agents) puis re-insert depuis le snapshot (agents → tasks →
    bindings) pour respecter les FK. Best-effort : si la restauration
    elle-même échoue, on log un warning explicit (état DB potentiellement
    incohérent).

    # TODO V2 [H9] : ajouter un retry exponential backoff (3 tentatives) +
    # dead-letter queue (table `swarm_restore_failures` ou notification
    # Slack/PagerDuty). Aujourd'hui un échec de restore laisse la DB
    # potentiellement corrompue, et le seul signal est un warning dans les
    # logs Railway — facile à manquer en prod.
    """
    client = _get_client()
    if client is None:
        return False
    try:
        # Order matters : on delete d'abord les "feuilles" (bindings/tasks)
        # puis les "racines" (agents) pour ne pas déclencher de SET NULL
        # parasite intermédiaire.
        client.table("swarm_tool_bindings").delete().eq("swarm_id", swarm_id).execute()
        client.table("swarm_tasks").delete().eq("swarm_id", swarm_id).execute()
        client.table("swarm_agents").delete().eq("swarm_id", swarm_id).execute()

        # Re-insert : racines (agents) d'abord, puis tasks (FK agent_id), puis
        # bindings (FK agent_id + tool_id).
        if snapshot["agents"]:
            client.table("swarm_agents").insert(snapshot["agents"]).execute()
        if snapshot["tasks"]:
            client.table("swarm_tasks").insert(snapshot["tasks"]).execute()
        if snapshot["bindings"]:
            client.table("swarm_tool_bindings").insert(snapshot["bindings"]).execute()

        logger.warning(
            "_restore_swarm_tree: restored %d agents / %d tasks / %d bindings for swarm %s",
            len(snapshot["agents"]), len(snapshot["tasks"]),
            len(snapshot["bindings"]), swarm_id,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "_restore_swarm_tree: FAILED to restore swarm %s — DB may be inconsistent: %s",
            swarm_id, exc,
        )
        return False


def _restore_snapshot(table: str, swarm_id: str, snapshot: list[dict[str, Any]]) -> bool:
    """Re-insert les rows snapshot après un échec de replace_*.

    Stratégie : delete tout (au cas où il reste des résidus) puis bulk insert
    du snapshot. Logue un warning si la restauration échoue (état DB
    potentiellement corrompu — alerter l'opérateur).
    """
    client = _get_client()
    if client is None:
        return False
    try:
        client.table(table).delete().eq("swarm_id", swarm_id).execute()
        if snapshot:
            client.table(table).insert(snapshot).execute()
        logger.warning(
            "_restore_snapshot: restored %d rows in %s for swarm %s",
            len(snapshot), table, swarm_id,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "_restore_snapshot: FAILED to restore %s/%s — DB may be inconsistent: %s",
            table, swarm_id, exc,
        )
        return False


def replace_agents(swarm_id: str, agents: list[dict[str, Any]]) -> dict[str, str] | None:
    """Remplace intégralement les agents d'un swarm.

    Retourne un mapping `{client_id → db_uuid}` pour permettre à l'appelant
    (PATCH du builder) de résoudre les références `agent_id` dans les tasks
    et tool_bindings du même payload.

    H2 fix : retourne `None` (et non `{}`) en cas d'échec, pour permettre au
    routeur de distinguer "payload vide légitime" de "snapshot/delete/insert
    failed après rollback". `{}` reste valide (cas : aucun agent à insérer
    OU aucun client_id à mapper).

    G1 fix : snapshot-rollback multi-tables (agents + tasks + bindings).
    Avant la migration 0009, le DELETE des agents déclenchait une CASCADE qui
    effaçait silencieusement toutes les tasks et tool_bindings du swarm —
    catastrophique pour un PATCH `{"agents": [...]}` sans clé `tasks`.

    Depuis la migration 0009 :
      - swarm_tasks.agent_id          ON DELETE SET NULL + nullable
      - swarm_tool_bindings.agent_id  ON DELETE SET NULL + nullable

    Donc en cas d'agent supprimé puis recréé avec un nouveau id, la task qui
    pointait dessus se retrouve avec `agent_id=NULL` (orpheline, mais
    préservée). H4 fix : on re-link les tasks/bindings vers les agents
    conservés (mapping via snapshot, `old_id == new_id` quand un même UUID
    revient dans le payload).

    Si replace_agents échoue partiellement, on restore TOUT (agents + tasks +
    bindings) depuis le snapshot via `_restore_swarm_tree`.
    """
    client = _get_client()
    if client is None:
        return None

    # G1 fix : snapshot multi-tables AVANT delete (le DELETE peut déclencher
    # un SET NULL en cascade sur tasks/bindings, et on veut pouvoir tout
    # restaurer en bloc).
    snapshot = _snapshot_swarm_tree(swarm_id)
    if snapshot is None:
        return None

    id_map: dict[str, str] = {}
    try:
        # Delete all : le SET NULL cascade vers tasks/bindings (post-0009),
        # ce qui préserve les rows orphelines (pas de cascade destructive).
        client.table("swarm_agents").delete().eq("swarm_id", swarm_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.error("replace_agents: delete failed for swarm %s: %s", swarm_id, exc)
        # Restore en bloc si delete a foiré (état mixte possible).
        _restore_swarm_tree(swarm_id, snapshot)
        return None

    failure = False
    for agent in agents:
        local_id = agent.get("id")
        payload = {k: v for k, v in agent.items() if k != "id"}
        db_id = create_agent(swarm_id=swarm_id, payload=payload, agent_id=local_id)
        if db_id is None:
            logger.warning(
                "replace_agents: create_agent failed (swarm=%s, name=%s) — rolling back tree",
                swarm_id, agent.get("name"),
            )
            failure = True
            break
        if local_id:
            id_map[str(local_id)] = db_id
        id_map[db_id] = db_id

    if failure:
        # Restore complet du sous-arbre — agents échoués, tasks/bindings
        # SET NULL côté DB sont aussi réparés depuis le snapshot.
        _restore_swarm_tree(swarm_id, snapshot)
        return None

    # H4 fix : re-link les tasks/bindings préservées vers les agents
    # conservés (cas où le client a renvoyé le même UUID dans le payload).
    # Sans ce re-link, la cascade SET NULL aurait laissé les tasks orphelines
    # même quand l'agent est ré-inséré avec son ancien UUID.
    try:
        _relink_orphans_after_replace_agents(
            swarm_id=swarm_id,
            snapshot=snapshot,
            id_map=id_map,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "replace_agents: relink orphans failed for swarm %s: %s (orphans persist)",
            swarm_id, exc,
        )

    return id_map


def _relink_orphans_after_replace_agents(
    swarm_id: str,
    snapshot: dict[str, list[dict[str, Any]]],
    id_map: dict[str, str],
) -> None:
    """H4 fix : re-link tasks/bindings orphelines vers les agents conservés.

    Pour chaque row du snapshot pointant vers un agent dont l'UUID est encore
    présent dans le payload (id_map contient old_id), on UPDATE la row en DB
    pour reconnecter `agent_id`. Sans ça, la cascade SET NULL aurait laissé
    la row avec `agent_id=NULL` même quand l'agent est conservé.

    Mapping : id_map contient `{client_id → new_db_uuid}` ET `{new_db_uuid →
    new_db_uuid}` (cf. boucle de replace_agents). Donc si `old_agent_id` du
    snapshot est dans id_map, on peut reconnecter.
    """
    client = _get_client()
    if client is None:
        return

    # Tasks orphelines à reconnecter.
    for task in snapshot.get("tasks", []):
        old_agent_id = task.get("agent_id")
        task_id = task.get("id")
        if not old_agent_id or not task_id:
            continue
        new_agent_id = id_map.get(str(old_agent_id))
        if not new_agent_id:
            continue  # agent supprimé, task reste orpheline (agent_id=NULL)
        try:
            client.table("swarm_tasks").update(
                {"agent_id": new_agent_id}
            ).eq("id", task_id).eq("swarm_id", swarm_id).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "relink task %s → agent %s failed: %s",
                task_id, new_agent_id, exc,
            )

    # Tool bindings orphelins à reconnecter.
    for binding in snapshot.get("bindings", []):
        old_agent_id = binding.get("agent_id")
        binding_id = binding.get("id")
        if not old_agent_id or not binding_id:
            continue
        new_agent_id = id_map.get(str(old_agent_id))
        if not new_agent_id:
            continue
        try:
            client.table("swarm_tool_bindings").update(
                {"agent_id": new_agent_id}
            ).eq("id", binding_id).eq("swarm_id", swarm_id).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "relink binding %s → agent %s failed: %s",
                binding_id, new_agent_id, exc,
            )


def replace_tasks(
    swarm_id: str,
    tasks: list[dict[str, Any]],
    agent_id_map: dict[str, str] | None = None,
) -> dict[str, str] | None:
    """Remplace intégralement les tasks d'un swarm.

    Si `agent_id_map` est fourni, résout les `agent_id` clients vers les UUIDs
    DB (mapping construit par `replace_agents`).

    H2 fix : retourne `None` en cas d'échec (snapshot/delete/insert KO après
    rollback). Sinon retourne le mapping `{client_id → db_uuid}` (peut être
    `{}` si payload vide ou aucun id client).

    F6 fix : snapshot-rollback applicatif.
    """
    client = _get_client()
    if client is None:
        return None

    snapshot = _snapshot_rows("swarm_tasks", swarm_id)
    if snapshot is None:
        return None

    agent_id_map = agent_id_map or {}
    id_map: dict[str, str] = {}
    try:
        client.table("swarm_tasks").delete().eq("swarm_id", swarm_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.error("replace_tasks: delete failed for swarm %s: %s", swarm_id, exc)
        # Restore snapshot — sans cela les tasks DELETE seraient perdues.
        _restore_snapshot("swarm_tasks", swarm_id, snapshot)
        return None

    failure = False
    for task in tasks:
        local_id = task.get("id")
        payload = {k: v for k, v in task.items() if k != "id"}
        # Résout agent_id local → DB UUID si nécessaire.
        agent_ref = payload.get("agent_id")
        if agent_ref and agent_ref in agent_id_map:
            payload["agent_id"] = agent_id_map[agent_ref]
        # Résout depends_on_task_id local → DB UUID.
        dep = payload.get("depends_on_task_id")
        if dep and dep in id_map:
            payload["depends_on_task_id"] = id_map[dep]

        db_id = create_task(swarm_id=swarm_id, payload=payload, task_id=local_id)
        if db_id is None:
            logger.warning(
                "replace_tasks: create_task failed (swarm=%s, name=%s) — rolling back",
                swarm_id, task.get("name"),
            )
            failure = True
            break
        if local_id:
            id_map[str(local_id)] = db_id
        id_map[db_id] = db_id

    if failure:
        _restore_snapshot("swarm_tasks", swarm_id, snapshot)
        return None
    return id_map


def replace_tool_bindings(
    swarm_id: str,
    bindings: list[dict[str, Any]],
    agent_id_map: dict[str, str] | None = None,
) -> bool:
    """Remplace intégralement les tool_bindings d'un swarm.

    Résout les `agent_id` clients vers DB via `agent_id_map`.

    H2 fix : retourne `False` UNIQUEMENT en cas d'échec hard (Supabase
    indispo, snapshot KO, delete KO, ou rollback déclenché par une insertion
    KO). Le cas "binding skippé car payload incomplet" (sans agent/tool) n'est
    PAS considéré comme un échec — on log un warning et on retourne `True`
    (les bindings valides ont bien été insérés).

    F6 fix : snapshot-rollback applicatif sur échec d'insertion.
    """
    client = _get_client()
    if client is None:
        return False

    snapshot = _snapshot_rows("swarm_tool_bindings", swarm_id)
    if snapshot is None:
        return False

    agent_id_map = agent_id_map or {}
    try:
        client.table("swarm_tool_bindings").delete().eq("swarm_id", swarm_id).execute()
    except Exception as exc:  # noqa: BLE001
        logger.error("replace_tool_bindings: delete failed for swarm %s: %s", swarm_id, exc)
        # Restore snapshot — sinon les bindings DELETE sont perdus sans warning.
        _restore_snapshot("swarm_tool_bindings", swarm_id, snapshot)
        return False

    failure = False
    for binding in bindings:
        agent_ref = binding.get("agent_id")
        if agent_ref and agent_ref in agent_id_map:
            agent_ref = agent_id_map[agent_ref]
        if not agent_ref or not binding.get("tool_id"):
            logger.warning(
                "replace_tool_bindings: skipping binding without agent_id/tool_id "
                "(swarm=%s, binding=%s)", swarm_id, binding,
            )
            # H2 : skip de binding mal formé n'est pas un échec — on continue.
            continue
        bid = create_tool_binding(
            swarm_id=swarm_id,
            agent_id=agent_ref,
            tool_id=binding["tool_id"],
            priority=binding.get("priority", 0),
            config_json=binding.get("config_json") or {},
            binding_id=binding.get("id"),
        )
        if bid is None:
            logger.warning(
                "replace_tool_bindings: create failed (swarm=%s) — rolling back",
                swarm_id,
            )
            failure = True
            break

    if failure:
        _restore_snapshot("swarm_tool_bindings", swarm_id, snapshot)
        return False
    return True


# ── Tools catalog (lecture) ──────────────────────────────────────────────────


def list_tools(owner_id: str | None = None) -> list[dict[str, Any]]:
    """Liste les tools actifs, filtrés optionnellement par propriétaire."""
    client = _get_client()
    if client is None:
        return []
    try:
        query = (
            client.table("tools")
            .select("*")
            .eq("is_active", True)
            .order("name", desc=False)
        )
        if owner_id:
            query = query.eq("owner_id", owner_id)
        result = query.execute()
        return result.data if result else []
    except Exception as exc:  # noqa: BLE001
        logger.error("list_tools failed: %s", exc)
        return []


# ── Swarm runs ───────────────────────────────────────────────────────────────


def save_swarm_run(
    run_id: str,
    swarm_id: str,
    trigger: str,
    status: str = "running",
    inputs_json: dict[str, Any] | None = None,
) -> bool:
    """Insère un nouveau run de swarm."""
    client = _get_client()
    if client is None:
        return False
    try:
        now = _now_iso()
        row: dict[str, Any] = {
            "id": run_id,
            "swarm_id": swarm_id,
            "trigger": trigger,
            "status": status,
            "inputs_json": inputs_json or {},
            "started_at": now,
            "created_at": now,
        }
        client.table("swarm_runs").insert(row).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("save_swarm_run failed for %s: %s", run_id, exc)
        return False


def update_swarm_run(run_id: str, **fields: Any) -> bool:
    """Patch un run. `finished_at` posé automatiquement si status terminal et absent."""
    client = _get_client()
    if client is None:
        return False
    try:
        # status terminaux → on pose finished_at si manquant
        terminal_statuses = {"completed", "failed", "cancelled", "timeout"}
        if (
            fields.get("status") in terminal_statuses
            and "finished_at" not in fields
        ):
            fields["finished_at"] = _now_iso()

        # On ne pousse aucun champ vide / None pour éviter d'écraser des colonnes
        payload = {k: v for k, v in fields.items() if v is not None}
        if not payload:
            return True
        client.table("swarm_runs").update(payload).eq("id", run_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("update_swarm_run failed for %s: %s", run_id, exc)
        return False


def get_swarm_run(
    run_id: str,
    owner_id: str | None = None,
) -> dict[str, Any] | None:
    """Récupère un run par son id.

    Si `owner_id` est fourni, vérifie que le run appartient à un swarm dont
    l'owner correspond — sinon None (404 côté route). Le filter est appliqué
    après lecture (PostgREST n'expose pas de JOIN propre via supabase-py).
    """
    client = _get_client()
    if client is None:
        return None
    try:
        result = (
            client.table("swarm_runs")
            .select("*")
            .eq("id", run_id)
            .maybe_single()
            .execute()
        )
        run = result.data if result else None
        if run is None:
            return None

        if owner_id:
            swarm_id = run.get("swarm_id")
            if not swarm_id:
                return None
            owner_check = (
                client.table("swarms")
                .select("id")
                .eq("id", swarm_id)
                .eq("owner_id", owner_id)
                .maybe_single()
                .execute()
            )
            if not (owner_check and owner_check.data):
                return None
        return run
    except Exception as exc:  # noqa: BLE001
        logger.error("get_swarm_run failed for %s: %s", run_id, exc)
        return None


def list_swarm_runs(
    swarm_id: str,
    limit: int = 20,
    owner_id: str | None = None,
) -> list[dict[str, Any]]:
    """Liste les runs d'un swarm, plus récents en premier.

    Si `owner_id` est fourni, valide d'abord que le swarm appartient à l'owner ;
    sinon retourne `[]` (équivalent à un 404 côté route).

    Les valeurs `total_cost_usd` sont castées en float — supabase-py peut les
    livrer en Decimal/str selon la version client.
    """
    client = _get_client()
    if client is None:
        return []
    try:
        if owner_id:
            owner_check = (
                client.table("swarms")
                .select("id")
                .eq("id", swarm_id)
                .eq("owner_id", owner_id)
                .maybe_single()
                .execute()
            )
            if not (owner_check and owner_check.data):
                return []

        result = (
            client.table("swarm_runs")
            .select(
                "id,swarm_id,trigger,status,started_at,finished_at,"
                "total_tokens_in,total_tokens_out,total_cost_usd,langfuse_trace_id"
            )
            .eq("swarm_id", swarm_id)
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = result.data if result else []
        for row in rows:
            try:
                row["total_cost_usd"] = float(row.get("total_cost_usd") or 0)
            except (TypeError, ValueError):
                row["total_cost_usd"] = 0.0
        return rows
    except Exception as exc:  # noqa: BLE001
        logger.error("list_swarm_runs failed for %s: %s", swarm_id, exc)
        return []


def list_run_steps(run_id: str) -> list[dict[str, Any]]:
    """Liste tous les steps d'un run, ordonnés par step_number.

    Enrichit chaque step avec `agent_name` et `task_name` via un load des
    `swarm_agents` / `swarm_tasks` du swarm parent (3 selects total, OK tant
    que le nombre de steps reste modéré). `cost_usd` est casté en float pour
    aligner la shape côté Zod (SwarmRunStepSchema).
    """
    client = _get_client()
    if client is None:
        return []
    try:
        result = (
            client.table("swarm_run_steps")
            .select("*")
            .eq("run_id", run_id)
            .order("step_number", desc=False)
            .execute()
        )
        steps = result.data if result else []
        if not steps:
            return []

        # Récupère le swarm_id parent via swarm_runs → indispensable pour
        # filtrer les agents/tasks de manière scopée.
        agent_name_map: dict[str, str] = {}
        task_name_map: dict[str, str] = {}
        try:
            run_res = (
                client.table("swarm_runs")
                .select("swarm_id")
                .eq("id", run_id)
                .maybe_single()
                .execute()
            )
            run_row = run_res.data if run_res else None
            swarm_id = run_row.get("swarm_id") if run_row else None
            if swarm_id:
                try:
                    agents_res = (
                        client.table("swarm_agents")
                        .select("id,name")
                        .eq("swarm_id", swarm_id)
                        .execute()
                    )
                    agent_name_map = {
                        a["id"]: a.get("name", "") for a in (agents_res.data or [])
                    }
                except Exception as exc:  # noqa: BLE001
                    logger.warning("list_run_steps: agents fetch failed for run=%s: %s", run_id, exc)
                try:
                    tasks_res = (
                        client.table("swarm_tasks")
                        .select("id,name")
                        .eq("swarm_id", swarm_id)
                        .execute()
                    )
                    task_name_map = {
                        t["id"]: t.get("name", "") for t in (tasks_res.data or [])
                    }
                except Exception as exc:  # noqa: BLE001
                    logger.warning("list_run_steps: tasks fetch failed for run=%s: %s", run_id, exc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("list_run_steps: parent swarm lookup failed for run=%s: %s", run_id, exc)

        for step in steps:
            aid = step.get("agent_id")
            tid = step.get("task_id")
            step["agent_name"] = agent_name_map.get(aid) if aid else None
            step["task_name"] = task_name_map.get(tid) if tid else None
            try:
                step["cost_usd"] = float(step.get("cost_usd") or 0)
            except (TypeError, ValueError):
                step["cost_usd"] = 0.0
        return steps
    except Exception as exc:  # noqa: BLE001
        logger.error("list_run_steps failed for %s: %s", run_id, exc)
        return []


def update_run_step(step_id: str, **fields: Any) -> bool:
    """H5 fix : met à jour un step existant (e.g. `finished_at`,
    `output_text`, `status`, `latency_ms`).

    Best-effort : retourne True sur succès, False sinon (log warning).
    Utile pour poser `finished_at` quand on a un signal de fin de step
    (ex: step suivant qui arrive, ou task_callback en fin de task).

    # TODO V2 : appelée depuis _build_step_callback quand on aura le
    # hook task end de CrewAI. Pour l'instant la fonction est conservée
    # en attente du wiring V2 — pas de call-site actif dans le code.
    """
    client = _get_client()
    if client is None:
        return False
    try:
        payload = {k: v for k, v in fields.items() if v is not None}
        if not payload:
            return True
        client.table("swarm_run_steps").update(payload).eq("id", step_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("update_run_step failed for step %s: %s", step_id, exc)
        return False


def cleanup_stale_runs(max_age_minutes: int) -> int:
    """Mark 'running' swarm_runs older than max_age_minutes as failed.

    Targets rows in `swarm_runs` with status='running' AND
    started_at < now(utc) - max_age_minutes. Updates status to 'failed',
    sets error_text and finished_at. Fail-soft: returns 0 on any error.

    Returns the number of rows updated.
    """
    client = _get_client()
    if client is None:
        return 0
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)).isoformat()
        result = (
            client.table("swarm_runs")
            .update(
                {
                    "status": "failed",
                    "error_text": "Run abandoned — no heartbeat (stale cleanup)",
                    "finished_at": _now_iso(),
                }
            )
            .eq("status", "running")
            .lt("started_at", cutoff)
            .execute()
        )
        count = len(result.data) if result and result.data else 0
        return count
    except Exception as exc:  # noqa: BLE001
        logger.warning("cleanup_stale_runs (swarm_runs) failed: %s", exc)
        return 0


def append_run_step(
    run_id: str,
    agent_id: str | None,
    task_id: str | None,
    step_number: int,
    **fields: Any,
) -> bool:
    """Insère un step (output d'agent/task) lié à un run."""
    client = _get_client()
    if client is None:
        return False
    try:
        row: dict[str, Any] = {
            "run_id": run_id,
            "agent_id": agent_id,
            "task_id": task_id,
            "step_number": step_number,
            "created_at": _now_iso(),
        }
        # Colonnes optionnelles autorisées dans la table.
        for key in (
            "input_text",
            "output_text",
            "tokens_in",
            "tokens_out",
            "cost_usd",
            "latency_ms",
            "status",
        ):
            if key in fields and fields[key] is not None:
                row[key] = fields[key]

        client.table("swarm_run_steps").insert(row).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("append_run_step failed for run=%s step=%s: %s", run_id, step_number, exc)
        return False
