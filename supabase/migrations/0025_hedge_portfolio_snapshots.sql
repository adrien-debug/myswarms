-- HEDGE — portfolio_snapshots
-- Versioned, immutable snapshots. Risk Engine REQUIRES fresh snapshot (< 5s).

create table if not exists public.hedge_portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  -- Snapshot content. Shape:
  --   {
  --     "equity_usd": number,
  --     "available_margin_usd": number,
  --     "positions": [{"venue": ..., "symbol": ..., "size": ..., "entry": ..., "side": ...}],
  --     "open_orders": [...],
  --     "max_drawdown_pct_30d": number,
  --     "realized_pnl_usd_24h": number
  --   }
  payload jsonb not null,
  source text not null
    check (source in ('execution_engine','reconcile_job','manual_admin')),
  taken_at timestamptz not null default now(),
  signature text not null,            -- HMAC, signed by Execution Engine
  prev_hash text,
  row_hash text not null,
  created_at timestamptz not null default now()
);

-- Hot path: Risk Engine fetches latest snapshot per tenant.
create index if not exists idx_hedge_portfolio_snapshots_tenant_latest
  on public.hedge_portfolio_snapshots (tenant_id, taken_at desc);

alter table public.hedge_portfolio_snapshots enable row level security;

create policy "hedge_portfolio_snapshots_select_own"
  on public.hedge_portfolio_snapshots for select
  to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "hedge_portfolio_snapshots_service_all"
  on public.hedge_portfolio_snapshots for all
  to service_role
  using (true) with check (true);

create trigger trg_hedge_portfolio_snapshots_no_update
  before update on public.hedge_portfolio_snapshots
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_portfolio_snapshots_no_delete
  before delete on public.hedge_portfolio_snapshots
  for each row execute function hedge_block_mutation();
