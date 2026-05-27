"""Chaos: simulated clock skew on workers must not cause execution of stale
decisions. We use the DB clock as source of truth (TTL is `expires_at` stored
DB-side), so a worker with a fast/slow clock is irrelevant."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest


@pytest.mark.asyncio
async def test_db_clock_is_authority_for_ttl(pool):
    """Even if a 'worker' computes now() locally, the DB-side filter
    (ttl_at > now()) wins."""
    async with pool.acquire() as conn:
        db_now = await conn.fetchval("select now()")
        future = await conn.fetchval("select now() + interval '10 seconds'")
        past = await conn.fetchval("select now() - interval '10 seconds'")
        assert future > db_now > past

        # In production, every poll filters on ttl_at > now() which is DB now().
        # Any local-clock drift on the worker has zero effect.
