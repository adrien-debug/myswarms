from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    service_name: str = "swarm-orchestrator"
    service_version: str = "0.1.0"
    port: int = 8000

    supabase_db_url: str = Field(...)
    supabase_url: str = Field(...)
    supabase_service_role_key: str = Field(...)

    swarm_signing_key: str = Field(...)

    hypercli_api_key: str = Field(...)
    hypercli_base_url: str = "https://api.hypercli.com/v1"
    hypercli_default_model: str = "kimi-k2.6"

    agent_timeout_seconds: int = 30
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
