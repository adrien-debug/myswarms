"""Ingester base. Each venue implements run_forever() that updates SymbolState
in place. Failures emit hedge_market_events but never crash the service.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass

from ..state import StateStore


@dataclass
class IngesterEvent:
    venue: str
    symbol: str | None
    kind: str
    severity: str
    payload: dict


class Ingester(abc.ABC):
    venue: str

    def __init__(self, symbol: str, store: StateStore) -> None:
        self.symbol = symbol
        self.store = store
        self.stopping = False
        self.connected = False

    @abc.abstractmethod
    async def run_forever(self) -> None: ...

    async def stop(self) -> None:
        self.stopping = True
