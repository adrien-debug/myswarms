"""Factory dynamique de Crew CrewAI à partir d'une config DB Supabase.

# TODO V2 [H7] : ce fichier dépasse 500 lignes (~540L). Cohésion forte
# autour de la factory de Crew dynamique (load → mapping → instantiation →
# callbacks). Splitter introduirait des indirections artificielles pour
# peu de gain. Plan V2 : extraire un `crew_callbacks.py` séparé pour les
# step_callback / task_callback / agent_callback dès qu'on dépasse 700L
# ou qu'on ajoute un 3e type de callback (e.g. tool_callback).

Charge un swarm (agents + tasks + tool_bindings) via `swarm_store.get_swarm`
puis instancie des objets CrewAI natifs (`Agent`, `Task`, `Crew`).

Contrat (aligné avec la migration 0006_swarms_dynamic.sql) :
- `model_provider` ∈ {"anthropic", "openai", "kimi", "hypercli"} — fallback "anthropic"
- `model_name` : string LiteLLM (ex: "claude-sonnet-4-6"). Si fourni, override
  toute factory. La colonne `llm_tier` N'EXISTE PAS en DB — fallback direct
  vers `get_llm("balanced")` si `model_name` absent ou invalide.
- Les tool_bindings de category "api_call" et tool.name ∈ {gmail, slack, telegram,
  googlecalendar, notion} sont résolus via Composio (via composio_session.get_composio_tools_for_toolkits).
- Les autres catégories renvoient pour l'instant une liste vide (extensible plus tard).
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from crewai import Agent, Crew, LLM, Process, Task

from ..composio_session import get_composio_tools_for_toolkits
from ..llms import get_llm
from ..persistence import swarm_store

logger = logging.getLogger(__name__)

# G3 fix : limite de preview pour les output_text persistés en DB. CrewAI
# peut produire des outputs longs (>50KB) qui gonflent inutilement
# `swarm_run_steps`. On garde un preview lisible côté UI.
_STEP_OUTPUT_PREVIEW_CHARS = 2000


# ── Constants ────────────────────────────────────────────────────────────────

_COMPOSIO_TOOLKITS: set[str] = {
    "gmail",
    "slack",
    "telegram",
    "googlecalendar",
    "notion",
    "google_calendar",  # alias commun, normalisé plus bas
}


def _resolve_llm(agent_row: dict[str, Any]) -> LLM:
    """Résout l'instance LLM à partir des colonnes DB.

    Priorité :
    1. `model_name` explicite (string LiteLLM, ex: "anthropic/claude-sonnet-4-6").
       Préfixé par `model_provider` si manquant (ex: "claude-haiku-4-5" + provider
       "anthropic" → "anthropic/claude-haiku-4-5").
    2. Fallback `get_llm("balanced")` si `model_name` manquant ou échec
       d'instanciation.

    NB : la colonne `llm_tier` N'EXISTE PAS dans `swarm_agents` (migration 0006)
    — on se base uniquement sur `model_provider` + `model_name`.
    """
    model_name = (agent_row.get("model_name") or "").strip()
    provider = (agent_row.get("model_provider") or "").strip().lower()
    agent_name_or_id = agent_row.get("name") or agent_row.get("id") or "<unknown>"

    if model_name:
        # Préfixe LiteLLM si absent : "anthropic/", "openai/", etc.
        if "/" not in model_name and provider:
            # kimi / hypercli partagent un endpoint OpenAI-compatible.
            litellm_provider = "openai" if provider in {"kimi", "hypercli"} else provider
            model_name = f"{litellm_provider}/{model_name}"
        try:
            return LLM(model=model_name)
        except Exception as exc:  # noqa: BLE001
            # Préfixe stable `[LLM_FALLBACK]` pour grep côté observabilité —
            # Langfuse / Loki / Railway peuvent indexer ce tag pour compter
            # les fallbacks par agent / modèle / heure.
            logger.warning(
                "[LLM_FALLBACK] agent=%s requested provider=%s model=%s — "
                "LLM() instanciation failed (%s) — falling back to balanced tier",
                agent_name_or_id, provider, model_name, exc,
            )

    logger.warning(
        "[LLM_FALLBACK] agent=%s requested provider=%s model=%s — "
        "falling back to balanced tier",
        agent_name_or_id, provider, model_name,
    )
    return get_llm("balanced")


def _resolve_tools_for_agent(
    agent_id: str,
    tool_bindings: list[dict[str, Any]],
) -> list:
    """Renvoie la liste de tools CrewAI pour un agent donné.

    Aujourd'hui :
    - category="api_call" + tool.name ∈ _COMPOSIO_TOOLKITS → Composio bridge.
    - Les autres bindings sont ignorés (log debug). Extensible plus tard
      (webhook/custom-python/etc.).
    """
    composio_toolkits: list[str] = []
    for binding in tool_bindings:
        if binding.get("agent_id") != agent_id:
            continue
        tool = binding.get("tool") or {}
        if not tool:
            continue
        category = (tool.get("category") or "").lower()
        name = (tool.get("name") or "").lower()
        if category == "api_call" and name in _COMPOSIO_TOOLKITS:
            # Normalise les alias.
            slug = "googlecalendar" if name in {"googlecalendar", "google_calendar"} else name
            if slug not in composio_toolkits:
                composio_toolkits.append(slug)
        else:
            logger.debug(
                "Tool binding ignored (agent=%s, category=%s, name=%s) — not yet supported",
                agent_id, category, name,
            )

    if not composio_toolkits:
        return []
    return get_composio_tools_for_toolkits(composio_toolkits)


def instantiate_agents(swarm_config: dict[str, Any]) -> dict[str, Agent]:
    """Construit la map {agent_id_db: Agent CrewAI} à partir du swarm chargé."""
    agents_rows: list[dict[str, Any]] = swarm_config.get("agents", []) or []
    tool_bindings: list[dict[str, Any]] = swarm_config.get("tool_bindings", []) or []

    agents_map: dict[str, Agent] = {}
    for row in agents_rows:
        agent_id = str(row.get("id") or "")
        if not agent_id:
            logger.warning("Agent row without id skipped: %s", row)
            continue

        role = (row.get("role") or row.get("name") or "Agent").strip()
        goal = (row.get("system_prompt") or row.get("name") or "").strip() or role
        backstory = (row.get("description") or "").strip() or (
            f"Specialized agent: {role}"
        )

        tools = _resolve_tools_for_agent(agent_id, tool_bindings)
        llm = _resolve_llm(row)

        try:
            agents_map[agent_id] = Agent(
                role=role,
                goal=goal,
                backstory=backstory,
                tools=tools,
                llm=llm,
                allow_delegation=bool(row.get("allow_delegation", False)),
                verbose=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to build Agent for id=%s: %s", agent_id, exc)
    return agents_map


def _topological_sort_tasks(
    tasks_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Tri topologique (Kahn) des tasks selon `depends_on_task_id`.

    Garantit que pour chaque task instanciée, sa dépendance (si elle existe
    et est présente dans la liste) ait déjà été instanciée — sinon le
    `context=[prev_task]` côté CrewAI ne pourrait pas être résolu.

    Fallback : si un cycle est détecté ou si certaines tasks restent
    "orphelines" (cycle entre elles), on log un warning et on les ajoute
    en fin de liste dans leur ordre `(position_y, position_x)` d'origine.
    """
    # Index les tasks par id pour lookup rapide.
    by_id: dict[str, dict[str, Any]] = {}
    order_idx: dict[str, int] = {}
    for idx, row in enumerate(tasks_rows):
        tid = str(row.get("id") or "")
        if not tid:
            continue
        by_id[tid] = row
        order_idx[tid] = idx

    # in_degree initial : combien de tasks pointent VERS moi via depends_on
    # — non, Kahn standard utilise l'inverse : nb de mes prérequis non encore résolus.
    # Pour la cohérence d'execution sequential, on veut que les prérequis sortent en premier.
    in_degree: dict[str, int] = {tid: 0 for tid in by_id}
    # Graph "qui dépend de moi" : key = task qui doit sortir avant, value = ses successeurs.
    successors: dict[str, list[str]] = {tid: [] for tid in by_id}
    for tid, row in by_id.items():
        dep = row.get("depends_on_task_id")
        dep_str = str(dep) if dep else ""
        if dep_str and dep_str in by_id:
            # Cette task a dep_str comme prérequis → dep_str est prédecesseur.
            successors[dep_str].append(tid)
            in_degree[tid] += 1
        # Si dep_str n'existe pas dans by_id, on traite comme racine (in_degree=0).

    # Kahn : queue de tasks sans prérequis non résolus, tri stable par order_idx.
    queue: list[str] = sorted(
        [tid for tid, deg in in_degree.items() if deg == 0],
        key=lambda t: order_idx[t],
    )
    sorted_ids: list[str] = []
    while queue:
        # Pop la "première" (tri stable par position d'origine).
        head = queue.pop(0)
        sorted_ids.append(head)
        for succ in successors[head]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                # Insère à la bonne place (tri stable).
                inserted = False
                for i, q in enumerate(queue):
                    if order_idx[succ] < order_idx[q]:
                        queue.insert(i, succ)
                        inserted = True
                        break
                if not inserted:
                    queue.append(succ)

    if len(sorted_ids) != len(by_id):
        # Cycle détecté : les tasks restantes ont in_degree > 0.
        leftover = [tid for tid in by_id if tid not in sorted_ids]
        logger.warning(
            "Cycle détecté dans depends_on_task_id — tasks %s ajoutées en fin "
            "dans leur ordre (position_y, position_x) initial",
            leftover,
        )
        leftover.sort(key=lambda t: order_idx[t])
        sorted_ids.extend(leftover)

    return [by_id[tid] for tid in sorted_ids]


