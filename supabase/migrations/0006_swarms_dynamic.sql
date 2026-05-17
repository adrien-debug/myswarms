-- 0006_swarms_dynamic.sql
--
-- TODO V2 perf : replace auth.uid() with (select auth.uid()) for init-plan
-- optimization sur toutes les policies RLS de ce fichier (cf G5 Stage 4 pass
-- 3). Postgres exécute `auth.uid()` PER row sans la sous-requête — pour
-- des swarms avec beaucoup d'agents/tasks/runs/steps (>1000), le plan
-- "InitPlan" cache un seul appel et accélère significativement la lecture.
-- Migration à créer en V2 (cosmétique pour l'instant, perf invisible
-- jusqu'à ~500 rows par owner).
--
-- Data model du Swarm Builder visuel MySwarms.
-- Persiste les swarms (= crews CrewAI dynamiques) configurés via l'UI :
--   swarms, swarm_agents (composition récursive via parent_agent_id),
--   swarm_tasks (dépendances via depends_on_task_id), tools, swarm_tool_bindings,
--   swarm_runs et swarm_run_steps.
-- Réutilise les enums existants `crew_run_status` et `crew_trigger` (migration 0002).
-- RLS activée sur toutes les tables, policies via auth.uid() = owner_id (ou EXISTS chain).

-- =====================================================================
-- 1. Enums nouveaux (les enums crew_run_status / crew_trigger sont réutilisés)
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agent_role') then
    create type public.agent_role as enum (
      'coordinator', 'analyst', 'executor', 'reviewer', 'tool_runner'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'tool_category') then
    create type public.tool_category as enum (
      'api_call', 'file_io', 'code_execution', 'search', 'database', 'custom'
    );
  end if;
end$$;

-- =====================================================================
-- 2. Tables
-- =====================================================================

-- swarms : un swarm = un crew CrewAI configurable
create table if not exists public.swarms (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  version      int  not null default 1,
  config_json  jsonb not null default '{}'::jsonb,
  is_active    boolean not null default true,
  is_template  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint swarms_owner_name_unique unique (owner_id, name)
);

-- swarm_agents : composition récursive (parent_agent_id => méta-agent)
create table if not exists public.swarm_agents (
  id               uuid primary key default gen_random_uuid(),
  swarm_id         uuid not null references public.swarms(id) on delete cascade,
  name             text not null,
  role             public.agent_role not null,
  system_prompt    text,
  model_provider   text,
  model_name       text,
  temperature      numeric(3,2),
  max_tokens       int,
  parent_agent_id  uuid references public.swarm_agents(id) on delete set null,
  position_x       int not null default 0,
  position_y       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint swarm_agents_swarm_name_unique unique (swarm_id, name)
);

-- swarm_tasks : tâche assignée à un agent, peut dépendre d'une autre tâche
create table if not exists public.swarm_tasks (
  id                  uuid primary key default gen_random_uuid(),
  swarm_id            uuid not null references public.swarms(id) on delete cascade,
  agent_id            uuid not null references public.swarm_agents(id) on delete cascade,
  name                text not null,
  description         text,
  expected_output     text,
  depends_on_task_id  uuid references public.swarm_tasks(id) on delete set null,
  position_x          int not null default 0,
  position_y          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint swarm_tasks_swarm_name_unique unique (swarm_id, name)
);

-- tools : tools réutilisables (Composio, custom HTTP, code exec, etc.)
create table if not exists public.tools (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users(id) on delete cascade,
  name         text not null,
  category     public.tool_category not null,
  description  text,
  endpoint_url text,
  auth_type    text,
  schema_json  jsonb not null default '{}'::jsonb,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint tools_owner_name_unique unique (owner_id, name)
);

-- swarm_tool_bindings : assignation agent ↔ tool dans un swarm donné
create table if not exists public.swarm_tool_bindings (
  id           uuid primary key default gen_random_uuid(),
  swarm_id     uuid not null references public.swarms(id) on delete cascade,
  agent_id     uuid not null references public.swarm_agents(id) on delete cascade,
  tool_id      uuid not null references public.tools(id) on delete cascade,
  priority     int  not null default 0,
  config_json  jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint swarm_tool_bindings_unique unique (swarm_id, agent_id, tool_id)
);

-- swarm_runs : instance d'exécution d'un swarm
create table if not exists public.swarm_runs (
  id                uuid primary key default gen_random_uuid(),
  swarm_id          uuid not null references public.swarms(id) on delete cascade,
  trigger           public.crew_trigger not null,
  status            public.crew_run_status not null default 'pending',
  inputs_json       jsonb not null default '{}'::jsonb,
  result_text       text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  error_text        text,
  total_tokens_in   int not null default 0,
  total_tokens_out  int not null default 0,
  total_cost_usd    numeric(10,4) not null default 0,
  langfuse_trace_id text,
  created_at        timestamptz not null default now()
);

-- swarm_run_steps : steps individuels d'un run
create table if not exists public.swarm_run_steps (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.swarm_runs(id) on delete cascade,
  agent_id         uuid not null references public.swarm_agents(id) on delete cascade,
  task_id          uuid references public.swarm_tasks(id) on delete set null,
  step_number      int not null,
  input_text       text,
  output_text      text,
  tokens_in        int not null default 0,
  tokens_out       int not null default 0,
  cost_usd         numeric(10,4) not null default 0,
  latency_ms       int,
  status           text,
  error_text       text,
  langfuse_span_id text,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);

-- =====================================================================
-- 3. Indexes
-- =====================================================================

create index if not exists swarms_owner_id_idx          on public.swarms(owner_id);
create index if not exists swarms_is_template_idx       on public.swarms(is_template);

create index if not exists swarm_agents_swarm_id_idx    on public.swarm_agents(swarm_id);
create index if not exists swarm_agents_parent_id_idx   on public.swarm_agents(parent_agent_id);

create index if not exists swarm_tasks_swarm_id_idx     on public.swarm_tasks(swarm_id);
create index if not exists swarm_tasks_agent_id_idx     on public.swarm_tasks(agent_id);
create index if not exists swarm_tasks_depends_on_idx   on public.swarm_tasks(depends_on_task_id);

create index if not exists tools_owner_id_idx           on public.tools(owner_id);
create index if not exists tools_category_idx           on public.tools(category);

create index if not exists swarm_tool_bindings_swarm_idx on public.swarm_tool_bindings(swarm_id);
create index if not exists swarm_tool_bindings_agent_idx on public.swarm_tool_bindings(agent_id);
create index if not exists swarm_tool_bindings_tool_idx  on public.swarm_tool_bindings(tool_id);

create index if not exists swarm_runs_swarm_id_idx      on public.swarm_runs(swarm_id);
create index if not exists swarm_runs_status_idx        on public.swarm_runs(status);
create index if not exists swarm_runs_started_at_idx    on public.swarm_runs(started_at desc);

create index if not exists swarm_run_steps_run_id_idx        on public.swarm_run_steps(run_id);
create index if not exists swarm_run_steps_run_step_num_idx  on public.swarm_run_steps(run_id, step_number);
create index if not exists swarm_run_steps_agent_id_idx      on public.swarm_run_steps(agent_id);

-- =====================================================================
-- 4. RLS — activation
-- =====================================================================

alter table public.swarms              enable row level security;
alter table public.swarm_agents        enable row level security;
alter table public.swarm_tasks         enable row level security;
alter table public.tools               enable row level security;
alter table public.swarm_tool_bindings enable row level security;
alter table public.swarm_runs          enable row level security;
alter table public.swarm_run_steps     enable row level security;

-- =====================================================================
-- 5. RLS — policies (drop si existantes, puis create)
-- =====================================================================

drop policy if exists "swarms_owner_all"              on public.swarms;
drop policy if exists "swarms_templates_readable"     on public.swarms;
drop policy if exists "swarm_agents_owner_all"        on public.swarm_agents;
drop policy if exists "swarm_tasks_owner_all"         on public.swarm_tasks;
drop policy if exists "tools_owner_all"               on public.tools;
drop policy if exists "swarm_tool_bindings_owner_all" on public.swarm_tool_bindings;
drop policy if exists "swarm_runs_owner_all"          on public.swarm_runs;
drop policy if exists "swarm_run_steps_owner_all"     on public.swarm_run_steps;

-- swarms : owner only (RW). Les templates (is_template=true, owner_id null) sont
-- lisibles par tout utilisateur authentifié pour permettre le "fork" en UI.
create policy "swarms_owner_all"
  on public.swarms
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "swarms_templates_readable"
  on public.swarms
  for select
  using (is_template = true and owner_id is null);

-- swarm_agents : via EXISTS chain sur swarms.owner_id
create policy "swarm_agents_owner_all"
  on public.swarm_agents
  for all
  using (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_agents.swarm_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_agents.swarm_id and s.owner_id = auth.uid()
    )
  );

