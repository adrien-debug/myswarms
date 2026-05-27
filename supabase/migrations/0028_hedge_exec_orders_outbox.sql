-- HEDGE — exec_orders_outbox
-- Transactional outbox. Risk INSERTs here, Execution polls + dispatches.

create table if not exists public.hedge_exec_orders_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  request_id uuid not null,
  decision_id uuid not null references public.hedge_risk_decisions(id),
  leg_index int not null check (leg_index >= 0),
  -- Canonical order payload. Shape (deterministic, from risk_decisions.sized_orders[i]):
  --   {
  --     "venue": "hyperliquid",
  --     "symbol": "BTC-USD",
  --     "side": "buy"|"sell",
  --     "type": "market"|"limit"|"stop",
  --     "size": number,            -- in base asset
  --     "limit_price": number|null,
  --     "stop_price": number|null,
  --     "time_in_force": "IOC"|"GTC"|"FOK",
  --     "reduce_only": bool,
  --     "client_order_id": "hex32"  -- sha256(request_id || leg_index)[:32]
  --   }
  order_payload jsonb not null,
  client_order_id text not null,
  status text not null default 'pending'
    check (status in ('pending','locked','sent','failed','dlq','expired')),
  attempts int not null default 0,
  last_error text,
  locked_by text,
  locked_at timestamptz,
  ttl_at timestamptz not null,        -- past = expired, Execution must skip
  signature text not null,            -- HMAC of the row (anti-tampering)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null,
  foreign key (tenant_id, request_id)
    references public.hedge_strategy_requests (tenant_id, request_id),
  unique (tenant_id, request_id, leg_index),
  unique (client_order_id)            -- venue-side idempotency anchor
);

-- Worker poll: hot path.
create index if not exists idx_hedge_exec_outbox_poll
  on public.hedge_exec_orders_outbox (status, ttl_at)
  where status in ('pending','locked');

create index if not exists idx_hedge_exec_outbox_tenant
  on public.hedge_exec_orders_outbox (tenant_id, created_at desc);

-- Bump updated_at on status transitions.
create or replace function hedge_exec_outbox_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_hedge_exec_outbox_touch
  before update on public.hedge_exec_orders_outbox
  for each row execute function hedge_exec_outbox_touch();

alter table public.hedge_exec_orders_outbox enable row level security;

create policy "hedge_exec_outbox_select_own"
  on public.hedge_exec_orders_outbox for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_exec_outbox_service_all"
  on public.hedge_exec_orders_outbox for all
  to service_role
  using (true) with check (true);
