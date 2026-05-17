-- 0009_swarm_tasks_set_null_relax.sql
--
-- G1 fix (Stage 4 pass 3) : préserve les tasks et tool_bindings quand un
-- agent est supprimé via `replace_agents` (PATCH agents-only depuis le UI).
--
-- Migration 0006 avait posé :
--   swarm_tasks.agent_id          FK → swarm_agents(id) ON DELETE CASCADE  + NOT NULL
--   swarm_tool_bindings.agent_id  FK → swarm_agents(id) ON DELETE CASCADE  + NOT NULL
--
-- Problème : `swarm_store.replace_agents` snapshote uniquement la table
-- swarm_agents puis fait `DELETE ... WHERE swarm_id = ?`. La CASCADE
-- détruit toutes les tasks et tool_bindings AVANT que F6 ne puisse les
-- restaurer (le snapshot ne les couvre pas). Résultat : un PATCH
-- `{"agents": [...]}` (sans clé `tasks`) supprime silencieusement toutes
-- les tasks du swarm.
--
-- Fix :
--   1. swarm_tasks.agent_id           → ON DELETE SET NULL + nullable
--   2. swarm_tool_bindings.agent_id   → ON DELETE SET NULL + nullable
--
-- Le snapshot multi-tables côté Python (G1 fix dans swarm_store) + le
-- SET NULL DB préservent désormais les tasks/bindings orphelins. Le UI
-- builder continue d'exiger un agent à la création (TaskInputSchema.agent_id
-- required côté Zod).
--
-- Idempotent : DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (mêmes noms qu'en
-- 0006, ce qui matche aussi un re-run).

-- ─── swarm_tasks.agent_id : CASCADE → SET NULL + nullable ───────────────────

alter table public.swarm_tasks
  drop constraint if exists swarm_tasks_agent_id_fkey;

alter table public.swarm_tasks
  alter column agent_id drop not null;

alter table public.swarm_tasks
  add constraint swarm_tasks_agent_id_fkey
  foreign key (agent_id)
  references public.swarm_agents(id)
  on delete set null;

-- ─── swarm_tool_bindings.agent_id : CASCADE → SET NULL + nullable ───────────

alter table public.swarm_tool_bindings
  drop constraint if exists swarm_tool_bindings_agent_id_fkey;

alter table public.swarm_tool_bindings
  alter column agent_id drop not null;

alter table public.swarm_tool_bindings
  add constraint swarm_tool_bindings_agent_id_fkey
  foreign key (agent_id)
  references public.swarm_agents(id)
  on delete set null;
