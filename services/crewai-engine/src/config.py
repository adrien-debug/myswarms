from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Internal auth between Next.js and crewai-engine — REQUIRED, no default
    CREWAI_ENGINE_AUTH_TOKEN: str

    # LLM providers
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    HYPERCLI_API_KEY: str = ""
    HYPERCLI_BASE_URL: str = "https://api.hypercli.com/v1"
    HYPERCLI_DEFAULT_MODEL: str = "kimi-k2.6"
    HYPERCLI_ANTHROPIC_MODEL: str = "kimi-k2.6-anthropic"

    # Claude model tiers
    CREWAI_DEFAULT_FAST_MODEL: str = "anthropic/claude-haiku-4-5-20251001"
    CREWAI_DEFAULT_BALANCED_MODEL: str = "anthropic/claude-sonnet-4-6"
    CREWAI_DEFAULT_SMART_MODEL: str = "anthropic/claude-opus-4-7"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Langfuse
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

    # CORS — comma-separated JSON list of allowed origins.
    # Default: localhost only. Override in Railway prod env.
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # Telemetry
    CREWAI_DISABLE_TELEMETRY: bool = True


settings = Settings()
