-- HEDGE — position_reconciliations
-- Reconcile worker writes one row per (tenant_id, venue) per cycle.
-- Status='mismatch' triggers an automatic kill_switch via execution-engine.

create table if not exists public.hedge_position_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  venue text not null,
  -- Snapshot of venue-side state vs DB-side state at this cycle:
  --   { "venue_positions": [{"symbol":..., "size":..., "entry":..., "side":...}, ...],
  --     "db_positions":    [...],
  --     "diffs":           [...] }
  venue_positions jsonb not null,
  db_positions jsonb not null,
  diffs jsonb not null default '[]'::jsonb,
  status text not null check (status in ('match','mismatch','partial','venue_unavailable')),
  diff_count int not null default 0,
  worst_diff_usd numeric(18,4) not null default 0,
  -- If status='mismatch': auto-actions taken (kill switches, alerts).
  remediation jsonb not null default '{}'::jsonb,
  cycle_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hedge_reconcile_tenant_recent
  on public.hedge_position_reconciliations (tenant_id, cycle_at desc);

create index if not exists idx_hedge_reconcile_mismatch
  on public.hedge_position_reconciliations (status, cycle_at desc)
  where status = 'mismatch';

create trigger trg_hedge_reconcile_no_update
  before update on public.hedge_position_reconciliations
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_reconcile_no_delete
  before delete on public.hedge_position_reconciliations
  for each row execute function hedge_block_mutation();

alter table public.hedge_position_reconciliations enable row level security;

create policy "hedge_reconcile_select_own"
  on public.hedge_position_reconciliations for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_reconcile_service_all"
  on public.hedge_position_reconciliations for all
  to service_role using (true) with check (true);
