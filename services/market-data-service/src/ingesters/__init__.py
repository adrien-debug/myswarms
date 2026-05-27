from .base import Ingester
from .binance_ws import BinanceIngester
from .hyperliquid_ws import HyperliquidIngester

INGESTERS: dict[str, type[Ingester]] = {
    "binance": BinanceIngester,
    "hyperliquid": HyperliquidIngester,
}

__all__ = ["Ingester", "BinanceIngester", "HyperliquidIngester", "INGESTERS"]
