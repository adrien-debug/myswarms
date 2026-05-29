-- HEDGE — strategy_specs
-- Fusion output of the Strategy Builder. HMAC-signed for Risk Engine ingestion.

create table if not exists public.hedge_strategy_specs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  request_id uuid not null,
  spec jsonb not null,                -- StrategySpec JSON (Pydantic-validated)
  spec_hash text not null,            -- sha256 of canonical spec
  signature text not null,            -- HMAC-SHA256 with STRATEGY_SIGNING_KEY
  signing_key_id text not null default 'v1',
  swarm_signals_ref uuid[] not null,  -- ids in hedge_swarm_signals
  confidence numeric(5,4) not null
    check (confidence >= 0 and confidence <= 1),
  model text not null,                -- LLM model used (e.g. 'kimi-k2.6')
  langfuse_trace_id text,
  status text not null default 'built'
    check (status in ('built','spec_invalid')),
  validation_error text,
  created_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null,
  foreign key (tenant_id, request_id)
    references public.hedge_strategy_requests (tenant_id, request_id),
  unique (tenant_id, request_id)      -- one spec per run
);

create index if not exists idx_hedge_strategy_specs_request
  on public.hedge_strategy_specs (tenant_id, request_id);

alter table public.hedge_strategy_specs enable row level security;

create policy "hedge_strategy_specs_select_own"
  on public.hedge_strategy_specs for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_strategy_specs_service_all"
  on public.hedge_strategy_specs for all
  to service_role
  using (true) with check (true);

create trigger trg_hedge_strategy_specs_no_update
  before update on public.hedge_strategy_specs
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_strategy_specs_no_delete
  before delete on public.hedge_strategy_specs
  for each row execute function hedge_block_mutation();
