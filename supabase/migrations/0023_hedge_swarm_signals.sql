-- HEDGE — swarm_signals
-- Immutable advisory outputs from the 4 swarm agents.

create table if not exists public.hedge_swarm_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  request_id uuid not null,
  agent text not null
    check (agent in ('technical','sentiment','macro','onchain')),
  status text not null
    check (status in ('ok','degraded','failed','timeout')),
  payload jsonb not null,             -- structured signal
  confidence numeric(5,4)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  payload_hash text not null,         -- sha256 of canonical payload
  signature text not null,            -- HMAC-SHA256 with SWARM_SIGNING_KEY
  latency_ms int,
  model text,                          -- LLM model used (Langfuse cross-ref)
  langfuse_trace_id text,
  created_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null,
  foreign key (tenant_id, request_id)
    references public.hedge_strategy_requests (tenant_id, request_id),
  unique (tenant_id, request_id, agent)  -- one row per agent per run
);

create index if not exists idx_hedge_swarm_signals_request
  on public.hedge_swarm_signals (tenant_id, request_id);

alter table public.hedge_swarm_signals enable row level security;

create policy "hedge_swarm_signals_select_own"
  on public.hedge_swarm_signals for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_swarm_signals_service_all"
  on public.hedge_swarm_signals for all
  to service_role
  using (true) with check (true);

create trigger trg_hedge_swarm_signals_no_update
  before update on public.hedge_swarm_signals
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_swarm_signals_no_delete
  before delete on public.hedge_swarm_signals
  for each row execute function hedge_block_mutation();
