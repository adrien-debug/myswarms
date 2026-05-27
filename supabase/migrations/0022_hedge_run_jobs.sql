-- HEDGE — run_jobs
-- Plane router: drives workers via FOR UPDATE SKIP LOCKED.

create table if not exists public.hedge_run_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  request_id uuid not null,
  status text not null
    check (status in (
      'queued',
      'signals_ready',
      'spec_ready',
      'decided',          -- risk_decision written; if REJECT terminal here
      'executed',
      'done',
      'failed',
      'poisoned'
    )),
  plane text not null
    check (plane in ('swarm','builder','risk','exec','terminal')),
  attempts int not null default 0,
  last_error text,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, request_id)
    references public.hedge_strategy_requests (tenant_id, request_id),
  unique (tenant_id, request_id)
);

-- Worker poll index: hot path for SELECT ... FOR UPDATE SKIP LOCKED.
create index if not exists idx_hedge_run_jobs_poll
  on public.hedge_run_jobs (plane, status, updated_at)
  where status not in ('done','failed','poisoned');

create index if not exists idx_hedge_run_jobs_tenant
  on public.hedge_run_jobs (tenant_id, created_at desc);

-- Auto-bump updated_at on status transitions (allowed mutation).
create or replace function hedge_run_jobs_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_hedge_run_jobs_touch
  before update on public.hedge_run_jobs
  for each row execute function hedge_run_jobs_touch();

alter table public.hedge_run_jobs enable row level security;

create policy "hedge_run_jobs_select_own"
  on public.hedge_run_jobs for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_run_jobs_service_all"
  on public.hedge_run_jobs for all
  to service_role
  using (true) with check (true);
