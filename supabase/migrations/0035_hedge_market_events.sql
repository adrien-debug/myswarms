-- HEDGE — market_events
-- Discrete market-side events: WS disconnect, abnormal spread, liquidation cluster,
-- snapshot staleness. Read by ops and surfaced to alerts.

create table if not exists public.hedge_market_events (
  id uuid primary key default gen_random_uuid(),
  venue text not null,
  symbol text,
  kind text not null
    check (kind in (
      'ws_connected','ws_disconnected','ws_reconnect_failed',
      'snapshot_stale','spread_anomaly','liquidity_drop',
      'liquidation_burst','funding_spike','sequence_gap',
      'rest_fallback_engaged','rest_fallback_recovered'
    )),
  severity text not null check (severity in ('info','warn','error','critical')),
  payload jsonb not null default '{}'::jsonb,
  source_event_ts timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_hedge_market_events_recent
  on public.hedge_market_events (venue, symbol, created_at desc);

create index if not exists idx_hedge_market_events_severity
  on public.hedge_market_events (severity, created_at desc)
  where severity in ('error','critical');

alter table public.hedge_market_events enable row level security;

create policy "hedge_market_events_read_authenticated"
  on public.hedge_market_events for select
  to authenticated using (true);

create policy "hedge_market_events_service_all"
  on public.hedge_market_events for all
  to service_role using (true) with check (true);

-- Append-only (no triggers on this table — we tolerate operational deletes if
-- needed in extreme cases via service_role; keep TTL discipline at app level).
