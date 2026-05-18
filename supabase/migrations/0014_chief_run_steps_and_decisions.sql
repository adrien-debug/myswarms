-- Migration 0014: chief_run_steps + chief_decisions
--
-- ARCHI V1: chief_run_id est un TEXT (= kickoff_id uuid stringifié de chief_run_log).
-- On N'utilise PAS de FK uuid vers chief_run_log.id car les stores Python
-- (chief_step_store.py, chief_decision_store.py) écrivent kickoff_id en tant que text.
-- Dette V2: résoudre via get_run_id_by_kickoff() dans run_store + migrer vers FK uuid.

-- chief_run_steps: 1 row par task complétée par le crew
create table if not exists public.chief_run_steps (
  id               uuid primary key default gen_random_uuid(),
  chief_run_id     text not null,
  step_index       int not null,
  agent_name       text not null,
  task_name        text,
  output_text      text,
  tokens_in        int not null default 0,
  tokens_out       int not null default 0,
  cost_usd         numeric(10,4) not null default 0,
  latency_ms       int,
  langfuse_span_id text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists chief_run_steps_run_id_idx   on public.chief_run_steps(chief_run_id);
create index if not exists chief_run_steps_run_step_idx on public.chief_run_steps(chief_run_id, step_index);

-- Enum des actions décision utilisateur
do $$
begin
  if not exists (select 1 from pg_type where typname = 'chief_decision_action') then
    create type public.chief_decision_action as enum ('sent', 'snoozed', 'rejected');
  end if;
end$$;

-- chief_decisions: 1 row par action utilisateur sur un P0
create table if not exists public.chief_decisions (
  id             uuid primary key default gen_random_uuid(),
  chief_run_id   text not null,
  action         public.chief_decision_action not null,
  snooze_until   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists chief_decisions_run_id_idx     on public.chief_decisions(chief_run_id);
create index if not exists chief_decisions_created_at_idx on public.chief_decisions(created_at desc);

-- RLS activée (single-user V1 — service_role seul)
alter table public.chief_run_steps  enable row level security;
alter table public.chief_decisions  enable row level security;

-- Policies service_role via DO block (compatibilité PG < 15)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'chief_run_steps' and policyname = 'service_role full access steps'
  ) then
    execute $p$
      create policy "service_role full access steps"
        on public.chief_run_steps for all
        to service_role using (true) with check (true)
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'chief_decisions' and policyname = 'service_role full access decisions'
  ) then
    execute $p$
      create policy "service_role full access decisions"
        on public.chief_decisions for all
        to service_role using (true) with check (true)
    $p$;
  end if;
end$$;
