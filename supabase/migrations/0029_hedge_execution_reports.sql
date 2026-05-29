-- HEDGE — execution_reports
-- Immutable receipt of every venue submission attempt.

create table if not exists public.hedge_execution_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  request_id uuid not null,
  outbox_id uuid not null references public.hedge_exec_orders_outbox(id),
  decision_id uuid not null references public.hedge_risk_decisions(id),
  venue text not null,
  symbol text not null,
  client_order_id text not null,
  venue_order_id text,
  status text not null
    check (status in (
      'submitted','filled','partially_filled','rejected',
      'cancelled','error','dry_run','expired'
    )),
  side text check (side in ('buy','sell')),
  requested_size numeric(28,12),
  filled_size numeric(28,12),
  avg_fill_price numeric(28,12),
  fees_usd numeric(18,6),
  venue_response jsonb,
  error_code text,
  error_message text,
  latency_ms int,
  dry_run boolean not null default false,
  submitted_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null,
  foreign key (tenant_id, request_id)
    references public.hedge_strategy_requests (tenant_id, request_id)
);

create index if not exists idx_hedge_execution_reports_request
  on public.hedge_execution_reports (tenant_id, request_id);

create index if not exists idx_hedge_execution_reports_outbox
  on public.hedge_execution_reports (outbox_id);

alter table public.hedge_execution_reports enable row level security;

create policy "hedge_execution_reports_select_own"
  on public.hedge_execution_reports for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_execution_reports_service_all"
  on public.hedge_execution_reports for all
  to service_role
  using (true) with check (true);

create trigger trg_hedge_execution_reports_no_update
  before update on public.hedge_execution_reports
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_execution_reports_no_delete
  before delete on public.hedge_execution_reports
  for each row execute function hedge_block_mutation();
