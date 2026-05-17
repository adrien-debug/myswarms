from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Force-load .env with override=True BEFORE Settings instantiation.
# pydantic-settings v2 prioritizes os.environ over .env by default — this is the
# inverse of what we want for myswarms: a stale key exported in the shell session
# would silently mask the value in .env.local (symlinked as services/.../.env).
# override=True makes .env values win over pre-existing environment variables.
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
if _ENV_PATH.exists():
    load_dotenv(dotenv_path=_ENV_PATH, override=True)


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

    # Mock mode — set to True in test/CI environments to skip LLM + API calls
    AGENT_MOCK_MODE: bool = False

    # Composio — multi-channel tools (Gmail, Slack, Telegram, Calendar, Notion)
    COMPOSIO_API_KEY: str = ""
    COMPOSIO_USER_ID: str = "adrien"  # entity_id for multi-tenant support

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""  # chat_id for Adrien's Telegram

    # Daily Chief of Staff — User preferences
    USER_TIMEZONE: str = "Asia/Dubai"
    USER_LANGUAGE: str = "fr"
    VIP_CONTACTS: list[str] = Field(
        default=[],
        description=(
            "JSON array of VIP email patterns. "
            "Example: '[\"boss@example.com\",\"client@\"]'. "
            "CSV NOT supported — must be a valid JSON array."
        ),
    )
    URGENT_KEYWORDS: list[str] = Field(
        default=[
            "urgent",
            "asap",
            "deadline",
            "aujourd'hui",
            "bloqué",
            "important",
            "payment",
            "invoice",
            "overdue",
            "meeting today",
        ],
        description=(
            "JSON array of urgent keywords (plain strings, not regex). "
            "Example: '[\"urgent\",\"asap\",\"today\"]'. "
            "CSV NOT supported — must be a valid JSON array."
        ),
    )

    # Security level (1-5). Default 2: drafts prepared, no auto-send.
    SECURITY_LEVEL: int = Field(default=2, ge=1, le=5)

    # ── APScheduler ─────────────────────────────────────────────────────
    SCHEDULER_ENABLED: bool = True
    MORNING_HOUR: int = Field(default=8, ge=0, le=23)
    MORNING_MINUTE: int = Field(default=0, ge=0, le=59)
    EVENING_HOUR: int = Field(default=18, ge=0, le=23)
    EVENING_MINUTE: int = Field(default=30, ge=0, le=59)

    # Flow execution timeout — if flow.kickoff() exceeds this, status → "failed".
    # gt=0 guard: asyncio.wait_for(timeout=0) would expire immediately on every kickoff.
    FLOW_TIMEOUT_SECONDS: int = Field(default=300, gt=0, description="Max seconds before flow.kickoff() times out")

    # Max lag (seconds) before APScheduler skips a misfired job entirely.
    MISFIRE_GRACE_TIME_SECONDS: int = Field(default=300, gt=0)  # max lag before skipping misfired job


settings = Settings()
