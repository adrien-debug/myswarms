"""Sizing pipeline + client_order_id derivation.

Combines: Kelly fraction → ATR target → caps → resolves a SizedOrder.
client_order_id is deterministic: sha256(request_id || ':' || leg_index)[:32].
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class NotionalResult:
    notional_usd: float
    margin_required_usd: float
    within_margin: bool
    within_notional_cap: bool


def compute_notional_and_margin(
    *,
    size_base: float,
    entry_price: float,
    leverage: float,
    available_margin_usd: float,
    per_asset_notional_cap_usd: float,
) -> NotionalResult:
    notional = size_base * entry_price
    margin_required = notional / max(leverage, 1.0)
    return NotionalResult(
        notional_usd=notional,
        margin_required_usd=margin_required,
        within_margin=margin_required <= available_margin_usd,
        within_notional_cap=notional <= per_asset_notional_cap_usd,
    )


def derive_client_order_id(request_id: UUID, leg_index: int) -> str:
    """Deterministic, idempotent on the venue side.

    Format: 32 hex chars. Fits in all venue client-order-id constraints.
    """
    seed = f"{str(request_id)}:{int(leg_index)}".encode("utf-8")
    return hashlib.sha256(seed).hexdigest()[:32]


def resolve_sized_order(
    *,
    request_id: UUID,
    leg_index: int,
    venue: str,
    symbol: str,
    side: str,                  # 'buy' | 'sell'
    final_size_base: float,
    entry_type: str,            # 'market' | 'limit'
    limit_price: float | None,
    leverage: float,
    reduce_only: bool = False,
) -> dict:
    """Build the canonical SizedOrder dict (matches sized_order.schema.json)."""
    return {
        "venue": venue,
        "symbol": symbol,
        "side": side,
        "type": entry_type,
        "size": round(final_size_base, 12),
        "limit_price": limit_price,
        "stop_price": None,
        "time_in_force": "IOC" if entry_type == "market" else "GTC",
        "reduce_only": reduce_only,
        "client_order_id": derive_client_order_id(request_id, leg_index),
        "leverage": leverage,
    }
