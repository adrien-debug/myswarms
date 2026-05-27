-- HEDGE — risk_decisions
-- THE single decision authority output. HMAC-signed for Execution Engine.

create table if not exists public.hedge_risk_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  request_id uuid not null,
  spec_id uuid not null references public.hedge_strategy_specs(id),
  portfolio_snapshot_id uuid not null
    references public.hedge_portfolio_snapshots(id),
  risk_profile_id uuid not null
    references public.hedge_tenant_risk_profiles(id),
  decision text not null check (decision in ('APPROVE','RESIZE','REJECT')),
  reason_codes text[] not null default '{}',
  rules_eval jsonb not null,
    -- e.g. {"cvar_99": 0.018, "cvar_99_limit": 0.020, "kelly_size": 0.12, ...}
  sized_orders jsonb not null,
    -- canonical orders[] (empty array if REJECT)
  decision_ttl_seconds int not null default 10
    check (decision_ttl_seconds between 1 and 60),
  expires_at timestamptz not null,
  signature text not null,            -- HMAC-SHA256 with RISK_DECISION_KEY
  signing_key_id text not null default 'v1',
  engine_version text not null,        -- semantic version of risk engine code
  computed_at timestamptz not null default now(),
  prev_hash text,
  row_hash text not null,
  foreign key (tenant_id, request_id)
    references public.hedge_strategy_requests (tenant_id, request_id),
  unique (tenant_id, request_id)      -- one decision per run
);

create index if not exists idx_hedge_risk_decisions_request
  on public.hedge_risk_decisions (tenant_id, request_id);

alter table public.hedge_risk_decisions enable row level security;

create policy "hedge_risk_decisions_select_own"
  on public.hedge_risk_decisions for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_risk_decisions_service_all"
  on public.hedge_risk_decisions for all
  to service_role
  using (true) with check (true);

create trigger trg_hedge_risk_decisions_no_update
  before update on public.hedge_risk_decisions
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_risk_decisions_no_delete
  before delete on public.hedge_risk_decisions
  for each row execute function hedge_block_mutation();