def instantiate_tasks(
    agents_map: dict[str, Agent],
    swarm_config: dict[str, Any],
) -> list[tuple[dict[str, Any], Task]]:
    """Construit la liste ordonnée de paires (meta DB, Task CrewAI).

    Le tri topologique (Kahn) garantit que `depends_on_task_id` est toujours
    résolvable vers un Task déjà construit, indépendamment de l'ordre de
    livraison Supabase (par défaut `position_y, position_x` — cf migration 0006).
    En cas de cycle, on tombe sur un fallback ordonné par position avec
    un warning explicite (cf `_topological_sort_tasks`).

    Retourne des paires `(meta, task)` — et NON juste les Task — pour que
    l'appelant puisse construire un `tasks_meta` strictement aligné (même
    cardinalité, même ordre) sur les tasks réellement instanciées. `meta`
    contient `task_id` / `agent_id` DÉJÀ résolus et validés ici (agent_id
    non-NULL et présent dans `agents_map`), évitant à l'appelant de re-résoudre
    l'agent_id. Les rows orphelines (agent_id NULL, agent inconnu, sans id, ou
    échec Task()) sont skippées ici et n'apparaissent donc pas dans le retour :
    le mapping meta↔task est exact par construction, sans duplication du
    prédicat de skip ni de la résolution agent_id.
    """
    tasks_rows: list[dict[str, Any]] = swarm_config.get("tasks", []) or []
    # B4 — tri topologique pour résoudre les dépendances proprement.
    ordered_rows = _topological_sort_tasks(tasks_rows)

    task_objects: dict[str, Task] = {}
    ordered_pairs: list[tuple[dict[str, Any], Task]] = []

    for row in ordered_rows:
        task_id = str(row.get("id") or "")
        if not task_id:
            logger.warning("Task row without id skipped: %s", row)
            continue

        # G1 fix : agent_id peut être NULL (task orpheline post-cascade SET NULL,
        # cf. migration 0009). On skip avec warning explicit plutôt que de
        # crasher la construction du Crew — l'orphan doit être re-pair via un
        # PATCH tasks côté UI avant de pouvoir rejouer le swarm.
        raw_agent_id = row.get("agent_id")
        if raw_agent_id is None:
            logger.warning(
                "Task %s has agent_id=NULL (orphan after agent deletion) — skipping. "
                "Re-pair via PATCH /v1/swarms/{id} with tasks payload to restore execution.",
                task_id,
            )
            continue
        agent_id = str(raw_agent_id)
        agent = agents_map.get(agent_id)
        if agent is None:
            logger.warning(
                "Task %s references unknown agent_id=%s — skipping",
                task_id, agent_id,
            )
            continue

        description = (row.get("description") or row.get("name") or "").strip()
        expected_output = (row.get("expected_output") or "Task output").strip()

        depends_on = row.get("depends_on_task_id")
        context_tasks: list[Task] = []
        if depends_on:
            dep_task = task_objects.get(str(depends_on))
            if dep_task is not None:
                context_tasks.append(dep_task)
            else:
                # Avec le tri topologique, ce cas n'arrive plus que si la
                # dépendance pointe vers un id inexistant ou en cycle.
                logger.warning(
                    "Task %s depends_on %s not yet instantiated (orphan ou cycle) — context skipped",
                    task_id, depends_on,
                )

        try:
            task_obj = Task(
                description=description,
                expected_output=expected_output,
                agent=agent,
                context=context_tasks or None,
            )
            task_objects[task_id] = task_obj
            # meta : task_id / agent_id déjà résolus et validés ci-dessus
            # (agent_id non-NULL + présent dans agents_map). On le porte tel
            # quel pour que l'appelant n'ait rien à re-résoudre.
            ordered_pairs.append(({"task_id": task_id, "agent_id": agent_id}, task_obj))
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to build Task for id=%s: %s", task_id, exc)
    return ordered_pairs


