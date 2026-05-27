"""Hyperliquid venue adapter — hardened.

Capabilities:
  - place market/limit orders with EIP-712 signed actions (eth_account)
  - cancel single order
  - fetch open orders / positions (for reconcile worker)
  - bounded retry on transient errors
  - dead-man switch (scheduleCancel) heartbeat
  - reduce_only safety on close orders

WHAT THE ADAPTER WILL NOT DO:
  - No reasoning. No sizing. No rerouting.
  - On 4xx with code != known-transient: REJECTED, surfaced as alert.

Reference (HL docs):
  https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint

NOTE on signing: HL's exact `phantom_agent` signing scheme requires msgpack +
keccak hashing per their docs. We implement the supported subset (order /
cancel / scheduleCancel) using eth_account's `encode_typed_data`. The full
schema lives in `_phantom_action_hash()` — kept centralised here.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx
import msgpack
from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import keccak, to_bytes
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from .base import ExecutionAttempt

logger = logging.getLogger("hedge.exec.hyperliquid")


_TRANSIENT_HTTP_CODES = {408, 429, 500, 502, 503, 504}


class HyperliquidAdapter:
    venue = "hyperliquid"

    def __init__(
        self,
        *,
        api_url: str,
        account_address: str | None,
        secret_key: str | None,
        dry_run: bool = True,
        timeout_seconds: int = 8,
        deadman_seconds: int = 60,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.account_address = account_address.lower() if account_address else None
        self.secret_key = secret_key
        self.dry_run = dry_run
        self.timeout = timeout_seconds
        self.deadman_seconds = deadman_seconds
        self._coin_index_cache: dict[str, int] = {}
        self._coin_index_fetched_at: float = 0.0
        # Local nonce monotonicity. HL accepts ms epoch as nonce.
        self._last_nonce: int = 0

    # ---------- Public surface ----------

    async def submit_order(self, order: dict[str, Any]) -> ExecutionAttempt:
        start = time.perf_counter()
        if self.dry_run:
            return _dry_run_attempt(order, start)
        if not (self.account_address and self.secret_key):
            return _err("credentials_missing", "HL creds missing", start)
        try:
            await self._ensure_coin_indices()
            action = self._build_order_action(order)
            payload = await self._sign_and_envelope(action)
            return await self._post_with_retry(payload, start, kind="order", order=order)
        except Exception as e:  # noqa: BLE001
            logger.exception("HL submit_order failed")
            return _err("exception", f"{type(e).__name__}: {e}", start)

    async def cancel_order(self, *, symbol: str, client_order_id: str) -> ExecutionAttempt:
        start = time.perf_counter()
        if self.dry_run:
            return _dry_run_attempt({"venue": "hyperliquid", "symbol": symbol, "side": "n/a", "size": 0, "client_order_id": client_order_id, "limit_price": None}, start)
        try:
            await self._ensure_coin_indices()
            cloid = "0x" + client_order_id
            action = {
                "type": "cancelByCloid",
                "cancels": [{"asset": self._coin_index_cache.get(symbol, 0), "cloid": cloid}],
            }
            payload = await self._sign_and_envelope(action)
            return await self._post_with_retry(payload, start, kind="cancel", order={"client_order_id": client_order_id, "symbol": symbol})
        except Exception as e:  # noqa: BLE001
            return _err("cancel_exception", f"{type(e).__name__}: {e}", start)

    async def schedule_deadman(self) -> bool:
        """Arm the venue-side dead-man switch.

        If we stop calling within `deadman_seconds`, HL auto-cancels all open
        orders for the account. Call repeatedly from a heartbeat loop.
        """
        if self.dry_run or not (self.account_address and self.secret_key):
            return False
        try:
            action = {"type": "scheduleCancel", "time": int(time.time() * 1000) + self.deadman_seconds * 1000}
            payload = await self._sign_and_envelope(action)
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(f"{self.api_url}/exchange", json=payload)
                return r.status_code == 200 and r.json().get("status") == "ok"
        except Exception:
            logger.exception("HL scheduleCancel failed")
            return False

    async def fetch_positions(self) -> list[dict[str, Any]]:
        """Read-only position fetch for reconcile worker."""
        if not self.account_address:
            return []
        url = f"{self.api_url}/info"
        body = {"type": "clearinghouseState", "user": self.account_address}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(url, json=body)
            r.raise_for_status()
            data = r.json()
        positions: list[dict[str, Any]] = []
        for p in data.get("assetPositions", []):
            pos = p.get("position") or {}
            size = float(pos.get("szi") or 0)
            if size == 0:
                continue
            positions.append(
                {
                    "venue": self.venue,
                    "symbol": f"{pos.get('coin')}-USD",
                    "side": "long" if size > 0 else "short",
                    "size": abs(size),
                    "entry": float(pos.get("entryPx") or 0),
                    "unrealized_pnl": float(pos.get("unrealizedPnl") or 0),
                }
            )
        return positions

    # ---------- Internals ----------

    async def _ensure_coin_indices(self) -> None:
        if self._coin_index_cache and time.time() - self._coin_index_fetched_at < 3600:
            return
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.post(f"{self.api_url}/info", json={"type": "meta"})
                r.raise_for_status()
                meta = r.json()
            cache: dict[str, int] = {}
            for i, asset in enumerate(meta.get("universe", [])):
                name = asset.get("name") or ""
                if name:
                    cache[f"{name}-USD"] = i
                    cache[name] = i
            if cache:
                self._coin_index_cache = cache
                self._coin_index_fetched_at = time.time()
        except Exception:
            logger.warning("HL meta fetch failed; using cached/default indices")

    def _next_nonce(self) -> int:
        n = int(time.time() * 1000)
        if n <= self._last_nonce:
            n = self._last_nonce + 1
        self._last_nonce = n
        return n

    def _build_order_action(self, order: dict[str, Any]) -> dict[str, Any]:
        cloid = "0x" + order["client_order_id"]
        is_buy = order["side"] == "buy"
        symbol = order["symbol"]
        asset_idx = self._coin_index_cache.get(symbol, 0)
        if order["type"] == "market":
            order_type = {"limit": {"tif": "Ioc"}}
            limit_px = order.get("limit_price") or 0.0
        else:
            tif = order.get("time_in_force", "GTC")
            order_type = {"limit": {"tif": tif.capitalize()}}
            limit_px = order["limit_price"]
        return {
            "type": "order",
            "orders": [
                {
                    "a": asset_idx,
                    "b": is_buy,
                    "p": _fmt_price(limit_px),
                    "s": _fmt_size(order["size"]),
                    "r": order.get("reduce_only", False),
                    "t": order_type,
                    "c": cloid,
                }
            ],
            "grouping": "na",
        }

    async def _sign_and_envelope(self, action: dict[str, Any]) -> dict[str, Any]:
        """Build the full signed envelope HL expects.

        We use eth_account to sign EIP-712 typed data over the action hash.
        HL's "phantom agent" hash: keccak(msgpack(action) || nonce_bytes || vaultBytes(0))
        Then EIP-712-signed with domain {"name":"Exchange","version":"1","chainId":1337}.
        """
        assert self.secret_key, "secret_key required for live submit"
        nonce = self._next_nonce()
        action_hash = self._phantom_action_hash(action, nonce, vault_address=None)
        typed_data = {
            "domain": {
                "name": "Exchange",
                "version": "1",
                "chainId": 1337,
                "verifyingContract": "0x0000000000000000000000000000000000000000",
            },
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
                "Agent": [
                    {"name": "source", "type": "string"},
                    {"name": "connectionId", "type": "bytes32"},
                ],
            },
            "primaryType": "Agent",
            "message": {"source": "a", "connectionId": "0x" + action_hash.hex()},
        }
        encoded = encode_typed_data(full_message=typed_data)
        signed = Account.sign_message(encoded, private_key=self.secret_key)
        sig = {
            "r": hex(signed.r),
            "s": hex(signed.s),
            "v": signed.v,
        }
        return {"action": action, "nonce": nonce, "signature": sig, "vaultAddress": None}

    @staticmethod
    def _phantom_action_hash(action: dict[str, Any], nonce: int, vault_address: str | None) -> bytes:
        action_bytes = msgpack.packb(action, use_bin_type=False)
        nonce_bytes = nonce.to_bytes(8, "big")
        vault_bytes = b"\x00" if vault_address is None else b"\x01" + to_bytes(hexstr=vault_address)
        return keccak(action_bytes + nonce_bytes + vault_bytes)

    async def _post_with_retry(
        self,
        payload: dict[str, Any],
        start: float,
        *,
        kind: str,
        order: dict[str, Any],
    ) -> ExecutionAttempt:
        """Bounded retry on transient HTTP/network errors only.

        We DO NOT retry on:
          - 4xx with venue-side rejections (margin, symbol, insufficient funds)
          - schema errors
        """
        attempts = 0
        last_err: str = ""
        async for attempt in AsyncRetrying(
            reraise=False,
            stop=stop_after_attempt(3),
            wait=wait_exponential_jitter(initial=0.3, max=2),
            retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
        ):
            with attempt:
                attempts += 1
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(f"{self.api_url}/exchange", json=payload)
                latency_ms = int((time.perf_counter() - start) * 1000)
                if resp.status_code == 200:
                    body = resp.json()
                    ok = body.get("status") == "ok"
                    if ok:
                        return ExecutionAttempt(
                            status="submitted",
                            venue_order_id=_extract_oid(body),
                            filled_size=None,
                            avg_fill_price=None,
                            fees_usd=None,
                            venue_response=body,
                            error_code=None,
                            error_message=None,
                            latency_ms=latency_ms,
                        )
                    # status='err' from HL — terminal, do not retry.
                    return ExecutionAttempt(
                        status="rejected",
                        venue_order_id=None,
                        filled_size=None,
                        avg_fill_price=None,
                        fees_usd=None,
                        venue_response=body,
                        error_code="venue_rejected",
                        error_message=str(body)[:500],
                        latency_ms=latency_ms,
                    )
                if resp.status_code in _TRANSIENT_HTTP_CODES:
                    # Force a retry by raising NetworkError-equivalent.
                    last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    raise httpx.NetworkError(last_err)
                # Non-transient: surface immediately.
                return ExecutionAttempt(
                    status="rejected",
                    venue_order_id=None,
                    filled_size=None,
                    avg_fill_price=None,
                    fees_usd=None,
                    venue_response={"status": resp.status_code, "body": resp.text[:500]},
                    error_code=f"http_{resp.status_code}",
                    error_message=resp.text[:300],
                    latency_ms=latency_ms,
                )
        # Retries exhausted on transient errors.
        return _err("retry_exhausted", last_err or "transient errors exhausted retries",
                    start, latency_override=None)


# ---------- helpers ----------

def _extract_oid(body: dict) -> str | None:
    try:
        data = body["response"]["data"]
        statuses = data.get("statuses", [])
        for s in statuses:
            if isinstance(s, dict):
                if "resting" in s:
                    return str(s["resting"].get("oid"))
                if "filled" in s:
                    return str(s["filled"].get("oid"))
    except (KeyError, TypeError, AttributeError):
        pass
    return None


def _fmt_price(p: float | int) -> str:
    return format(float(p), "f").rstrip("0").rstrip(".") or "0"


def _fmt_size(s: float | int) -> str:
    return format(float(s), "f").rstrip("0").rstrip(".") or "0"


def _dry_run_attempt(order: dict[str, Any], start: float) -> ExecutionAttempt:
    return ExecutionAttempt(
        status="dry_run",
        venue_order_id=f"dry-{order['client_order_id'][:16]}",
        filled_size=order.get("size", 0),
        avg_fill_price=order.get("limit_price") or 0.0,
        fees_usd=0.0,
        venue_response={"dry_run": True, "echoed": order},
        error_code=None,
        error_message=None,
        latency_ms=int((time.perf_counter() - start) * 1000),
    )


def _err(code: str, msg: str, start: float, latency_override: int | None = None) -> ExecutionAttempt:
    return ExecutionAttempt(
        status="error",
        venue_order_id=None,
        filled_size=None,
        avg_fill_price=None,
        fees_usd=None,
        venue_response={},
        error_code=code,
        error_message=msg,
        latency_ms=latency_override if latency_override is not None else int((time.perf_counter() - start) * 1000),
    )
