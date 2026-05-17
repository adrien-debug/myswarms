-- 0007_seed_chief_of_staff.sql
-- Seed du Chief of Staff comme template (is_template=true, owner_id NULL).
-- Le NULL sur owner_id est autorisé (FK on delete cascade vers auth.users,
-- mais nullable). Permet à n'importe quel user authentifié de "forker" ce
-- template via la policy `swarms_templates_readable` (cf. 0006).
--
-- Contenu minimal volontaire : 1 agent "Chief Coordinator" + 1 task
-- "Daily Digest". La réplique fidèle des 8 agents Python (services/crewai-
-- engine/src/) est hors scope ici : ce seed sert uniquement de point de
-- départ pour le Swarm Builder UI.
--
-- Idempotent : ON CONFLICT DO NOTHING via la unique constraint
-- swarms_owner_name_unique (owner_id, name).

do $$
declare
  v_swarm_id uuid;
  v_agent_id uuid;
begin
  -- 1. Insert / fetch swarm template
  insert into public.swarms (owner_id, name, description, is_template, is_active, config_json)
  values (
    null,
    'Chief of Staff (template)',
    'Daily Chief of Staff template seed — coordinateur unique + tâche digest quotidien. '
    || 'À forker depuis le Swarm Builder pour personnaliser agents/tasks/tools.',
    true,
    true,
    jsonb_build_object(
      'origin', 'seed_0007',
      'version', '1.0.0',
      'source', 'services/crewai-engine (hardcoded)'
    )
  )
  on conflict on constraint swarms_owner_name_unique do nothing
  returning id into v_swarm_id;

  -- Si le swarm existait déjà (rerun), on récupère son id
  if v_swarm_id is null then
    select id into v_swarm_id
    from public.swarms
    where owner_id is null
      and name = 'Chief of Staff (template)'
    limit 1;
  end if;

  -- 2. Insert / fetch agent
  insert into public.swarm_agents (
    swarm_id, name, role, system_prompt,
    model_provider, model_name, temperature, max_tokens,
    position_x, position_y
  )
  values (
    v_swarm_id,
    'Chief Coordinator',
    'coordinator',
    'You are the Chief of Staff coordinator. Orchestrate sub-agents to deliver '
    || 'a concise daily digest covering inbox, calendar, and pending decisions.',
    'anthropic',
    'claude-opus-4-7',
    0.30,
    4096,
    0,
    0
  )
  on conflict on constraint swarm_agents_swarm_name_unique do nothing
  returning id into v_agent_id;

  if v_agent_id is null then
    select id into v_agent_id
    from public.swarm_agents
    where swarm_id = v_swarm_id
      and name = 'Chief Coordinator'
    limit 1;
  end if;

  -- 3. Insert task
  insert into public.swarm_tasks (
    swarm_id, agent_id, name, description, expected_output,
    position_x, position_y
  )
  values (
    v_swarm_id,
    v_agent_id,
    'Daily Digest',
    'Aggregate the last 24h of Gmail, Slack, Telegram and calendar events. '
    || 'Highlight top 3 priorities, surface conflicts, and propose 1 action.',
    'A markdown digest (<= 400 words) with sections: Priorities, Conflicts, '
    || 'Suggested Action, Inbox highlights.',
    240,
    0
  )
  on conflict on constraint swarm_tasks_swarm_name_unique do nothing;
end$$;