def _build_step_callback(
    run_id: str,
    agents_map: dict[str, Agent],
    tasks_meta: list[dict[str, Any]],
):
    """H3 fix : callback CrewAI qui pousse chaque step ReAct dans
    `swarm_run_steps`.

    Le `step_callback` CrewAI est appelé pour chaque sous-étape d'agent (un
    cycle ReAct peut en générer plusieurs par task). Le `task_callback` est
    appelé en fin de task. Avant ce fix, les deux partagaient un même
    `step_number` qui mélangeait step+task et faussait le mapping
    `task_meta_by_idx`.

    Maintenant :
      - state isolé dans une closure dédiée (step_state)
      - `step_state["step_number"]` incrémenté à chaque step ReAct
      - `step_state["current_task_idx"]` avance via `_build_task_callback`
        (incrémenté en fin de chaque task)

    Le `task_meta_by_idx[current_task_idx]` permet d'attribuer correctement
    le `task_id` / `agent_id` à chaque step ReAct.

    Pas de tokens / cost — sera ajouté en V2 si LiteLLM remonte les usage
    metrics via les hooks `tool_callback` / `task_completed_callback`.

    Returns:
        (step_cb, step_state) : la closure callback + son state isolé. Le
        state est exposé pour que `_build_task_callback` puisse le partager
        via fermeture explicite (et non via "le même callback").
    """
    # Reverse map : Agent obj id() → DB uuid.
    agent_obj_to_id: dict[int, str] = {
        id(agent): db_id for db_id, agent in agents_map.items()
    }
    task_meta_by_idx: list[dict[str, Any]] = tasks_meta

    step_state: dict[str, Any] = {
        "step_number": 0,
        "current_task_idx": 0,
        "last_t": time.monotonic(),
    }

    def step_cb(payload: Any) -> None:
        try:
            step_state["step_number"] += 1
            now = time.monotonic()
            latency_ms = int((now - step_state["last_t"]) * 1000)
            step_state["last_t"] = now

            agent_id: str | None = None
            task_id: str | None = None
            output_text: str | None = None
            # Aligné sur l'enum DB `crew_run_status` (migration 0010 tâche E) :
            # valeurs autorisées = pending / running / paused_hitl / completed /
            # failed / cancelled. JAMAIS écrire "ok" ou "error" ici — rejected
            # par le cast enum côté Postgres.
            status = "completed"

            # Best-effort introspection : CrewAI 1.14 envoie un objet step
            # interne (AgentAction / AgentFinish) — on extrait ce qu'on peut
            # sans présumer la shape exacte.
            agent_attr = getattr(payload, "agent", None)
            if isinstance(agent_attr, Agent):
                agent_id = agent_obj_to_id.get(id(agent_attr))
            elif isinstance(agent_attr, str):
                for db_id, agent in agents_map.items():
                    if getattr(agent, "role", "") == agent_attr:
                        agent_id = db_id
                        break

            for attr in ("output", "log", "raw", "result", "input"):
                val = getattr(payload, attr, None)
                if val:
                    output_text = str(val)[:_STEP_OUTPUT_PREVIEW_CHARS]
                    break

            # Attribue ce step à la task courante (suivant current_task_idx).
            idx = step_state["current_task_idx"]
            if 0 <= idx < len(task_meta_by_idx):
                meta = task_meta_by_idx[idx]
                task_id = meta.get("task_id")
                if agent_id is None:
                    agent_id = meta.get("agent_id")

            if getattr(payload, "error", None):
                status = "failed"
                output_text = str(getattr(payload, "error"))[:_STEP_OUTPUT_PREVIEW_CHARS]

            swarm_store.append_run_step(
                run_id=run_id,
                agent_id=agent_id,
                task_id=task_id,
                step_number=step_state["step_number"],
                output_text=output_text,
                latency_ms=latency_ms,
                status=status,
            )
            # H5 fix : `finished_at` n'est PAS posé ici — append_run_step ne
            # gère que created_at, et nous n'avons pas l'id du step en retour
            # (best-effort, pas atomique). TODO V2 : retourner le step_id
            # depuis append_run_step et faire un update_run_step ultérieur
            # quand le step suivant arrive (proxy de "fin du step précédent").
        except Exception as exc:  # noqa: BLE001
            # Un callback qui crash ne doit JAMAIS faire tomber le Crew.
            logger.warning(
                "step_callback failed for run=%s step=%s: %s",
                run_id, step_state.get("step_number"), exc,
            )

    return step_cb, step_state


