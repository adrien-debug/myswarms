"""Flow CrewAI générique pour un swarm dynamique chargé depuis Supabase.

Pattern reprend `chief_of_staff_flow.py` mais paramétré par `swarm_id`.
- @start initialize : log + horodatage.
- @listen(initialize) run_crew : `create_dynamic_crew(swarm_id).kickoff(inputs)`.
- @listen(run_crew) finalize : update `swarm_runs` à `completed`.

Toute exception en cours d'exécution met le run à `failed` et propage l'erreur
au caller (le router est libre de la convertir en HTTP 500 ou de logger seulement).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from crewai import Flow
from crewai.flow.flow import listen, start
from pydantic import BaseModel, Field

from ..crews.dynamic_crew import create_dynamic_crew
from ..persistence import swarm_store

logger = logging.getLogger(__name__)


class DynamicSwarmState(BaseModel):
    """State partagé entre les étapes du Flow.

    Tous les champs ont un default sain. CrewAI instancie le state via
    `state_type()` (sans arguments) AVANT d'appliquer les `inputs` du
    `kickoff()` — un champ required ferait crasher l'instanciation
    (`ValidationError`). La validation logique (swarm_id non vide) est
    déléguée à `initialize()` qui raise explicitement si l'invocation a
    oublié de passer `swarm_id`.
    """

    # Identifiants — defaults vides, validés runtime dans initialize().
    swarm_id: str = ""
    run_id: str = ""

    # Contexte d'invocation
    trigger: str = "on_demand"
    inputs: dict[str, Any] = Field(default_factory=dict)
    owner_id: str | None = None

    # Résultat
    result: str | None = None
    error: str | None = None

    # Métadonnées
    started_at: str = ""
    completed_at: str = ""


class DynamicSwarmFlow(Flow[DynamicSwarmState]):
    """Flow générique multi-swarm.

    Le state DOIT être pré-rempli (au minimum `swarm_id` + `run_id`) via le
    paramètre `inputs` de `kickoff()` — CrewAI hydrate le state depuis ces
    inputs avant d'appeler `@start initialize`. Si `swarm_id` est vide à
    `initialize()`, on raise explicitement.
    """

    @start()
    def initialize(self) -> str:
        # Validation logique : un kickoff() doit toujours fournir swarm_id.
        if not self.state.swarm_id:
            raise ValueError(
                "DynamicSwarmFlow.initialize: swarm_id missing — "
                "kickoff(inputs={'swarm_id': ..., 'run_id': ...}) is required"
            )
        self.state.started_at = datetime.now(timezone.utc).isoformat()
        logger.info(
            "DynamicSwarmFlow starting — swarm_id=%s run_id=%s trigger=%s",
            self.state.swarm_id, self.state.run_id, self.state.trigger,
        )
        return self.state.swarm_id

    @listen(initialize)
    def run_crew(self, swarm_id: str) -> str:
        """Construit le crew dynamique et lance kickoff() synchrone.

        Pourquoi sync (`kickoff`) et pas `akickoff_async` ?
        - Le router emballe déjà l'exécution dans `asyncio.to_thread()` pour
          ne pas bloquer la boucle (cf routes/swarms.py).
        - Un Crew sequential lance ses tasks en interne sans bénéfice à l'async.
        - Aligne le comportement avec `ChiefOfStaffFlow` pour cohérence
          (gestion timeout / cancellation côté router).
        """
        try:
            # G3 fix : on passe run_id pour que `create_dynamic_crew` installe
            # le step_callback / task_callback qui persiste les steps dans
            # `swarm_run_steps`.
            crew = create_dynamic_crew(swarm_id, run_id=self.state.run_id or None)
            result = crew.kickoff(inputs=self.state.inputs or {})
            # CrewAI renvoie un CrewOutput. .raw existe, sinon fallback str(result).
            raw_result = getattr(result, "raw", None) or str(result)
            self.state.result = raw_result
            return raw_result
        except Exception as exc:
            self.state.error = str(exc)
            logger.error(
                "DynamicSwarmFlow crew kickoff failed (swarm=%s, run=%s): %s",
                self.state.swarm_id, self.state.run_id, exc, exc_info=True,
            )
            # Marque le run failed en DB tout de suite — finalize ne sera pas appelé.
            if self.state.run_id:
                swarm_store.update_swarm_run(
                    self.state.run_id,
                    status="failed",
                    error_text=str(exc),
                    finished_at=datetime.now(timezone.utc).isoformat(),
                )
            raise

    @listen(run_crew)
    def finalize(self, crew_output: str) -> str:
        """Persistance finale + horodatage."""
        self.state.completed_at = datetime.now(timezone.utc).isoformat()
        if self.state.run_id:
            swarm_store.update_swarm_run(
                self.state.run_id,
                status="completed",
                result_text=crew_output,
                finished_at=self.state.completed_at,
            )
        logger.info(
            "DynamicSwarmFlow completed — swarm_id=%s run_id=%s",
            self.state.swarm_id, self.state.run_id,
        )
        return crew_output
