"""Venue adapter base. Dumb shape — adapters MUST NOT decide whether to send."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ExecutionAttempt:
    status: str  # 'submitted' | 'filled' | 'partially_filled' | 'rejected' | 'error' | 'dry_run'
    venue_order_id: str | None
    filled_size: float | None
    avg_fill_price: float | None
    fees_usd: float | None
    venue_response: dict[str, Any]
    error_code: str | None
    error_message: str | None
    latency_ms: int


class VenueAdapter(Protocol):
    venue: str
    dry_run: bool

    async def submit_order(self, order: dict[str, Any]) -> ExecutionAttempt:
        """Submit a canonical SizedOrder dict. Idempotency: pass `client_order_id`."""
        ...