def _build_task_callback(
    run_id: str,
    step_state: dict[str, Any],
    tasks_meta: list[dict[str, Any]],
):
    """H3 fix : callback de fin de task — avance le `current_task_idx`.

    À chaque fin de task CrewAI (TaskOutput), on incrémente le pointeur dans
    `step_state` pour que les prochains step_callback rattachent leur step
    aux meta de la task SUIVANTE. State partagé via closure (et non via "le
    même callback" comme avant le fix).

    Optionnellement, on persiste aussi un "step de fin de task" pour tracer
    le TaskOutput côté `swarm_run_steps` — utile pour l'UI timeline.
    """
    def task_cb(task_output: Any) -> None:
        try:
            # Persiste un step "task done" avec l'output final de la task.
            current_idx = step_state["current_task_idx"]
            if 0 <= current_idx < len(tasks_meta):
                meta = tasks_meta[current_idx]
                output_text: str | None = None
                for attr in ("raw", "output", "result", "description"):
                    val = getattr(task_output, attr, None)
                    if val:
                        output_text = str(val)[:_STEP_OUTPUT_PREVIEW_CHARS]
                        break
                step_state["step_number"] += 1
                swarm_store.append_run_step(
                    run_id=run_id,
                    agent_id=meta.get("agent_id"),
                    task_id=meta.get("task_id"),
                    step_number=step_state["step_number"],
                    output_text=output_text,
                    latency_ms=0,
                    status="completed",
                )
            # Avance vers la task suivante pour les prochains step_callback.
            step_state["current_task_idx"] += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "task_callback failed for run=%s task_idx=%s: %s",
                run_id, step_state.get("current_task_idx"), exc,
            )

    return task_cb


