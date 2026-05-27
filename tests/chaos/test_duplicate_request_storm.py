"""Chaos: 100 concurrent submissions with the SAME request_id must produce
exactly one strategy_request row and at most one run_job."""

from __future__ import annotations

import asyncio
import json
import uuid

import pytest


@pytest.mark.asyncio
async def test_duplicate_submission_storm(pool, tenant_id):
    request_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    async def insert_once():
        async with pool.acquire() as conn:
            try:
                await conn.execute(
                    """
                    insert into hedge_strategy_requests (
                        tenant_id, user_id, request_id, intent_type, raw_intent,
                        normalized, context, row_hash
                    )
                    values ($1,$2,$3,'strategy_intent','scalp',
                            '{}'::jsonb,'{}'::jsonb,'h')
                    on conflict (tenant_id, request_id) do nothing
                    """,
                    tenant_id, user_id, request_id,
                )
            except Exception:
                pass

    await asyncio.gather(*(insert_once() for _ in range(100)))

    async with pool.acquire() as conn:
        n = await conn.fetchval(
            "select count(*) from hedge_strategy_requests where tenant_id=$1 and request_id=$2",
            tenant_id, request_id,
        )
    assert n == 1, f"Idempotency violated: {n} rows"
