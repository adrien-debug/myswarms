-- HEDGE — execution_alerts
-- Operational alerts emitted by execution-engine and reconcile worker.
-- Separate from audit_log because these are time-sensitive ops events
-- (paging surface).

create table if not exists public.hedge_execution_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,                          -- null = system-wide
  venue text,
  symbol text,
  kind text not null
    check (kind in (
      'reconcile_mismatch',
      'reconcile_unreachable',
      'partial_fill_unexpected',
      'venue_rejected_storm',
      'retry_storm',
      'outbox_saturated',
      'decision_ttl_expired',
      'signature_invalid',
      'dead_man_triggered',
      'websocket_lost',
      'heartbeat_missed',
      'kill_switch_auto_armed'
    )),
  severity text not null check (severity in ('warn','error','critical')),
  payload jsonb not null default '{}'::jsonb,
  request_id uuid,
  outbox_id uuid,
  decision_id uuid,
  acknowledged_at timestamptz,             -- ops can ack (still append-only;
  acknowledged_by uuid,                    -- ack is a NEW row via service)
  created_at timestamptz not null default now()
);

create index if not exists idx_hedge_exec_alerts_recent
  on public.hedge_execution_alerts (severity, created_at desc)
  where acknowledged_at is null;

create index if not exists idx_hedge_exec_alerts_tenant
  on public.hedge_execution_alerts (tenant_id, created_at desc);

alter table public.hedge_execution_alerts enable row level security;

create policy "hedge_exec_alerts_select_own"
  on public.hedge_execution_alerts for select
  to authenticated
  using (tenant_id is null or tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_exec_alerts_service_all"
  on public.hedge_execution_alerts for all
  to service_role using (true) with check (true);

-- We allow service_role UPDATE (for ack) but not DELETE.
create trigger trg_hedge_exec_alerts_no_delete
  before delete on public.hedge_execution_alerts
  for each row execute function hedge_block_mutation();
