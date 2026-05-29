"""Venue adapters.

Strict contract: each adapter implements `submit_order(order_payload) -> ExecutionAttempt`.
NO reasoning, NO conditional logic beyond what the venue requires for valid submission.
"""

from .base import ExecutionAttempt, VenueAdapter
from .binance import BinanceAdapter
from .hyperliquid import HyperliquidAdapter

__all__ = [
    "ExecutionAttempt",
    "VenueAdapter",
    "HyperliquidAdapter",
    "BinanceAdapter",
]
