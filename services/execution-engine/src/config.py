"""Execution Engine config. Refuses to start without explicit secrets."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    service_name: str = "execution-engine"
    service_version: str = "0.1.0"
    port: int = 8002

    supabase_db_url: str = Field(...)
    supabase_url: str = Field(...)
    supabase_service_role_key: str = Field(...)

    risk_decision_key: str = Field(..., description="Verifies decision + outbox sigs.")
    portfolio_signing_key: str = Field(..., description="Signs portfolio snapshots written by exec.")

    # Dry-run flag: when true, NO real order leaves the service. Used for shadow mode.
    dry_run: bool = True

    # Venue credentials (only the venues we actively support v0.1).
    hyperliquid_api_url: str = "https://api.hyperliquid.xyz"
    hyperliquid_account_address: str | None = None
    hyperliquid_secret_key: str | None = None  # raw private key (env only)

    binance_api_url: str = "https://fapi.binance.com"
    binance_api_key: str | None = None
    binance_api_secret: str | None = None

    # Worker tuning
    worker_poll_interval_ms: int = 250
    worker_batch_size: int = 5
    worker_max_attempts: int = 3
    order_send_timeout_seconds: int = 8

    log_level: str = "INFO"


_settings: Settings | None = None


def settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()  # type: ignore[call-arg]
    return _settings
