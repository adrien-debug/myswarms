-- 0002_crewai.sql — Daily Chief of Staff AI : crews, runs, steps, flow states
-- Migration générée pour myswarms via /squad-adrien

-- Types enum
create type public.crew_run_status as enum (
  'pending', 'running', 'paused_hitl', 'completed', 'failed', 'cancelled'
);

create type public.crew_trigger as enum (
  'morning', 'evening', 'intraday', 'on_demand', 'webhook'
);

-- Crews configurées
create table if not exists public.crews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  spec_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Runs (instances d'exécution)
create table if not exists public.crew_runs (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  trigger public.crew_trigger not null,
  status public.crew_run_status not null default 'pending',
  inputs_json jsonb not null default '{}'::jsonb,
  result_text text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_text text,
  langfuse_trace_id text,
  total_tokens_in int not null default 0,
  total_tokens_out int not null default 0,
  total_cost_usd numeric(10,4) not null default 0
);

create index if not exists crew_runs_crew_id_idx on public.crew_runs(crew_id);
create index if not exists crew_runs_status_idx on public.crew_runs(status);
create index if not exists crew_runs_started_at_idx on public.crew_runs(started_at desc);

-- Steps individuels par agent/task
create table if not exists public.crew_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.crew_runs(id) on delete cascade,
  step_index int not null,
  agent_name text not null,
  task_name text,
  role text,
  input_text text,
  output_text text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  latency_ms int,
  langfuse_span_id text,
  created_at timestamptz not null default now()
);

create index if not exists crew_run_steps_run_id_idx on public.crew_run_steps(run_id);
create index if not exists crew_run_steps_run_step_idx on public.crew_run_steps(run_id, step_index);

-- Snapshots Pydantic state pour @persist Flows CrewAI
create table if not exists public.flow_states (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.crew_runs(id) on delete cascade,
  checkpoint text not null,
  state_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists flow_states_run_id_idx on public.flow_states(run_id);

-- RLS
alter table public.crews            enable row level security;
alter table public.crew_runs        enable row level security;
alter table public.crew_run_steps   enable row level security;
alter table public.flow_states      enable row level security;

-- Drop policies idempotent (si rerun)
drop policy if exists "crews_owner_all"     on public.crews;
drop policy if exists "crew_runs_owner_all" on public.crew_runs;
drop policy if exists "crew_run_steps_owner_all" on public.crew_run_steps;
drop policy if exists "flow_states_owner_all"   on public.flow_states;

-- Policies "own data"
create policy "crews_owner_all"
  on public.crews
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "crew_runs_owner_all"
  on public.crew_runs
  for all
  using (
    exists (
      select 1 from public.crews c
      where c.id = crew_runs.crew_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.crews c
      where c.id = crew_runs.crew_id and c.owner_id = auth.uid()
    )
  );

create policy "crew_run_steps_owner_all"
  on public.crew_run_steps
  for all
  using (
    exists (
      select 1 from public.crew_runs r
      join public.crews c on c.id = r.crew_id
      where r.id = crew_run_steps.run_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.crew_runs r
      join public.crews c on c.id = r.crew_id
      where r.id = crew_run_steps.run_id and c.owner_id = auth.uid()
    )
  );

create policy "flow_states_owner_all"
  on public.flow_states
  for all
  using (
    exists (
      select 1 from public.crew_runs r
      join public.crews c on c.id = r.crew_id
      where r.id = flow_states.run_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.crew_runs r
      join public.crews c on c.id = r.crew_id
      where r.id = flow_states.run_id and c.owner_id = auth.uid()
    )
  );

-- Trigger pour updated_at sur crews
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crews_set_updated_at on public.crews;
create trigger crews_set_updated_at
  before update on public.crews
  for each row execute function public.set_updated_at();
