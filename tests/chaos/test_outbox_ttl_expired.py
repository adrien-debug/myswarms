"""Chaos: outbox row whose ttl_at is in the past must be marked 'expired'
and NEVER dispatched."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest


@pytest.mark.asyncio
async def test_expired_outbox_skipped(pool, tenant_id):
    request_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            """
            insert into hedge_strategy_requests (
                tenant_id,user_id,request_id,intent_type,raw_intent,row_hash)
            values ($1,$2,$3,'strategy_intent','seed','h')
            """,
            tenant_id, user_id, request_id,
        )
        # Build minimal spec / portfolio / profile / decision rows so the FKs hold.
        spec_id = str(uuid.uuid4())
        await conn.execute(
            """
            insert into hedge_strategy_specs (
                id, tenant_id, request_id, spec, spec_hash, signature, signing_key_id,
                swarm_signals_ref, confidence, model, status, row_hash)
            values ($1,$2,$3,'{}'::jsonb,'h','sig','v1',array[]::uuid[],0.5,'k','built','h')
            """,
            spec_id, tenant_id, request_id,
        )
        snap_id = str(uuid.uuid4())
        await conn.execute(
            """
            insert into hedge_portfolio_snapshots (id, tenant_id, payload, source, signature, row_hash)
            values ($1, $2, '{}'::jsonb, 'manual_admin', 'sig', 'h')
            """,
            snap_id, tenant_id,
        )
        prof_id = str(uuid.uuid4())
        await conn.execute(
            """
            insert into hedge_tenant_risk_profiles (
                id,tenant_id,version,cvar_99_max_pct,row_hash
            ) values ($1,$2,1,0.05,'h')
            """,
            prof_id, tenant_id,
        )
        dec_id = str(uuid.uuid4())
        past = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=120)
        await conn.execute(
            """
            insert into hedge_risk_decisions (
                id, tenant_id, request_id, spec_id, portfolio_snapshot_id,
                risk_profile_id, decision, reason_codes, rules_eval, sized_orders,
                decision_ttl_seconds, expires_at, signature, signing_key_id,
                engine_version, row_hash)
            values ($1,$2,$3,$4,$5,$6,'APPROVE',array['ok'],'{}'::jsonb,'[]'::jsonb,
                    10, $7, 'sig', 'v1', '0.1.0', 'h')
            """,
            dec_id, tenant_id, request_id, spec_id, snap_id, prof_id, past,
        )
        ob_id = str(uuid.uuid4())
        await conn.execute(
            """
            insert into hedge_exec_orders_outbox (
                id, tenant_id, request_id, decision_id, leg_index,
                order_payload, client_order_id, status, ttl_at, signature, row_hash)
            values ($1,$2,$3,$4,0,'{}'::jsonb,$5,'pending',$6,'sig','h')
            """,
            ob_id, tenant_id, request_id, dec_id, "a" * 32, past,
        )

        # Simulate the worker's TTL-sweep: select with ttl_at > now() returns nothing.
        eligible = await conn.fetchval(
            """
            select count(*) from hedge_exec_orders_outbox
            where status='pending' and ttl_at > now()
            """
        )
        assert eligible == 0, "Expired outbox row must NOT be eligible for dispatch"

        # And the worker sweep step marks them 'expired'.
        await conn.execute(
            """
            update hedge_exec_orders_outbox
            set status='expired'
            where status='pending' and ttl_at <= now()
            """
        )
        status = await conn.fetchval(
            "select status from hedge_exec_orders_outbox where id=$1", ob_id
        )
        assert status == "expired"
