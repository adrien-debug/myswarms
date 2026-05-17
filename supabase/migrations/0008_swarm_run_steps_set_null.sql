-- 0008_swarm_run_steps_set_null.sql
--
-- Préserve l'historique des steps quand un agent ou une task est supprimé.
--
-- Migration 0006 avait posé :
--   swarm_run_steps.agent_id  FK → swarm_agents(id)  ON DELETE CASCADE  + NOT NULL
--   swarm_run_steps.task_id   FK → swarm_tasks(id)   ON DELETE SET NULL + NULL OK
--
-- Problème : à chaque PATCH /v1/swarms/{id} avec un payload `agents`, le BFF
-- appelle `swarm_store.replace_agents` qui fait DELETE ALL puis INSERT — ce
-- qui détruit tout l'historique des swarm_run_steps liés via la CASCADE.
--
-- Fix :
--   1. agent_id  → ON DELETE SET NULL + colonne nullable
--   2. task_id   → déjà OK (vérifié par DROP IF EXISTS + ADD pour idempotence)
--
-- Idempotent : DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (les contraintes
-- gardent les mêmes noms qu'avant, ce qui matche aussi un re-run de 0006).

-- ─── agent_id : CASCADE → SET NULL + nullable ───────────────────────────────

alter table public.swarm_run_steps
  drop constraint if exists swarm_run_steps_agent_id_fkey;

alter table public.swarm_run_steps
  alter column agent_id drop not null;

alter table public.swarm_run_steps
  add constraint swarm_run_steps_agent_id_fkey
  foreign key (agent_id)
  references public.swarm_agents(id)
  on delete set null;

-- ─── task_id : déjà SET NULL + nullable, on rejoue pour idempotence ─────────

alter table public.swarm_run_steps
  drop constraint if exists swarm_run_steps_task_id_fkey;

alter table public.swarm_run_steps
  add constraint swarm_run_steps_task_id_fkey
  foreign key (task_id)
  references public.swarm_tasks(id)
  on delete set null;
