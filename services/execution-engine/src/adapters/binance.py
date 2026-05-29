"""Binance USDM-Futures adapter — minimal contract."""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any

import httpx

from .base import ExecutionAttempt

logger = logging.getLogger("hedge.exec.binance")


class BinanceAdapter:
    venue = "binance"

    def __init__(
        self,
        *,
        api_url: str,
        api_key: str | None,
        api_secret: str | None,
        dry_run: bool = True,
        timeout_seconds: int = 8,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.api_secret = api_secret
        self.dry_run = dry_run
        self.timeout = timeout_seconds
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    async def submit_order(self, order: dict[str, Any]) -> ExecutionAttempt:
        start = time.perf_counter()
        if self.dry_run:
            return _dry_run(order, start)
        if not (self.api_key and self.api_secret):
            return _err("credentials_missing", "Binance creds not configured", start)

        try:
            params = _translate(order)
            params["timestamp"] = int(time.time() * 1000)
            qs = "&".join(f"{k}={v}" for k, v in params.items())
            sig = hmac.new(
                self.api_secret.encode("utf-8"),
                qs.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            full_qs = f"{qs}&signature={sig}"
            headers = {"X-MBX-APIKEY": self.api_key}
            client = self._http()
            resp = await client.post(
                f"{self.api_url}/fapi/v1/order?{full_qs}", headers=headers
            )
            latency = int((time.perf_counter() - start) * 1000)
            if resp.status_code >= 400:
                return ExecutionAttempt(
                    status="rejected",
                    venue_order_id=None,
                    filled_size=None,
                    avg_fill_price=None,
                    fees_usd=None,
                    venue_response={"status": resp.status_code, "body": resp.text[:500]},
                    error_code=f"http_{resp.status_code}",
                    error_message=resp.text[:300],
                    latency_ms=latency,
                )
            body = resp.json()
            return ExecutionAttempt(
                status="submitted",
                venue_order_id=str(body.get("orderId")),
                filled_size=float(body.get("executedQty", 0)) or None,
                avg_fill_price=float(body.get("avgPrice", 0)) or None,
                fees_usd=None,
                venue_response=body,
                error_code=None,
                error_message=None,
                latency_ms=latency,
            )
        except httpx.TimeoutException:
            return _err("timeout", "Binance submission timed out", start)
        except Exception as e:  # noqa: BLE001
            logger.exception("Binance submit failed")
            return _err("exception", f"{type(e).__name__}: {e}", start)


def _translate(order: dict[str, Any]) -> dict[str, Any]:
    side = order["side"].upper()
    type_map = {"market": "MARKET", "limit": "LIMIT", "stop": "STOP_MARKET", "stop_limit": "STOP"}
    tif_map = {"IOC": "IOC", "GTC": "GTC", "FOK": "FOK"}
    params: dict[str, Any] = {
        "symbol": order["symbol"],
        "side": side,
        "type": type_map[order["type"]],
        "quantity": _fmt(order["size"]),
        "newClientOrderId": order["client_order_id"],
        "reduceOnly": "true" if order.get("reduce_only") else "false",
    }
    if order["type"] in ("limit", "stop_limit"):
        params["price"] = _fmt(order["limit_price"])
        params["timeInForce"] = tif_map[order["time_in_force"]]
    if order.get("stop_price"):
        params["stopPrice"] = _fmt(order["stop_price"])
    return params


def _fmt(x: float | int) -> str:
    return format(float(x), "f").rstrip("0").rstrip(".") or "0"


def _dry_run(order: dict[str, Any], start: float) -> ExecutionAttempt:
    return ExecutionAttempt(
        status="dry_run",
        venue_order_id=f"dry-binance-{order['client_order_id'][:12]}",
        filled_size=order["size"],
        avg_fill_price=order.get("limit_price") or 0.0,
        fees_usd=0.0,
        venue_response={"dry_run": True, "echoed": order},
        error_code=None,
        error_message=None,
        latency_ms=int((time.perf_counter() - start) * 1000),
    )


def _err(code: str, msg: str, start: float) -> ExecutionAttempt:
    return ExecutionAttempt(
        status="error",
        venue_order_id=None,
        filled_size=None,
        avg_fill_price=None,
        fees_usd=None,
        venue_response={},
        error_code=code,
        error_message=msg,
        latency_ms=int((time.perf_counter() - start) * 1000),
    )
