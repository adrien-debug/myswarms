"""Routes FastAPI — gestion CRUD + exécution des swarms dynamiques.

# TODO V2 [H7] : ce fichier dépasse 600 lignes. Cohésion forte par groupe de
# routes (toutes les routes /v1/swarms* + /v1/runs* + /v1/tools). Splitter
# en sous-routeurs ne ferait que multiplier les imports croisés. Plan V2 :
# extraire un `swarm_runs.py` séparé (endpoints /v1/runs/* + kickoff +
# status) et un `swarms_crud.py` (CRUD pur). Critère de déclenchement :
# au-delà de 800L OU si on ajoute un 5e groupe de routes (e.g. webhooks).

Endpoints :
- GET    /v1/swarms                          → list_swarms (filter owner_id ?)
- GET    /v1/swarms/{swarm_id}               → get_swarm (joint agents/tasks/tools)
- POST   /v1/swarms                          → create_swarm (avec agents/tasks/bindings)
- PATCH  /v1/swarms/{swarm_id}               → update_swarm
- DELETE /v1/swarms/{swarm_id}               → soft delete (is_active=false)
- POST   /v1/swarms/{swarm_id}/kickoff       → lance DynamicSwarmFlow en background
- GET    /v1/swarms/{swarm_id}/status/{run_id} → get_swarm_run scoped
- GET    /v1/swarms/{swarm_id}/runs?limit=20 → list_swarm_runs
- GET    /v1/runs/{run_id}                   → get_swarm_run cross-swarm
- GET    /v1/tools                           → list_tools (catalog)

Auth : bearer token global vérifié par le middleware FastAPI (main.py:verify_bearer).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..config import settings
from ..flows.dynamic_swarm_flow import DynamicSwarmFlow
from ..persistence import swarm_store

logger = logging.getLogger(__name__)

router = APIRouter()

# Strong references for background tasks — empêche un GC silencieux.
_running_tasks: set[asyncio.Task] = set()


# ── Pydantic models ──────────────────────────────────────────────────────────


class AgentCreate(BaseModel):
    """Sous-modèle agent envoyé lors d'un POST swarm complet.

    `id` est optionnel : si fourni (UUID émis côté front), il est conservé en DB
    pour permettre aux tasks du même POST de référencer cet agent par son ID
    local sans round-trip intermédiaire.
    """

    id: str | None = None
    name: str = Field(..., min_length=1, max_length=200)
    role: str = Field(..., description="Enum agent_role (coordinator/analyst/...)")
    system_prompt: str = ""
    model_provider: str | None = None
    model_name: str | None = None
    # G4 fix : bornes strictes pour aligner sur swarmSchemas.ts (Zod min/max).
    # Sans ces bornes, un payload temperature=5.0 ou max_tokens=10_000_000
    # passait silencieusement côté API et faisait crasher LiteLLM plus loin.
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=200_000)
    parent_agent_id: str | None = None
    position_x: int = 0
    position_y: int = 0


class TaskCreate(BaseModel):
    """Sous-modèle task envoyé lors d'un POST swarm complet."""

    id: str | None = None
    agent_id: str = Field(..., description="UUID agent (local ou DB) auquel rattacher la task")
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    expected_output: str = ""
    depends_on_task_id: str | None = None
    position_x: int = 0
    position_y: int = 0


class ToolBindingCreate(BaseModel):
    """Sous-modèle tool_binding envoyé lors d'un POST swarm complet."""

    id: str | None = None
    agent_id: str = Field(..., description="UUID agent (local ou DB)")
    tool_id: str
    priority: int = 0
    config_json: dict[str, Any] = Field(default_factory=dict)


class SwarmCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    owner_id: str | None = None
    version: int | None = None
    config_json: dict[str, Any] = Field(default_factory=dict)
    is_active: bool | None = None
    is_template: bool | None = None
    # Création hydratée : agents → tasks → bindings dans le même POST.
    agents: list[AgentCreate] | None = None
    tasks: list[TaskCreate] | None = None
    tool_bindings: list[ToolBindingCreate] | None = None


class SwarmUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    version: int | None = None
    config_json: dict[str, Any] | None = None
    is_active: bool | None = None
    is_template: bool | None = None
    # Save complet depuis le builder : si présents, on remplace intégralement.
    agents: list[AgentCreate] | None = None
    tasks: list[TaskCreate] | None = None
    tool_bindings: list[ToolBindingCreate] | None = None


class KickoffRequest(BaseModel):
    trigger: Literal["morning", "evening", "intraday", "on_demand", "webhook"] = "on_demand"
    inputs: dict[str, Any] = Field(default_factory=dict)


class ArchitectGenerateRequest(BaseModel):
    """Demande de génération de spec de swarm (Architect Agent).

    `prompt` est borné (min/max) — un prompt vide n'a aucun sens et un
    prompt géant gaspille le contexte Opus. `owner_id` optionnel : priorité
    body > query (cohérent avec `create_swarm_endpoint`).
    """

    prompt: str = Field(..., min_length=10, max_length=4000)
    owner_id: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _adaptive_flow_timeout(n_tasks: int) -> int:
    """Return the effective timeout (seconds) for a dynamic swarm flow.

    Uses the larger of the global floor (FLOW_TIMEOUT_SECONDS) and a per-task
    budget (n_tasks × PER_TASK_TIMEOUT_SECONDS). When n_tasks=0 (unknown),
    falls back to FLOW_TIMEOUT_SECONDS.
    """
    return max(settings.FLOW_TIMEOUT_SECONDS, n_tasks * settings.PER_TASK_TIMEOUT_SECONDS)


def _shape_swarm_response(loaded: dict[str, Any]) -> dict[str, Any]:
    """Aplatit le payload swarm_store.get_swarm() → réponse SwarmRecord côté front.

    Aligné avec `SwarmRecordSchema` Zod (src/lib/forms/swarmSchemas.ts).
    """
    swarm = loaded.get("swarm") or {}
    return {
        "id": str(swarm.get("id", "")),
        "owner_id": swarm.get("owner_id"),
        "name": swarm.get("name", ""),
        "description": swarm.get("description", ""),
        "version": swarm.get("version", 1),
        "config_json": swarm.get("config_json") or {},
        "is_active": bool(swarm.get("is_active", True)),
        "is_template": bool(swarm.get("is_template", False)),
        "created_at": swarm.get("created_at"),
        "updated_at": swarm.get("updated_at"),
        "agents": loaded.get("agents", []) or [],
        "tasks": loaded.get("tasks", []) or [],
        "tool_bindings": loaded.get("tool_bindings", []) or [],
    }


# Enum DB crew_run_status (cf migration 0002 + types.ts généré).
# Tout statut inconnu est rabattu sur "pending" — c'est la seule valeur
# de l'enum Zod (RunStatusSchema) qui n'est pas implicitement terminale ni active.
_VALID_RUN_STATUSES: set[str] = {
    "pending",
    "running",
    "paused_hitl",
    "completed",
    "failed",
    "cancelled",
}


def _shape_run_response(run_row: dict[str, Any]) -> dict[str, Any]:
    """Mappe une row DB swarm_runs vers la shape SwarmRun côté front.

    Important : la clé d'identifiant est `id` (pas `run_id`). Le seul endroit
    où on renvoie `run_id` est la réponse `POST /v1/swarms/{id}/kickoff`
    (cf `SwarmKickoffResponseSchema` qui attend `{run_id}`).

    Si le statut DB est manquant ou hors enum, on rabat sur "pending" pour
    rester strictement aligné avec `RunStatusSchema` côté Zod.
    """
    run_id = str(run_row.get("id", ""))
    steps = swarm_store.list_run_steps(run_id) if run_id else []
    raw_status = run_row.get("status")
    status = str(raw_status) if raw_status in _VALID_RUN_STATUSES else "pending"
    return {
        "id": run_id,
        "swarm_id": str(run_row.get("swarm_id", "")),
        "trigger": str(run_row.get("trigger", "on_demand")),
        "status": status,
        "inputs_json": run_row.get("inputs_json") or {},
        "result_text": run_row.get("result_text"),
        "started_at": run_row.get("started_at"),
        "finished_at": run_row.get("finished_at"),
        "error_text": run_row.get("error_text"),
        "total_tokens_in": run_row.get("total_tokens_in") or 0,
        "total_tokens_out": run_row.get("total_tokens_out") or 0,
        "total_cost_usd": float(run_row.get("total_cost_usd") or 0),
        "langfuse_trace_id": run_row.get("langfuse_trace_id"),
        "created_at": run_row.get("created_at"),
        "steps": steps,
    }


