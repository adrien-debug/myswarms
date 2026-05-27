# HEDGE Chaos Suite

Tests that verify the **safe-degradation invariant**:

> Under any single-component failure, the system MUST NOT send an order in an ambiguous state.

Each scenario seeds a state, simulates a failure, then asserts that no
unexpected execution_reports row appeared with status='submitted'.

## Layout

```
tests/chaos/
├── conftest.py                      # async fixtures: DB, signing keys, seed data
├── test_risk_crash_mid_decision.py
├── test_execution_crash_mid_order.py
├── test_duplicate_request_storm.py
├── test_stale_market_snapshot.py
├── test_invalid_signature_injection.py
├── test_outbox_saturation.py
├── test_websocket_disconnect.py
├── test_partial_fill_mismatch.py
├── test_exchange_timeout_storm.py
└── test_clock_skew.py
```

## Running

```bash
# Requires a fresh Supabase test project or an isolated schema.
# Recommended: set CHAOS_DB_URL to a dedicated DB.
export CHAOS_DB_URL='postgres://.../chaos_db'
pytest tests/chaos -x -v
```

## Invariants checked everywhere

Each test ends with the same assertion via `assert_no_unexpected_executions()`:

- `select count(*) from hedge_execution_reports where status = 'submitted' and dry_run = false` == 0
  (unless the test explicitly seeded a live submission as the control path)
- Every `hedge_exec_orders_outbox.status` is one of: pending/locked/expired/failed/dlq
  (no orphan "sent" without a corresponding execution_report)
- Every signature failure produces a `hedge_audit_log` row with severity='critical'.

This is the contract: failures must never silently produce a live trade.
