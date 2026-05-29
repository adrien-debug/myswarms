"""Chaos suite fixtures.

These tests are integration-style: they require a Postgres with the HEDGE
schema applied. Set CHAOS_DB_URL (or fall back to SUPABASE_DB_URL) — but
NEVER use a production project.

Each test gets its own (tenant_id, request_id) so we can assert on isolated
state without cross-talk.
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio

sys.path.append(str(Path(__file__).resolve().parents[2] / "shared" / "hmac" / "python"))

from hedge_hmac import SigningContext  # type: ignore  # noqa: E402


def _require_test_db_url() -> str:
    url = os.getenv("CHAOS_DB_URL") or os.getenv("SUPABASE_DB_URL")
    if not url:
        pytest.skip("Set CHAOS_DB_URL or SUPABASE_DB_URL to run chaos tests")
    if "prod" in url.lower():
        pytest.exit("Refusing to run chaos tests against a URL containing 'prod'", returncode=2)
    return url


@pytest_asyncio.fixture
async def pool() -> asyncpg.Pool:
    url = _require_test_db_url()
    pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=4)
    yield pool
    await pool.close()


@pytest.fixture
def tenant_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def request_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def risk_signer() -> SigningContext:
    raw = os.getenv("RISK_DECISION_KEY")
    if not raw:
        # Generate ephemeral key for the test run.
        os.environ["RISK_DECISION_KEY"] = "v1:" + ("ab" * 32)
    return SigningContext.from_env("RISK_DECISION_KEY")


@pytest_asyncio.fixture
async def assert_no_unexpected_live_executions(pool: asyncpg.Pool, tenant_id: str):
    """Yield a callable; on test end, assert no live submissions.

    Use this AFTER asserting the test-specific control conditions.
    """
    yield
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            select id, status, dry_run, client_order_id
            from hedge_execution_reports
            where tenant_id = $1 and dry_run = false and status = 'submitted'
            """,
            tenant_id,
        )
        assert not rows, f"Unexpected live submissions: {[dict(r) for r in rows]}"
