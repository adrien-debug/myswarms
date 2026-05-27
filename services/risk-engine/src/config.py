"""Risk Engine configuration. Strict — refuses to start if any secret missing."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Service identity
    service_name: str = "risk-engine"
    service_version: str = "0.1.0"
    port: int = 8001

    # Supabase (Postgres pool)
    supabase_db_url: str = Field(..., description="Postgres connection string (pooler).")
    supabase_url: str = Field(...)
    supabase_service_role_key: str = Field(...)

    # HMAC keys (hex-encoded, possibly comma-rotated "v1:hex,v2:hex")
    strategy_signing_key: str = Field(..., description="Verifies StrategySpec signatures.")
    risk_decision_key: str = Field(..., description="Signs RiskDecision + outbox rows.")
    portfolio_signing_key: str = Field(..., description="Verifies portfolio snapshot signatures.")

    # Engine knobs (overridable per tenant via tenant_risk_profiles)
    portfolio_max_age_seconds: int = 5
    decision_default_ttl_seconds: int = 10
    worker_poll_interval_ms: int = 500
    worker_batch_size: int = 5
    worker_max_attempts: int = 3
    outbox_max_pending_depth: int = 100

    # Observability
    log_level: str = "INFO"


_settings: Settings | None = None


def settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()  # type: ignore[call-arg]
    return _settings
