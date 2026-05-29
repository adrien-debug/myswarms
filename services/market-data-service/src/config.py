from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    service_name: str = "market-data-service"
    service_version: str = "0.1.0"
    port: int = 8004

    supabase_db_url: str = Field(...)
    market_signing_key: str = Field(..., description="HMAC-signs every snapshot row.")

    # Ingest plan: comma-separated "venue:symbol", e.g. "hyperliquid:BTC-USD,binance:BTCUSDT"
    ingest_pairs: str = Field("hyperliquid:BTC-USD,binance:BTCUSDT")

    # Cadence
    market_snapshot_interval_seconds: float = 1.0
    orderbook_snapshot_interval_seconds: float = 0.5
    rest_fallback_after_ws_silence_seconds: float = 5.0
    snapshot_max_age_seconds: int = 5         # advertised freshness contract

    # Buffer sizes for rolling stats
    log_returns_window_bars: int = 500
    atr_period: int = 14

    # Exchanges
    binance_ws_url: str = "wss://fstream.binance.com/ws"
    binance_rest_url: str = "https://fapi.binance.com"
    hyperliquid_ws_url: str = "wss://api.hyperliquid.xyz/ws"
    hyperliquid_rest_url: str = "https://api.hyperliquid.xyz"

    log_level: str = "INFO"


_settings: Settings | None = None


def settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()  # type: ignore[call-arg]
    return _settings


def parse_ingest_pairs(raw: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        venue, _, symbol = part.partition(":")
        if not symbol:
            continue
        out.append((venue.strip(), symbol.strip()))
    return out
