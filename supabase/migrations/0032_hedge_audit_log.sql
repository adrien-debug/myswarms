-- HEDGE — audit_log
-- High-signal admin/security events: kill switch toggles, signature failures,
-- cross-tenant attempts, manual portfolio overrides, etc.

create table if not exists public.hedge_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,                      -- null for global events
  actor_id uuid,                       -- user_id or service marker
  actor_kind text not null
    check (actor_kind in ('user','service','system')),
  event_type text not null,            -- e.g. 'kill_switch.set', 'signature.invalid'
  severity text not null
    check (severity in ('info','warn','error','critical')),
  details jsonb not null default '{}'::jsonb,
  request_id uuid,                     -- correlation if applicable
  source_service text,                 -- e.g. 'risk-engine'
  ip_address inet,
  created_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null
);

create index if not exists idx_hedge_audit_log_tenant_created
  on public.hedge_audit_log (tenant_id, created_at desc);

create index if not exists idx_hedge_audit_log_severity
  on public.hedge_audit_log (severity, created_at desc)
  where severity in ('error','critical');

alter table public.hedge_audit_log enable row level security;

create policy "hedge_audit_log_select_own"
  on public.hedge_audit_log for select
  to authenticated
  using (tenant_id is null or tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_audit_log_service_all"
  on public.hedge_audit_log for all
  to service_role
  using (true) with check (true);

create trigger trg_hedge_audit_log_no_update
  before update on public.hedge_audit_log
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_audit_log_no_delete
  before delete on public.hedge_audit_log
  for each row execute function hedge_block_mutation();
