-- HEDGE — run_events
-- Realtime event stream consumed by Cockpit via Supabase Realtime.

create table if not exists public.hedge_run_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  request_id uuid not null,
  kind text not null
    check (kind in (
      'queued',
      'signals_started',
      'signals_ready',
      'spec_started',
      'spec_ready',
      'spec_invalid',
      'risk_started',
      'risk_decided',
      'exec_started',
      'exec_report',
      'done',
      'failed',
      'kill_switch_triggered'
    )),
  payload jsonb not null default '{}'::jsonb,
  produced_by text not null,           -- service name (e.g. 'risk-engine')
  created_at timestamptz not null default now(),
  foreign key (tenant_id, request_id)
    references public.hedge_strategy_requests (tenant_id, request_id)
);

create index if not exists idx_hedge_run_events_request
  on public.hedge_run_events (tenant_id, request_id, created_at);

alter table public.hedge_run_events enable row level security;

create policy "hedge_run_events_select_own"
  on public.hedge_run_events for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_run_events_service_all"
  on public.hedge_run_events for all
  to service_role
  using (true) with check (true);

-- Enable Supabase Realtime publication on this table.
-- (Run separately via dashboard if `supabase_realtime` publication is locked.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Add table if not already in the publication.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'hedge_run_events'
    ) then
      alter publication supabase_realtime add table public.hedge_run_events;
    end if;
  end if;
end $$;

create trigger trg_hedge_run_events_no_update
  before update on public.hedge_run_events
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_run_events_no_delete
  before delete on public.hedge_run_events
  for each row execute function hedge_block_mutation();
