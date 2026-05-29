"""Strategy Builder config."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    service_name: str = "strategy-builder"
    service_version: str = "0.1.0"
    port: int = 8003

    supabase_db_url: str = Field(...)
    supabase_url: str = Field(...)
    supabase_service_role_key: str = Field(...)

    strategy_signing_key: str = Field(...)

    # LLM (Hypercli Kimi K2.6)
    hypercli_api_key: str = Field(...)
    hypercli_base_url: str = "https://api.hypercli.com/v1"
    hypercli_default_model: str = "kimi-k2.6"
    llm_timeout_seconds: int = 30
    llm_max_retries: int = 2

    # Langfuse (optional but recommended)
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "https://cloud.langfuse.com"

    worker_poll_interval_ms: int = 500
    worker_batch_size: int = 3
    worker_max_attempts: int = 2

    log_level: str = "INFO"


_settings: Settings | None = None


def settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()  # type: ignore[call-arg]
    return _settings
