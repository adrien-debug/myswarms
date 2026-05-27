-- HEDGE — tenant_risk_profiles
-- Per-tenant risk configuration. Versioned: each change = new row.

create table if not exists public.hedge_tenant_risk_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  version int not null,                          -- monotonically increasing
  -- Risk limits:
  cvar_99_max_pct numeric(6,4) not null          -- max acceptable CVaR99 on position
    check (cvar_99_max_pct > 0 and cvar_99_max_pct <= 1),
  kelly_cap numeric(5,4) not null default 0.25
    check (kelly_cap > 0 and kelly_cap <= 1),
  max_leverage numeric(5,2) not null default 3
    check (max_leverage >= 1 and max_leverage <= 50),
  max_drawdown_pct numeric(5,4) not null default 0.20
    check (max_drawdown_pct > 0 and max_drawdown_pct <= 1),
  atr_vol_target_pct numeric(6,4) not null default 0.02
    check (atr_vol_target_pct > 0),
  per_asset_notional_cap_usd numeric(18,2) not null default 10000
    check (per_asset_notional_cap_usd > 0),
  daily_loss_limit_usd numeric(18,2) not null default 1000
    check (daily_loss_limit_usd > 0),
  allowed_venues text[] not null default array['hyperliquid'],
  allowed_assets text[] not null default array['BTC','ETH'],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  prev_hash text,
  row_hash text not null,
  unique (tenant_id, version)
);

-- Latest active profile per tenant (hot path for Risk Engine).
create index if not exists idx_hedge_tenant_risk_profiles_active
  on public.hedge_tenant_risk_profiles (tenant_id, version desc)
  where active = true;

alter table public.hedge_tenant_risk_profiles enable row level security;

create policy "hedge_tenant_risk_profiles_select_own"
  on public.hedge_tenant_risk_profiles for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_tenant_risk_profiles_service_all"
  on public.hedge_tenant_risk_profiles for all
  to service_role
  using (true) with check (true);

create trigger trg_hedge_tenant_risk_profiles_no_update
  before update on public.hedge_tenant_risk_profiles
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_tenant_risk_profiles_no_delete
  before delete on public.hedge_tenant_risk_profiles
  for each row execute function hedge_block_mutation();
