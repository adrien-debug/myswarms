-- 0004_chief_run_log.sql
-- Standalone run log for Chief of Staff scheduled and on-demand runs.
-- No FK to auth.users — service-role only, bypasses RLS.
-- Simpler than crew_runs FK chain (crew_id → crews → owner_id → auth.users).

create table if not exists public.chief_run_log (
  id            uuid        primary key default gen_random_uuid(),
  kickoff_id    text        not null unique,
  trigger       text        not null,
  status        text        not null
                            check (status in ('running','completed','failed','cancelled','paused_hitl')),
  result        text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  error_text    text,
  langfuse_trace_id text,
  state_json    jsonb,
  total_tokens_in   int  not null default 0,
  total_tokens_out  int  not null default 0
);

create index if not exists chief_run_log_started_at_idx
  on public.chief_run_log (started_at desc);

create index if not exists chief_run_log_status_idx
  on public.chief_run_log (status);

-- Note: No RLS. This table is internal (service role only).
-- Never exposed directly to browser clients.
