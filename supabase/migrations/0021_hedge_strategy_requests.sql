-- HEDGE — strategy_requests
-- Entry point. Idempotent on (tenant_id, request_id) — prevents double-submit.

create table if not exists public.hedge_strategy_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  request_id uuid not null,
  intent_type text not null
    check (intent_type in ('market_query','strategy_intent','manual_trade')),
  raw_intent text not null check (length(raw_intent) between 1 and 2000),
  normalized jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null,
  unique (tenant_id, request_id)
);

create index if not exists idx_hedge_strategy_requests_tenant_created
  on public.hedge_strategy_requests (tenant_id, created_at desc);

alter table public.hedge_strategy_requests enable row level security;

-- Tenants can only see their own requests.
create policy "hedge_strategy_requests_select_own"
  on public.hedge_strategy_requests for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_strategy_requests_insert_own"
  on public.hedge_strategy_requests for insert
  to authenticated
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Service role full access (workers run as service_role).
create policy "hedge_strategy_requests_service_all"
  on public.hedge_strategy_requests for all
  to service_role
  using (true) with check (true);

-- Append-only: block update/delete for all roles except service_role,
-- and even service_role workers MUST NOT mutate after insert.
create or replace function hedge_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Table %.% is append-only (HEDGE audit chain).', TG_TABLE_SCHEMA, TG_TABLE_NAME;
end;
$$;

create trigger trg_hedge_strategy_requests_no_update
  before update on public.hedge_strategy_requests
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_strategy_requests_no_delete
  before delete on public.hedge_strategy_requests
  for each row execute function hedge_block_mutation();