-- swarm_tasks : via EXISTS chain sur swarms.owner_id
create policy "swarm_tasks_owner_all"
  on public.swarm_tasks
  for all
  using (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_tasks.swarm_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_tasks.swarm_id and s.owner_id = auth.uid()
    )
  );

-- tools : owner only
create policy "tools_owner_all"
  on public.tools
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- swarm_tool_bindings : via EXISTS chain sur swarms.owner_id
create policy "swarm_tool_bindings_owner_all"
  on public.swarm_tool_bindings
  for all
  using (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_tool_bindings.swarm_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_tool_bindings.swarm_id and s.owner_id = auth.uid()
    )
  );

-- swarm_runs : via EXISTS chain sur swarms.owner_id
create policy "swarm_runs_owner_all"
  on public.swarm_runs
  for all
  using (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_runs.swarm_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.swarms s
      where s.id = swarm_runs.swarm_id and s.owner_id = auth.uid()
    )
  );

-- swarm_run_steps : via EXISTS chain run -> swarm -> owner
create policy "swarm_run_steps_owner_all"
  on public.swarm_run_steps
  for all
  using (
    exists (
      select 1 from public.swarm_runs r
      join public.swarms s on s.id = r.swarm_id
      where r.id = swarm_run_steps.run_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.swarm_runs r
      join public.swarms s on s.id = r.swarm_id
      where r.id = swarm_run_steps.run_id and s.owner_id = auth.uid()
    )
  );

-- =====================================================================
-- 6. Triggers updated_at (réutilise la fonction public.set_updated_at déjà
--    définie dans 0002 + 0003 — pas redéfinie ici).
-- =====================================================================

drop trigger if exists swarms_set_updated_at        on public.swarms;
drop trigger if exists swarm_agents_set_updated_at  on public.swarm_agents;
drop trigger if exists swarm_tasks_set_updated_at   on public.swarm_tasks;
drop trigger if exists tools_set_updated_at         on public.tools;

create trigger swarms_set_updated_at
  before update on public.swarms
  for each row execute function public.set_updated_at();

create trigger swarm_agents_set_updated_at
  before update on public.swarm_agents
  for each row execute function public.set_updated_at();

create trigger swarm_tasks_set_updated_at
  before update on public.swarm_tasks
  for each row execute function public.set_updated_at();

create trigger tools_set_updated_at
  before update on public.tools
  for each row execute function public.set_updated_at();