def create_dynamic_crew(swarm_id: str, run_id: str | None = None) -> Crew:
    """Charge un swarm DB et renvoie un Crew CrewAI prêt à être kickoff.

    Args:
        swarm_id: UUID du swarm en DB.
        run_id:   UUID du run en cours (optionnel). Si fourni, on installe
                  un step_callback / task_callback qui persiste chaque
                  step dans `swarm_run_steps` — G3 fix.

    Raises:
        ValueError: si le swarm n'existe pas ou n'a aucun agent/task valide.
    """
    swarm_config = swarm_store.get_swarm(swarm_id)
    if swarm_config is None:
        raise ValueError(f"Swarm {swarm_id} not found")

    agents_map = instantiate_agents(swarm_config)
    if not agents_map:
        raise ValueError(f"Swarm {swarm_id} has no instantiable agents")

    task_pairs = instantiate_tasks(agents_map, swarm_config)
    if not task_pairs:
        raise ValueError(f"Swarm {swarm_id} has no instantiable tasks")
    tasks = [task for _meta, task in task_pairs]

    # Process : par défaut sequential ; lit `swarm.config_json.process` si fourni.
    config_json = swarm_config.get("swarm", {}).get("config_json") or {}
    process_str = (config_json.get("process") or "sequential").lower()
    process = Process.hierarchical if process_str == "hierarchical" else Process.sequential

    crew_kwargs: dict[str, Any] = {
        "agents": list(agents_map.values()),
        "tasks": tasks,
        "process": process,
        "verbose": True,
    }

    # H3 fix : step_callback + task_callback SÉPARÉS avec state isolé.
    # Avant : un seul `callback` était installé pour les deux hooks → mélange
    # step+task et faux step_number. Maintenant : deux closures distinctes
    # qui partagent `step_state` via fermeture explicite.
    if run_id:
        # WHY : `tasks_meta` DOIT être strictement iso (cardinalité + ordre)
        # à `tasks` réellement passées au Crew. Le task_callback incrémente
        # `current_task_idx` une fois par task EXÉCUTÉE puis indexe dans
        # `tasks_meta` — toute task orpheline skippée par instantiate_tasks
        # (agent_id NULL / agent inconnu / échec Task()) décalerait l'indice
        # et attribuerait les steps au mauvais task_id. `task_pairs` porte
        # déjà le meta {task_id, agent_id} résolu et validé par
        # instantiate_tasks, dans le MÊME ordre que `tasks` (même boucle,
        # même prédicat de skip) — on l'extrait tel quel, sans recalcul.
        tasks_meta: list[dict[str, Any]] = [meta for meta, _task in task_pairs]
        step_cb, step_state = _build_step_callback(run_id, agents_map, tasks_meta)
        task_cb = _build_task_callback(run_id, step_state, tasks_meta)
        crew_kwargs["step_callback"] = step_cb
        crew_kwargs["task_callback"] = task_cb

    return Crew(**crew_kwargs)


# Cast utilitaire pour timestamps ISO (utilisé par finalize-style helpers).
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
