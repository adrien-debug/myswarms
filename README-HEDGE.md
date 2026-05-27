# HEDGE — Edge Architecture v2

> Multi-agent trading system. **No trade by default.** Single decision authority. Append-only audit. Multi-tenant.

---

## TL;DR

```
Cockpit (UI)
   │ POST /api/hedge/runs
   ▼
HEDGE Core (Next.js)  ──► DB (Supabase Postgres)
                          │
                          ├─ hedge_strategy_requests   ← idempotent (tenant_id, request_id)
                          └─ hedge_run_jobs (queued)   ← DB-as-queue
                                  ▲
   ┌─────────────────────────────┼─────────────────────────────────┐
   │            FOR UPDATE SKIP LOCKED workers (Python)             │
   ▼                              ▼                                  ▼
swarm-orchestrator    strategy-builder           risk-engine          execution-engine
  4 LLM agents         LLM fusion (Kimi)        deterministic         dumb dispatcher
  → swarm_signals      → strategy_specs         → risk_decisions      → execution_reports
                                                  + exec_orders_outbox
```

**Hard rules** — see [§5 Boundaries](#5-hard-boundaries).

---

## 1. Architecture diagram

```
═══════════════════════════════════════════════════════════════════════════════
                       PRESENTATION PLANE (Vercel)
═══════════════════════════════════════════════════════════════════════════════
┌───────────────────────────────────────────────────────────────────────────┐
│ COCKPIT (Next.js /cockpit)                                                │
│  - Captures intent (form, chat)                                           │
│  - Subscribes Supabase Realtime: hedge_run_events filtered by request_id  │
│  - Renders state machine + signals + spec + risk + exec reports           │
└──────────────────────────┬────────────────────────────────────────────────┘
                           │ HTTPS + JWT(tenant_id)
                           ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ HEDGE CORE — Next.js API routes (/api/hedge/*)                            │
│  POST /api/hedge/runs              → INSERT request + job (idempotent)    │
│  GET  /api/hedge/runs/{runId}      → read-only snapshot                   │
│  POST /api/admin/kill-switch       → admin-only, audit-logged             │
│  RULE: no exchange calls, no LLM, no risk math. Just plumbing.            │
└──────────────────────────┬────────────────────────────────────────────────┘
                           │ INSERTs (DB is the bus)
                           ▼
═══════════════════════════════════════════════════════════════════════════════
                  DECISION PLANE (Python, Railway/Docker)
═══════════════════════════════════════════════════════════════════════════════
┌───────────────────────────────────────────────────────────────────────────┐
│ swarm-orchestrator :8000                                                  │
│  poll hedge_run_jobs(plane='swarm', status='queued') FOR UPDATE SKIP LOCKED│
│  → 4 agents (technical, sentiment, macro, onchain) en parallèle           │
│  → INSERT hedge_swarm_signals (HMAC-signed with SWARM_SIGNING_KEY)        │
│  → UPDATE job to status='signals_ready', plane='builder'                  │
└──────────────────────────┬────────────────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ strategy-builder :8003                                                    │
│  poll plane='builder', status='signals_ready'                             │
│  → LLM fusion (Kimi K2.6) → StrategySpec JSON                             │
│  → Pydantic validate; if invalid → status='spec_invalid' → run terminates │
│  → INSERT hedge_strategy_specs (HMAC-signed STRATEGY_SIGNING_KEY)         │
│  → UPDATE job to status='spec_ready', plane='risk'                        │
└──────────────────────────┬────────────────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ risk-engine :8001 — SINGLE DECISION AUTHORITY (no LLM!)                   │
│  poll plane='risk', status='spec_ready'                                   │
│  Reads:                                                                   │
│    - hedge_strategy_specs (verify HMAC)                                   │
│    - hedge_portfolio_snapshots (latest, age < 5s strict)                  │
│    - hedge_tenant_risk_profiles (active version)                          │
│    - hedge_kill_switches (global/tenant/venue)                            │
│  Rules engine: CVaR99 · Kelly capped · ATR vol target · DD limit · caps   │
│  Output: APPROVE | RESIZE | REJECT, signed (RISK_DECISION_KEY)            │
│  Writes (1 tx):                                                           │
│    - hedge_risk_decisions                                                 │
│    - hedge_exec_orders_outbox (ONLY if APPROVE/RESIZE)                    │
│    - hedge_run_jobs → status='decided'|'done', plane='exec'|'terminal'    │
│    - hedge_run_events (kind='risk_decided')                               │
└──────────────────────────┬────────────────────────────────────────────────┘
                           │  outbox row(s) inserted ⇒ kicks execution plane
                           ▼
═══════════════════════════════════════════════════════════════════════════════
                          EXECUTION PLANE
═══════════════════════════════════════════════════════════════════════════════
┌───────────────────────────────────────────────────────────────────────────┐
│ execution-engine :8002 — dumb dispatcher                                  │
│  poll hedge_exec_orders_outbox WHERE status='pending' AND ttl_at > now()  │
│  For each order:                                                          │
│    1. verify HMAC signature on (decision_id, leg_index, order)            │
│    2. verify decision still fresh (ttl_at)                                │
│    3. verify global/tenant/venue kill switches                            │
│    4. dispatch via venue adapter (Hyperliquid / Binance) with             │
│       client_order_id = sha256(request_id || ':' || leg_index)[:32]       │
│    5. INSERT hedge_execution_reports + UPDATE outbox status               │
│    6. UPDATE hedge_run_jobs to 'executed' | 'failed'                      │
│  Retry: 3 attempts max → DLQ. No re-routing. No re-sizing. No LLM.        │
└───────────────────────────────────────────────────────────────────────────┘
                           ▼
═══════════════════════════════════════════════════════════════════════════════
                     PERSISTENCE & OBSERVABILITY
═══════════════════════════════════════════════════════════════════════════════
  Supabase Postgres (RLS on every table; append-only; hash chain via prev_hash)
  Supabase Realtime: hedge_run_events → Cockpit live updates
  Langfuse: every LLM call (4 swarm + 1 builder) tagged with request_id
```

---

## 2. Repo structure

```
.
├── apps/
│   └── hedge-core/                 # Next.js — Cockpit + API routes
│       ├── package.json
│       ├── next.config.ts
│       ├── tsconfig.json
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx
│           │   ├── globals.css
│           │   ├── cockpit/page.tsx           # Cockpit UI page
│           │   └── api/
│           │       ├── hedge/runs/route.ts         # POST + GET list
│           │       ├── hedge/runs/[runId]/route.ts # GET single run
│           │       └── admin/kill-switch/route.ts  # admin-only
│           ├── components/CockpitClient.tsx
│           └── lib/
│               ├── auth.ts                    # JWT → tenant_id
│               ├── jwt-decode.ts
│               ├── schemas/strategy-request.ts (Zod)
│               └── supabase/server.ts
│
├── services/
│   ├── swarm-orchestrator/        # 4 LLM agents → swarm_signals
│   ├── strategy-builder/          # LLM fusion → strategy_specs
│   ├── risk-engine/               # Deterministic rules → risk_decisions + outbox
│   └── execution-engine/          # Dumb dispatcher → execution_reports
│   (each service: pyproject.toml + Dockerfile + src/{config,models,repo,main,workers/})
│
├── shared/
│   ├── schemas/                   # JSON Schemas (source of truth)
│   │   ├── strategy_request.schema.json
│   │   ├── strategy_spec.schema.json
│   │   ├── sized_order.schema.json
│   │   ├── risk_decision.schema.json
│   │   └── swarm_signal.schema.json
│   └── hmac/
│       ├── python/hedge_hmac.py   # SigningContext, sign(), verify(), payload_hash_hex()
│       └── typescript/hedge-hmac.ts
│
├── supabase/migrations/           # 0020..0032 = HEDGE Edge v2 migrations
│
├── scripts/hedge/
│   └── generate-keys.sh           # openssl rand -hex 32 ×4
│
├── docker-compose.hedge.yml       # local dev stack (4 Python services)
├── .env.hedge.example
└── README-HEDGE.md                # this file
```

---

## 3. Database schema (12 tables)

| Table | Purpose | Append-only | RLS |
|---|---|---|---|
| `hedge_strategy_requests` | Entry-point. UNIQUE(tenant_id, request_id) = idempotency | ✅ | ✅ |
| `hedge_run_jobs` | Queue + state machine. updated_at allowed | ⚠️ status transitions only | ✅ |
| `hedge_swarm_signals` | 4 advisory outputs per run | ✅ | ✅ |
| `hedge_strategy_specs` | LLM fusion output, HMAC-signed | ✅ | ✅ |
| `hedge_portfolio_snapshots` | Versioned portfolio (TTL=5s for Risk) | ✅ | ✅ |
| `hedge_tenant_risk_profiles` | Per-tenant limits, versioned | ✅ | ✅ |
| `hedge_risk_decisions` | THE decision row. HMAC-signed | ✅ | ✅ |
| `hedge_exec_orders_outbox` | Decision → Execution bus | ⚠️ status only | ✅ |
| `hedge_execution_reports` | Venue receipts | ✅ | ✅ |
| `hedge_run_events` | Realtime stream for Cockpit | ✅ | ✅ |
| `hedge_kill_switches` | Global/tenant/venue | mutable | ✅ |
| `hedge_audit_log` | Admin/security events | ✅ | ✅ |

**Hash chain** — every append-only table carries `prev_hash` + `row_hash` = `sha256(prev_hash || canonical_json(payload))`. Tampering one row breaks the chain on every subsequent row.

**Tenant isolation** — every table has `tenant_id` and a `select_own` policy keyed off `auth.jwt() ->> 'tenant_id'`. Service-role inserts are policy-bypassed but workers always carry the tenant_id from upstream rows.

---

## 4. State machine (run lifecycle)

```
                       ┌─────────┐
  POST /api/hedge/runs │ queued  │  (HEDGE Core)
                       └────┬────┘
                            │ swarm-orchestrator picks it
                            ▼
                ┌──────────────────────┐
                │   signals_ready      │  (4 agents emitted, run_event)
                └──────────┬───────────┘
                           │ strategy-builder
                           ▼
                ┌──────────────────────┐
                │     spec_ready       │  or spec_invalid → failed/terminal
                └──────────┬───────────┘
                           │ risk-engine
                           ▼
                ┌──────────────────────┐
                │      decided         │
                └──────────┬───────────┘
                           │ if APPROVE/RESIZE → outbox INSERT
                           ▼
                ┌──────────────────────┐
                │     executed         │
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │        done          │
                └──────────────────────┘

  ANY error → status='failed', plane='terminal'.
  3 retries exhausted → status='poisoned'.
  Decision=REJECT → status='done' immediately (no outbox row).
```

Every transition emits a `hedge_run_events` row, which Cockpit observes via Supabase Realtime.

---

## 5. Hard boundaries

### DO

- ✅ Pass `request_id` (uuid v4 from Cockpit) through every layer.
- ✅ Sign every cross-service payload (HMAC-SHA256, dedicated key per stage).
- ✅ Verify signatures at every consumer step.
- ✅ Validate every payload with Pydantic (Python) or Zod (TS) at boundaries.
- ✅ Write inside a single transaction whenever multiple rows depend on a decision.
- ✅ Use `FOR UPDATE SKIP LOCKED` for worker claims; never lock contention.
- ✅ Read kill switches **on every order**, no cache.
- ✅ Log every LLM call into Langfuse tagged with `request_id` + `tenant_id`.
- ✅ Start in `DRY_RUN=true` until paper-trading passes.

### DO NOT

- ❌ Call an exchange from Cockpit, HEDGE Core, Swarm, or Strategy Builder.
- ❌ Import `openai` / any LLM SDK inside `risk-engine` or `execution-engine`.
- ❌ Trust an unsigned payload received from another service.
- ❌ Resize / re-route / second-guess inside `execution-engine`.
- ❌ Mutate any append-only row (triggers will raise).
- ❌ Use `SUPABASE_SERVICE_ROLE_KEY` from Cockpit/HEDGE Core.
- ❌ Retry a venue REJECT (margin, symbol-invalid). Surface it instead.
- ❌ Reuse a `client_order_id` (deterministic from request_id + leg_index).

---

## 6. Run locally

### 6.1 Apply migrations

Already done in production via Supabase MCP. To re-apply locally:

```bash
supabase db push --linked --include-all
# or via MCP: mcp__supabase__apply_migration project_id=fxeibmjebvxtoazuyyvz ...
```

The 12 HEDGE tables now exist under `public.hedge_*` in project `fxeibmjebvxtoazuyyvz`.

### 6.2 Generate HMAC keys

```bash
./scripts/hedge/generate-keys.sh > .env.hedge
# Append the rest:
cat .env.hedge.example | grep -v '_KEY=v1:0000' >> .env.hedge
# Fill SUPABASE_DB_URL, HYPERCLI_API_KEY, etc.
```

### 6.3 Seed a tenant risk profile

```sql
insert into hedge_tenant_risk_profiles (
  tenant_id, version,
  cvar_99_max_pct, kelly_cap, max_leverage, max_drawdown_pct,
  atr_vol_target_pct, per_asset_notional_cap_usd, daily_loss_limit_usd,
  allowed_venues, allowed_assets,
  row_hash
) values (
  '00000000-0000-0000-0000-000000000001'::uuid, 1,
  0.05, 0.25, 3.0, 0.20,
  0.02, 10000, 1000,
  array['hyperliquid'], array['BTC','ETH'],
  encode(digest('seed', 'sha256'), 'hex')
);
```

### 6.4 Seed a portfolio snapshot

```sql
insert into hedge_portfolio_snapshots (tenant_id, payload, source, signature, row_hash)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '{"equity_usd": 10000, "available_margin_usd": 8000, "max_drawdown_pct_30d": 0.05, "realized_pnl_usd_24h": 0, "positions": [], "open_orders": []}'::jsonb,
  'manual_admin',
  'v1.SEED',
  encode(digest('seed-portfolio', 'sha256'), 'hex')
);
```

In production, this row is refreshed by Execution Engine after every fill.

### 6.5 Boot the stack

```bash
# Python services:
docker compose -f docker-compose.hedge.yml --env-file .env.hedge up --build

# Next.js (separate terminal):
cd apps/hedge-core
cp .env.example .env.local   # fill SUPABASE_URL, ANON, SERVICE_ROLE
npm install
npm run dev                   # http://localhost:3333/cockpit
```

### 6.6 Submit a run

```bash
# Get a JWT (from Supabase auth signin)
TOKEN="eyJhbGciOi..."

curl -X POST http://localhost:3333/api/hedge/runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "'"$(uuidgen | tr A-Z a-z)"'",
    "intent_type": "strategy_intent",
    "raw_intent": "scalp BTC low volatility on 1h"
  }'
# → 202 { request_id, run_id, status: "queued", plane: "swarm" }
```

Watch Cockpit page to see the state machine progress.

---

## 7. Determinism & replay

The Risk Engine is a **pure function** of:
- The verified `StrategySpec`
- The pinned `PortfolioSnapshot` (immutable row)
- The pinned `TenantRiskProfile` (immutable version)
- The synthetic market context seeded by `request_id` (deterministic)

To replay a historical decision:

```bash
# Replay endpoint on risk-engine — does NOT write to DB.
curl -X POST http://localhost:8001/v1/evaluate \
  -H "Content-Type: application/json" \
  -d @historical-spec.json
```

Same inputs → byte-identical decision (modulo non-deterministic UUIDs). Verified by `test_evaluator.py::test_determinism_replay`.

---

## 8. Failure modes & safe degradation

| Failure | What happens | Safe? |
|---|---|---|
| Cockpit offline | No new runs queued. In-flight runs continue. | ✅ |
| HEDGE Core down (Vercel) | No new submissions. Existing runs untouched. | ✅ |
| Swarm down | Jobs stay `queued`. No spec, no decision, no trade. | ✅ |
| 1/4 swarm agent timeout | Run continues with `degraded=true`, confidence capped. | ✅ |
| All 4 agents fail | Run failed; no spec; no trade. | ✅ |
| Builder LLM down | Job retries until poisoned; no spec; no trade. | ✅ |
| Spec validation fails | `status='spec_invalid'` → run failed; no trade. | ✅ |
| Risk Engine down | Jobs stuck at `spec_ready`. Outbox empty. **No trade.** | ✅ |
| Portfolio stale (>5s) | Risk REJECTs with `reason='portfolio_stale'`. | ✅ |
| Kill switch active | Risk REJECTs; Execution also re-checks at dispatch time. | ✅ |
| Outbox HMAC tampered | Execution refuses + writes `audit_log` (critical). | ✅ |
| Decision TTL expired before dispatch | Outbox row → `status='expired'`. No retry. | ✅ |
| Venue REJECT (margin/symbol) | Single attempt logged. No retry chase. | ✅ |
| Venue 5xx / network | Retry up to 3, then DLQ. | ✅ |
| Supabase down | No layer can advance. Returns 503. | ✅ |

**Principle**: every failure mode breaks the chain by *removing* a precondition. Without all preconditions (signed spec + fresh portfolio + signed decision + un-blocked kill switches + valid outbox + verified signature at dispatch), execution-engine cannot send anything. **No happy-path bypass exists.**

---

## 9. Security model

### HMAC key separation

| Key | Signs | Verified by |
|---|---|---|
| `SWARM_SIGNING_KEY` | `hedge_swarm_signals` | strategy-builder (advisory) |
| `STRATEGY_SIGNING_KEY` | `hedge_strategy_specs` | risk-engine |
| `RISK_DECISION_KEY` | `hedge_risk_decisions` + outbox rows | execution-engine |
| `PORTFOLIO_SIGNING_KEY` | `hedge_portfolio_snapshots` | risk-engine |

Keys are 32-byte hex, stored in Railway secrets. Rotation supported via `vN:hex,vN+1:hex` env format — verifiers accept any listed key; signers use the active key ID.

### Tenant isolation

- Every table: RLS policy `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`.
- Service role only used by Python workers — they propagate `tenant_id` from upstream rows.
- HEDGE Core never bypasses RLS; uses anon key + user JWT for all writes from user input.

### Append-only enforcement

`hedge_block_mutation()` trigger raises on any UPDATE/DELETE for the append-only tables. The only "mutable" tables are `hedge_run_jobs` (status transitions) and `hedge_exec_orders_outbox` (status transitions) — and even those only mutate state, never identity.

---

## 10. What's still TODO before live trading

| # | Task | Owner | Gate |
|---|---|---|---|
| 1 | Wire real market data (replace `synthetic_market_context`) | risk-engine | before paper trading |
| 2 | Real Hyperliquid SDK call (replace `_translate_order` stub) | execution-engine | before paper trading |
| 3 | Sign portfolio snapshots properly (currently 'v1.SEED') | execution-engine reconcile job | before paper trading |
| 4 | Per-tenant LLM rate limiting | strategy-builder | before multi-tenant |
| 5 | Langfuse integration in agents | swarm-orchestrator | before live |
| 6 | Reconciliation job (positions venue vs DB) | execution-engine | before live |
| 7 | Admin dashboard for kill switches + DLQ + outbox depth | apps/hedge-core | before live |
| 8 | Chaos tests: kill workers mid-run, verify replay | infra | before live |

**Gating order**: Shadow (dry-run) → paper (testnet) → 1 tenant pilot, 1 venue, $500 cap → full live.

---

## 11. Cheat-sheet

```bash
# Apply all migrations (already done in prod):
mcp__supabase__apply_migration project_id=fxeibmjebvxtoazuyyvz ...

# Generate keys:
./scripts/hedge/generate-keys.sh > .env.hedge

# Run Python services:
docker compose -f docker-compose.hedge.yml --env-file .env.hedge up --build

# Run Next.js:
cd apps/hedge-core && npm run dev

# Submit a run (idempotent):
curl -X POST localhost:3333/api/hedge/runs \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"request_id":"'"$(uuidgen|tr A-Z a-z)"'","intent_type":"strategy_intent","raw_intent":"hedge ETH exposure"}'

# Kill switch (admin JWT required):
curl -X POST localhost:3333/api/admin/kill-switch \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"scope":"global","active":true,"reason":"manual stop"}'

# Replay a decision (read-only RPC):
curl -X POST localhost:8001/v1/evaluate -H "Content-Type: application/json" -d @historical-spec.json
```

---

**Single decision authority. Append-only. No-trade by default. Replayable.**
**This system cannot accidentally trade.**

---

# Phase 2 — Market Reality

> All `synthetic_market_context` code is **removed**. Risk Engine reads real
> snapshots from DB; no fallback exists.

## 12. New service — `market-data-service` (:8004)

WS ingesters per (venue, symbol):
- **Binance Futures**: `bookTicker` / `depth20@100ms` / `aggTrade` / `markPrice` streams.
- **Hyperliquid**: `l2Book` / `trades` / `activeAssetCtx` channels.

In-memory rolling state computes mid, spread, ATR-14, realized vol (24h via 1m
log-returns), top-10 depth (USD), depth imbalance.

The **SnapshotWorker** writes two streams to DB:
- `hedge_market_snapshots` every 1s (rich payload, signed `MARKET_SIGNING_KEY`).
- `hedge_orderbook_snapshots` every 0.5s (L2 top-20).

If WS silence > 5s for a symbol → emits `hedge_market_events(kind='snapshot_stale')`
and **stops writing snapshots for that symbol** (don't write stale data).

### What Risk Engine no longer does
- ❌ No `synthetic_market_context` import (file deleted).
- ❌ No network call to any exchange.
- ❌ No fallback when market data is missing — REJECT instead.

### New REJECT reason codes
| Code | When |
|---|---|
| `market_stale` | No snapshot OR snapshot age > `market_max_age_seconds` (default 5s) |
| `spread_too_wide` | `spread_bps > 25` (configurable) |
| `insufficient_liquidity` | Top-10 depth USD on the active side < $50k (configurable) |
| `slippage_too_high` | Walk-the-book VWAP slippage > 30 bps |
| `log_returns_insufficient` | < 200 samples → can't compute CVaR99 reliably |

## 13. Execution Engine — Hyperliquid hardened

The real adapter ([services/execution-engine/src/adapters/hyperliquid.py](services/execution-engine/src/adapters/hyperliquid.py)) now implements:
- **EIP-712 signed actions** (`eth_account` + `msgpack`) — full HL `phantom_agent` scheme.
- **Monotonic nonce** (ms epoch, guaranteed > last_nonce).
- **Bounded retry**: only `httpx.TimeoutException` / `NetworkError` / `5xx`. Venue REJECTs (4xx with `status='err'`) are **terminal** — no retry chase.
- **Cancel by client_order_id** (`cancelByCloid`).
- **Read-only `fetch_positions()`** for the reconcile worker.
- **`schedule_deadman()`** — venue-side dead-man switch (HL `scheduleCancel`).
- **Coin-index cache** refreshed hourly via `/info?type=meta`.

## 14. Run modes — strict gating

| Mode | Behaviour | Required env |
|---|---|---|
| `dry_run` | Adapter never hits network. Synthetic `dry_run` reports. | `HEDGE_MODE=dry_run` |
| `paper` | Hits venue testnets if creds present. Otherwise same as dry_run. | `HEDGE_MODE=paper` + testnet creds |
| `live` | Real submissions. **AND** all of: tenant in allowlist, venue in allowlist, per-order notional ≤ cap. ANY fail → silent downgrade to `dry_run` + metric `hedge_mode_downgrade_total` + critical alert. | `HEDGE_MODE=live` + `HEDGE_LIVE_TENANT_ALLOWLIST` + `HEDGE_LIVE_VENUE_ALLOWLIST` + `HEDGE_LIVE_NOTIONAL_CAP_USD > 0` |

Safety: if `HEDGE_MODE=live` is set but any allowlist/cap is missing, the service **forces dry_run** at startup and logs CRITICAL.

## 15. Reconcile worker

Runs every 30s. For each active tenant × supported venue:
1. `adapter.fetch_positions()` (read-only HL `clearinghouseState`).
2. Read latest `hedge_portfolio_snapshots.payload.positions` from DB.
3. Diff by (symbol, side), USD-tolerance = max($1, 0.5% of total notional).
4. Write `hedge_position_reconciliations` row with status `match | partial | mismatch | venue_unavailable`.
5. **On `mismatch`**:
   - Auto-arm tenant-level kill switch (`hedge_kill_switches.scope='tenant'`).
   - INSERT `hedge_execution_alerts(kind='reconcile_mismatch', severity='critical')`.
   - INSERT `hedge_audit_log(severity='critical', event_type='kill_switch.auto_set')`.

The only auto-action is "freeze". Humans investigate.

## 16. Dead-man switch (venue-side)

`DeadmanWorker` heartbeats HL `scheduleCancel` every 20s with a 60s window. If
the process dies, HL auto-cancels all open orders for the account within 60s.
Disabled in `dry_run` mode (no real session to drain).

## 17. New tables (Market Reality)

| Table | Purpose |
|---|---|
| `hedge_market_snapshots` | 1s cadence per (venue, symbol). Used by Risk. Signed. |
| `hedge_orderbook_snapshots` | 0.5s cadence L2 top-20. Used by Risk for slippage estimation. |
| `hedge_market_events` | WS disconnects, stale snapshots, spread anomalies. |
| `hedge_position_reconciliations` | Per-tenant-venue reconcile cycle output. |
| `hedge_execution_alerts` | Ops-paging surface (reconcile mismatch, signature failure, retry storm, dead-man triggered). |

## 18. Observability

Each service now exposes `/metrics` (Prometheus text format):

| Metric | Service | Use |
|---|---|---|
| `hedge_market_snapshots_written_total{venue,symbol}` | market-data | snapshot cadence |
| `hedge_market_ws_connected{venue,symbol}` | market-data | WS health gauge |
| `hedge_market_stale_events_total{venue,symbol}` | market-data | feed degradation |
| `hedge_swarm_runs_total{outcome}` | swarm | run counts |
| `hedge_swarm_agent_latency_ms{agent,status}` | swarm | per-agent histogram |
| `hedge_builder_runs_total{outcome}` | builder | fusion outcomes |
| `hedge_risk_decisions_total{decision}` | risk | approve/resize/reject counts |
| `hedge_risk_reject_reasons_total{reason}` | risk | reject reason distribution |
| `hedge_exec_attempts_total{venue,status}` | execution | dispatch outcomes |
| `hedge_exec_latency_ms{venue}` | execution | submission latency histogram |
| `hedge_signature_failures_total` | execution | should always be 0 |
| `hedge_mode_downgrade_total{reason}` | execution | LIVE→dry_run downgrades |

Prometheus + alerting config: [services/observability/prometheus.yml](services/observability/prometheus.yml) + [services/observability/hedge_rules.yml](services/observability/hedge_rules.yml).

Critical alerts:
- `HedgeSignatureFailure` (any > 0)
- `HedgeMarketStaleStorm` (> 0.5/s for 2m)
- `HedgeWebsocketDown` (> 1m)
- `HedgeLiveDowngradeStorm` (any LIVE order silently downgraded)
- `HedgeRejectStormMarketStale` (Risk reject rate > 0.5/s for 2m)

## 19. Chaos suite

[tests/chaos/](tests/chaos/) covers:
- Invalid signature injection (HMAC + payload tampering) — pure unit.
- Stale market snapshot → REJECT — pure unit on evaluator.
- Duplicate request_id storm (100 concurrent inserts) — DB integration.
- Outbox TTL expired → never dispatched — DB integration.
- Clock skew → DB clock is authority.

Other scenarios listed in `tests/chaos/README.md` are stubbed and require a
dedicated CHAOS_DB_URL Postgres to run end-to-end with workers.

**Invariant asserted everywhere**: no `hedge_execution_reports` row with
`status='submitted' AND dry_run=false` may appear under failure.

## 20. Go-live gate — updated

1. **Shadow** (`HEDGE_MODE=dry_run`): full pipeline, no exchange. Risk must
   process > 1000 runs/24h without `signature_invalid` or `market_stale` storms.
2. **Paper** (`HEDGE_MODE=paper`, testnet creds): same plus testnet executions.
   Reconcile must show `status='match'` 100% of cycles for 72h.
3. **Live pilot** (`HEDGE_MODE=live`, 1 tenant, 1 venue, notional cap $500):
   24h with zero `hedge_execution_alerts(severity='critical')`.
4. **Live full**: raise notional cap incrementally; expand tenant/venue allowlists.

Each gate is enforced **at the code level**, not policy: missing allowlist =
mandatory downgrade.
