-- HEDGE — market_snapshots
-- Versioned, immutable per-asset market context.
-- Risk Engine READS these. Risk Engine NEVER calls an exchange directly.

create table if not exists public.hedge_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  venue text not null check (venue in ('hyperliquid','binance','bybit')),
  symbol text not null,
  -- Snapshot payload. Required fields:
  --   { "mid_price": number,
  --     "best_bid": number, "best_ask": number,
  --     "spread_bps": number,         -- (ask-bid)/mid * 10000
  --     "atr_14": number,             -- 14-period ATR (absolute USD)
  --     "atr_pct": number,            -- ATR / mid_price
  --     "realized_vol_24h": number,   -- stdev of 1h log returns ×√24
  --     "log_returns": [..],          -- last N 1-bar log returns (N>=200)
  --     "funding_rate_8h": number,    -- venue funding, if applicable
  --     "open_interest_usd": number,
  --     "volume_24h_usd": number,
  --     "liquidity_top10_usd_bid": number,
  --     "liquidity_top10_usd_ask": number,
  --     "last_trade_ts": "...",
  --     "depth_imbalance": number     -- -1..1
  --   }
  payload jsonb not null,
  timeframe text not null check (timeframe in ('1m','5m','15m','1h','4h','1d')),
  taken_at timestamptz not null default now(),
  -- Source freshness: when the underlying tick was observed at the exchange.
  source_event_ts timestamptz not null,
  source text not null
    check (source in ('ws_ingest','rest_fallback','reconcile_job','manual_admin')),
  signature text not null,
  prev_hash text,
  row_hash text not null,
  created_at timestamptz not null default now()
);

-- Hot path: latest snapshot per (venue, symbol, timeframe).
create index if not exists idx_hedge_market_snapshots_lookup
  on public.hedge_market_snapshots (venue, symbol, timeframe, taken_at desc);

create index if not exists idx_hedge_market_snapshots_age
  on public.hedge_market_snapshots (taken_at desc);

-- Append-only.
create trigger trg_hedge_market_snapshots_no_update
  before update on public.hedge_market_snapshots
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_market_snapshots_no_delete
  before delete on public.hedge_market_snapshots
  for each row execute function hedge_block_mutation();

-- Market data is global (not tenant-scoped); RLS allows authenticated read,
-- writes via service_role only.
alter table public.hedge_market_snapshots enable row level security;

create policy "hedge_market_snapshots_read_authenticated"
  on public.hedge_market_snapshots for select
  to authenticated
  using (true);

create policy "hedge_market_snapshots_service_all"
  on public.hedge_market_snapshots for all
  to service_role
  using (true) with check (true);