def _hydrate_swarm_children(
    swarm_id: str,
    payload: SwarmCreate,
) -> None:
    """Crée agents → tasks → tool_bindings après l'insertion du swarm parent.

    En cas d'erreur partielle, log et raise → l'appelant rollback le swarm
    (hard delete) puis renvoie 500. Pas de vraie transaction PostgreSQL
    (supabase-py n'expose pas de transaction native simple) — best-effort
    avec rollback applicatif.

    Mapping local→DB : si l'appelant a fourni `id` sur un agent ou une task,
    on l'utilise tel quel à l'insertion (UUIDs locaux préservés). Les tasks
    qui référencent un `agent_id` local trouvent ainsi leur agent sans
    round-trip intermédiaire.
    """
    agent_id_map: dict[str, str] = {}

    for agent in payload.agents or []:
        local_id = agent.id
        agent_payload = agent.model_dump(exclude_none=False, exclude={"id"})
        db_id = swarm_store.create_agent(
            swarm_id=swarm_id,
            payload=agent_payload,
            agent_id=local_id,
        )
        if db_id is None:
            raise RuntimeError(f"create_agent failed for swarm {swarm_id} (name={agent.name})")
        if local_id:
            agent_id_map[local_id] = db_id
        # Toujours mapper l'id DB sur lui-même pour fluidité.
        agent_id_map[db_id] = db_id

    # Mapping task local → DB (pour résoudre depends_on_task_id intra-payload)
    task_id_map: dict[str, str] = {}
    for task in payload.tasks or []:
        local_id = task.id
        task_payload = task.model_dump(exclude_none=False, exclude={"id"})
        # Résout l'agent_id : local front → id DB.
        agent_ref = task_payload.get("agent_id")
        if agent_ref and agent_ref in agent_id_map:
            task_payload["agent_id"] = agent_id_map[agent_ref]
        # Résout depends_on_task_id : local front → id DB s'il a déjà été créé.
        dep = task_payload.get("depends_on_task_id")
        if dep and dep in task_id_map:
            task_payload["depends_on_task_id"] = task_id_map[dep]

        db_id = swarm_store.create_task(
            swarm_id=swarm_id,
            payload=task_payload,
            task_id=local_id,
        )
        if db_id is None:
            raise RuntimeError(f"create_task failed for swarm {swarm_id} (name={task.name})")
        if local_id:
            task_id_map[local_id] = db_id
        task_id_map[db_id] = db_id

    for binding in payload.tool_bindings or []:
        agent_ref = binding.agent_id
        if agent_ref in agent_id_map:
            agent_ref = agent_id_map[agent_ref]
        bid = swarm_store.create_tool_binding(
            swarm_id=swarm_id,
            agent_id=agent_ref,
            tool_id=binding.tool_id,
            priority=binding.priority,
            config_json=binding.config_json,
            binding_id=binding.id,
        )
        if bid is None:
            raise RuntimeError(
                f"create_tool_binding failed (swarm={swarm_id}, agent={agent_ref}, tool={binding.tool_id})"
            )


