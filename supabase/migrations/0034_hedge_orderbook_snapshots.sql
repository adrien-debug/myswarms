-- HEDGE — orderbook_snapshots
-- L2 orderbook depth, used by Risk Engine to estimate slippage and reject
-- on insufficient liquidity.

create table if not exists public.hedge_orderbook_snapshots (
  id uuid primary key default gen_random_uuid(),
  venue text not null check (venue in ('hyperliquid','binance','bybit')),
  symbol text not null,
  -- Compact L2 payload:
  --   { "bids": [[price, size_usd], ...],   -- top 20
  --     "asks": [[price, size_usd], ...],
  --     "depth_bid_top10_usd": number,
  --     "depth_ask_top10_usd": number,
  --     "mid": number,
  --     "spread_bps": number,
  --     "imbalance": number,
  --     "seq": int                            -- venue sequence number
  --   }
  payload jsonb not null,
  source_event_ts timestamptz not null,
  taken_at timestamptz not null default now(),
  signature text not null,
  prev_hash text,
  row_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hedge_orderbook_snapshots_lookup
  on public.hedge_orderbook_snapshots (venue, symbol, taken_at desc);

create trigger trg_hedge_orderbook_snapshots_no_update
  before update on public.hedge_orderbook_snapshots
  for each row execute function hedge_block_mutation();

create trigger trg_hedge_orderbook_snapshots_no_delete
  before delete on public.hedge_orderbook_snapshots
  for each row execute function hedge_block_mutation();

alter table public.hedge_orderbook_snapshots enable row level security;

create policy "hedge_orderbook_snapshots_read_authenticated"
  on public.hedge_orderbook_snapshots for select
  to authenticated
  using (true);

create policy "hedge_orderbook_snapshots_service_all"
  on public.hedge_orderbook_snapshots for all
  to service_role
  using (true) with check (true);