async def _execute_dynamic_flow_background(
    swarm_id: str,
    run_id: str,
    trigger: str,
    inputs: dict[str, Any],
    n_tasks: int = 0,
) -> None:
    """Fire-and-forget : exécute DynamicSwarmFlow dans un thread, met à jour la DB.

    Identique à `_execute_flow_background` (routes/crews.py) :
    - Success → status="completed" (posé par finalize())
    - Timeout → status="failed", error_text
    - CancelledError (SIGTERM) → status="cancelled"
    - Exception → status="failed", error_text

    `n_tasks` : nombre de tasks du swarm, utilisé pour un timeout adaptatif
    via `_adaptive_flow_timeout`. n_tasks=0 → retombe sur FLOW_TIMEOUT_SECONDS.
    """
    effective_timeout = _adaptive_flow_timeout(n_tasks)
    try:
        flow = DynamicSwarmFlow()
        state_dict = {
            "swarm_id": swarm_id,
            "run_id": run_id,
            "trigger": trigger,
            "inputs": inputs,
        }
        await asyncio.wait_for(
            asyncio.to_thread(flow.kickoff, inputs=state_dict),
            timeout=effective_timeout,
        )
        # finalize() a déjà posé status=completed côté DB.
    except asyncio.TimeoutError:
        msg = f"Swarm flow exceeded {effective_timeout}s timeout"
        logger.error("Run %s timed out", run_id)
        swarm_store.update_swarm_run(
            run_id,
            status="failed",
            error_text=msg,
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
    except asyncio.CancelledError:
        logger.warning("Run %s cancelled (server shutdown)", run_id)
        swarm_store.update_swarm_run(
            run_id,
            status="cancelled",
            error_text="Server shutdown or task cancelled",
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("Run %s failed: %s", run_id, exc, exc_info=True)
        swarm_store.update_swarm_run(
            run_id,
            status="failed",
            error_text=str(exc),
            finished_at=datetime.now(timezone.utc).isoformat(),
        )


# ── Endpoints CRUD swarms ────────────────────────────────────────────────────


@router.get("/v1/swarms")
def list_swarms_endpoint(owner_id: str | None = Query(default=None)) -> list[dict[str, Any]]:
    """Liste tous les swarms actifs, filtrés optionnellement par owner_id."""
    return swarm_store.list_swarms(owner_id=owner_id)


@router.get("/v1/swarms/{swarm_id}")
def get_swarm_endpoint(
    swarm_id: str,
    owner_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """Renvoie un swarm complet (agents + tasks + tool_bindings).

    `owner_id` optionnel (propagé par le BFF) : si fourni, scope la lecture sur
    ce propriétaire — 404 si mismatch.
    """
    loaded = swarm_store.get_swarm(swarm_id, owner_id=owner_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found")
    return _shape_swarm_response(loaded)


@router.post("/v1/swarms", status_code=201)
def create_swarm_endpoint(
    payload: SwarmCreate,
    owner_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """Crée un nouveau swarm + agents/tasks/bindings en un seul POST.

    En cas d'erreur partielle, rollback applicatif (hard delete du swarm).

    F4 fix : `owner_id` peut arriver via query param (BFF) OU dans le body.
    Priorité body > query (body explicite gagne sur le contexte d'appel).
    """
    swarm_payload = payload.model_dump(
        exclude={"agents", "tasks", "tool_bindings"},
        exclude_none=True,
    )
    # F4 fix : si le body n'a pas posé owner_id, on prend celui du query param.
    if not swarm_payload.get("owner_id") and owner_id:
        swarm_payload["owner_id"] = owner_id

    # F7 fix : valider l'unicité des client_ids agents/tasks avant insertion.
    # Un duplicate ferait crasher l'hydration (FK contraintes) sans message clair.
    agent_client_ids = [a.id for a in (payload.agents or []) if a.id]
    if len(agent_client_ids) != len(set(agent_client_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate agent client_id in payload (each agent.id must be unique)",
        )
    task_client_ids = [t.id for t in (payload.tasks or []) if t.id]
    if len(task_client_ids) != len(set(task_client_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate task client_id in payload (each task.id must be unique)",
        )

    new_id = swarm_store.create_swarm(swarm_payload)
    if not new_id:
        raise HTTPException(
            status_code=500,
            detail="Failed to create swarm (Supabase unavailable or insert failed)",
        )

    try:
        _hydrate_swarm_children(new_id, payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Partial create failed for swarm %s, rolling back: %s",
            new_id, exc,
        )
        swarm_store.delete_swarm(new_id, hard=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to hydrate swarm children: {exc}",
        ) from exc

    loaded = swarm_store.get_swarm(new_id)
    if loaded is None:
        # Insertion réussie mais relecture KO — squelette minimal aligné Zod.
        # created_at/updated_at sont requis (string) côté SwarmRecordSchema —
        # on fournit l'heure courante ISO plutôt que None pour rester valide.
        fallback_ts = datetime.now(timezone.utc).isoformat()
        return {
            "id": new_id,
            "owner_id": payload.owner_id,
            "name": payload.name,
            "description": payload.description,
            "version": payload.version or 1,
            "config_json": payload.config_json,
            "is_active": payload.is_active if payload.is_active is not None else True,
            "is_template": payload.is_template if payload.is_template is not None else False,
            "created_at": fallback_ts,
            "updated_at": fallback_ts,
            "agents": [],
            "tasks": [],
            "tool_bindings": [],
        }
    return _shape_swarm_response(loaded)


@router.patch("/v1/swarms/{swarm_id}")
def update_swarm_endpoint(
    swarm_id: str,
    payload: SwarmUpdate,
    owner_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """Patch les champs fournis (les non-envoyés sont ignorés).

    Sémantique stricte (F2 fix) : on distingue "clé absente du payload" vs
    "clé envoyée explicitement à None/[]". On utilise `model_dump(exclude_unset=True)`
    qui ne renvoie QUE les champs effectivement présents dans le body JSON.
    → un PATCH `{"description": "X"}` ne touche PAS aux agents/tasks/bindings.

    Si `agents`, `tasks` ou `tool_bindings` sont **explicitement présents**
    (même si `[]`), on remplace intégralement ces collections (delete-all
    puis insert) via `swarm_store.replace_*`. Le mapping `client_id → db_uuid`
    est propagé pour résoudre les références cross-collections dans le même
    payload.

    `owner_id` optionnel (propagé par le BFF) : si fourni, la lecture
    pré-update et l'UPDATE scalaire sont scopés. Le swarm est validé via
    `get_swarm(.., owner_id=)` avant tout replace_* — un mismatch renvoie 404.
    """
    # Pre-check : valide propriétaire si owner_id fourni (404 sinon).
    if owner_id:
        guard = swarm_store.get_swarm(swarm_id, owner_id=owner_id)
        if guard is None:
            raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found")

    # `exclude_unset=True` : seules les clés POSÉES dans le body JSON apparaissent.
    # C'est la clé du fix : on ne re-set jamais une valeur "par défaut Pydantic"
    # sur un champ que le client n'a pas envoyé.
    payload_set = payload.model_dump(exclude_unset=True)

    # Sépare les champs scalaires (UPDATE swarms) et les collections (replace_*).
    # On utilise la présence de la CLÉ dans payload_set, pas la truthy-ness.
    agents_payload = payload_set.pop("agents") if "agents" in payload_set else None
    tasks_payload = payload_set.pop("tasks") if "tasks" in payload_set else None
    bindings_payload = (
        payload_set.pop("tool_bindings") if "tool_bindings" in payload_set else None
    )
    has_agents_key = agents_payload is not None
    has_tasks_key = tasks_payload is not None
    has_bindings_key = bindings_payload is not None

    if not payload_set and not has_agents_key and not has_tasks_key and not has_bindings_key:
        raise HTTPException(status_code=400, detail="No fields to update")

    if payload_set:
        ok = swarm_store.update_swarm(swarm_id, payload_set, owner_id=owner_id)
        if not ok:
            raise HTTPException(
                status_code=500,
                detail="Failed to update swarm (Supabase unavailable or update failed)",
            )

    # Replace cascades : agents d'abord (mapping), puis tasks/bindings qui
    # peuvent référencer ces agents par id client. Le pre-check owner_id
    # plus haut garantit le scoping ici (replace_* opèrent par swarm_id).
    # On déclenche replace_* uniquement si la CLÉ était présente — un []
    # explicite vide la collection, l'absence ne touche à rien.
    #
    # H2 fix : on check explicitement les retours pour distinguer succès
    # (mapping dict / True) de rollback (None / False) — le router doit
    # remonter un 500 si une opération a foiré, plutôt que retourner 200 OK
    # trompeur après un rollback silencieux.
    agent_id_map: dict[str, str] = {}
    errors: list[str] = []
    if has_agents_key:
        result = swarm_store.replace_agents(swarm_id, agents_payload or [])
        if result is None:
            errors.append("replace_agents failed (snapshot/delete/insert KO, rollback applied)")
        else:
            agent_id_map = result
    if has_tasks_key:
        result = swarm_store.replace_tasks(
            swarm_id, tasks_payload or [], agent_id_map=agent_id_map
        )
        if result is None:
            errors.append("replace_tasks failed (snapshot/delete/insert KO, rollback applied)")
    if has_bindings_key:
        ok = swarm_store.replace_tool_bindings(
            swarm_id, bindings_payload or [], agent_id_map=agent_id_map
        )
        if not ok:
            errors.append("replace_tool_bindings failed (snapshot/delete/insert KO, rollback applied)")

    if errors:
        raise HTTPException(
            status_code=500,
            detail={"message": "Partial update failed", "errors": errors},
        )

    loaded = swarm_store.get_swarm(swarm_id, owner_id=owner_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found after update")
    return _shape_swarm_response(loaded)


@router.delete("/v1/swarms/{swarm_id}", status_code=204)
def delete_swarm_endpoint(
    swarm_id: str,
    owner_id: str | None = Query(default=None),
) -> None:
    """Soft delete : marque `is_active=false`.

    `owner_id` optionnel : scope la suppression sur ce propriétaire.
    """
    # I6 fix : DELETE non-idempotent — aligné sur GET/PATCH pour cohérence
    # interne du projet. Même sans owner_id, on vérifie l'existence du swarm
    # avant le soft delete (404 si inexistant). Reste valide REST : DELETE
    # peut renvoyer 404 ou 204 selon la convention choisie.
    guard = swarm_store.get_swarm(swarm_id, owner_id=owner_id)
    if guard is None:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found")
    ok = swarm_store.delete_swarm(swarm_id, owner_id=owner_id)
    if not ok:
        raise HTTPException(
            status_code=500,
            detail="Failed to delete swarm (Supabase unavailable or update failed)",
        )


# ── Endpoints runs ───────────────────────────────────────────────────────────


@router.post("/v1/swarms/{swarm_id}/kickoff", status_code=202)
async def kickoff_swarm_endpoint(
    swarm_id: str,
    request: KickoffRequest,
    owner_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """Lance un run async. Retourne immédiatement `{run_id, swarm_id, status}`.

    La réponse respecte `SwarmKickoffResponseSchema` côté front (`{run_id}`).
    Le polling se fait via `/v1/swarms/{id}/status/{runId}` qui retourne la
    shape complète `SwarmRun` (avec `id`, pas `run_id`).

    `owner_id` optionnel : si fourni, valide que le swarm appartient à
    ce propriétaire avant de kicker quoi que ce soit (404 sinon).
    """
    # Validation : le swarm doit exister (scopé propriétaire si owner_id fourni).
    loaded = swarm_store.get_swarm(swarm_id, owner_id=owner_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail=f"Swarm {swarm_id!r} not found")

    # F3 fix : refuser le kickoff sur un swarm archivé (is_active=false).
    # Un swarm archivé ne doit plus être déclenchable même via API directe.
    if not loaded.get("swarm", {}).get("is_active", True):
        raise HTTPException(status_code=409, detail="Swarm is archived")

    # G6 fix : refuser le kickoff sur un swarm sans agent ou sans task.
    # Sans validation explicite, `create_dynamic_crew` raise ValueError au
    # milieu du flow (500 opaque côté caller). Mieux : 400 immédiat avec
    # un message lisible côté UI.
    if not loaded.get("agents") or not loaded.get("tasks"):
        raise HTTPException(
            status_code=400,
            detail="Swarm must have at least 1 agent and 1 task to kickoff",
        )

    run_id = str(uuid4())
    swarm_store.save_swarm_run(
        run_id=run_id,
        swarm_id=swarm_id,
        trigger=request.trigger,
        status="running",
        inputs_json=request.inputs or {},
    )

    # n_tasks is known here (swarm already loaded) — pass for adaptive timeout.
    n_tasks = len(loaded.get("tasks") or [])

    task = asyncio.create_task(
        _execute_dynamic_flow_background(
            swarm_id=swarm_id,
            run_id=run_id,
            trigger=request.trigger,
            inputs=request.inputs or {},
            n_tasks=n_tasks,
        )
    )
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)

    return {
        "run_id": run_id,
        "swarm_id": swarm_id,
        "status": "running",
    }


@router.get("/v1/swarms/{swarm_id}/status/{run_id}")
def status_swarm_run_endpoint(
    swarm_id: str,
    run_id: UUID,
    owner_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """Statut d'un run scope-checké (run.swarm_id == swarm_id).

    `owner_id` optionnel : scope la lecture sur ce propriétaire (joint via
    swarms.owner_id côté swarm_store).
    """
    run = swarm_store.get_swarm_run(str(run_id), owner_id=owner_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    if str(run.get("swarm_id")) != swarm_id:
        # Scoping strict : on n'expose pas les runs d'un autre swarm.
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found for swarm {swarm_id}")
    return _shape_run_response(run)


@router.get("/v1/swarms/{swarm_id}/runs")
def list_swarm_runs_endpoint(
    swarm_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    owner_id: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    """Runs récents d'un swarm donné, plus récents en premier.

    `owner_id` optionnel : si fourni, list_swarm_runs valide d'abord que le
    swarm appartient à l'owner et retourne [] sinon.
    """
    return swarm_store.list_swarm_runs(swarm_id, limit=limit, owner_id=owner_id)


@router.get("/v1/runs/{run_id}")
def get_run_cross_swarm_endpoint(
    run_id: UUID,
    owner_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """Lookup direct par run_id (utile pour debug ou liens directs depuis Langfuse).

    `owner_id` optionnel : si fourni, le run est filtré sur swarms.owner_id.
    """
    run = swarm_store.get_swarm_run(str(run_id), owner_id=owner_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return _shape_run_response(run)


# ── Architect Agent ──────────────────────────────────────────────────────────


@router.post("/v1/swarms/architect/generate")
async def architect_generate_endpoint(
    body: ArchitectGenerateRequest,
    owner_id: str | None = Query(default=None),
) -> dict[str, Any]:
    """Génère (preview) une spec de swarm depuis une description NL.

    Composition récursive : un agent LLM (Opus) conçoit une équipe d'agents.

    NE PERSISTE RIEN — renvoie une spec de shape `SwarmCreate` que le front
    affiche en preview puis envoie (après validation utilisateur) au
    `POST /v1/swarms` existant pour création réelle.

    `owner_id` : priorité body > query (même règle que `create_swarm`). Sert
    à scoper le catalogue de tools référençables par l'architecte.

    Erreurs :
    - 422 : prompt invalide (Pydantic — auto).
    - 502 : l'architecte n'a pas produit de spec valide après retries
      (`ArchitectGenerationError`) ou erreur inattendue.
    - 504 : génération dépassant `settings.ARCHITECT_TIMEOUT_SECONDS`.
    """
    # Import local : garde `architect` hors du chemin d'import du router
    # (le module ne fait aucun side-effect, mais on évite de charger les
    # deps LLM tant que l'endpoint n'est pas appelé).
    from ..agents.architect import ArchitectGenerationError, generate_swarm_spec

    effective_owner_id = body.owner_id or owner_id
    available_tools = swarm_store.list_tools(owner_id=effective_owner_id)

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                generate_swarm_spec,
                body.prompt,
                available_tools,
                effective_owner_id,
            ),
            timeout=settings.ARCHITECT_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        logger.error(
            "Architect generation timed out after %ds",
            settings.ARCHITECT_TIMEOUT_SECONDS,
        )
        raise HTTPException(
            status_code=504,
            detail=(
                f"Architect generation exceeded "
                f"{settings.ARCHITECT_TIMEOUT_SECONDS}s timeout"
            ),
        ) from exc
    except ArchitectGenerationError as exc:
        logger.error("Architect generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Architect generation unexpected error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"Architect generation error: {exc}",
        ) from exc

    return result


# ── Tools catalog ────────────────────────────────────────────────────────────


@router.get("/v1/tools")
def list_tools_endpoint(owner_id: str | None = Query(default=None)) -> list[dict[str, Any]]:
    """Liste le catalogue de tools actifs (filtre optionnel par owner)."""
    return swarm_store.list_tools(owner_id=owner_id)
