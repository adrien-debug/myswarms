import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_boot_logger = logging.getLogger(__name__)

# Dual-mode .env loading :
#   - Dev local : override=True — un .env (symlink de .env.local) DOIT gagner
#     sur les variables shell exportées historiquement, sinon une vieille clé
#     dans le shell masque silencieusement la nouvelle valeur du fichier.
#   - Prod (Railway/Vercel/Render) : override=False — les env vars d'infra sont
#     LA source de vérité. Un éventuel .env packagé par erreur ne doit jamais
#     écraser les secrets injectés par la plateforme.
# Détection : la présence d'une variable d'env spécifique au PaaS suffit pour
# basculer en "prod-mode".
_IS_PROD_ENV = any(
    os.getenv(k)
    for k in ("RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "VERCEL_ENV", "RENDER")
)
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
if _ENV_PATH.exists():
    load_dotenv(dotenv_path=_ENV_PATH, override=not _IS_PROD_ENV)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Internal auth between Next.js and crewai-engine — REQUIRED, no default
    CREWAI_ENGINE_AUTH_TOKEN: str = Field(..., min_length=32, description="Shared bearer token between Next.js and engine. Generate via `openssl rand -hex 32`.")

    # LLM providers
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    HYPERCLI_API_KEY: str = ""
    HYPERCLI_BASE_URL: str = "https://api.hypercli.com/v1"
    HYPERCLI_DEFAULT_MODEL: str = "kimi-k2.6"
    HYPERCLI_ANTHROPIC_MODEL: str = "kimi-k2.6-anthropic"

    # Tiers LLM (Hypercli / Kimi K2.6 — endpoint OpenAI-compatible, base_url=HYPERCLI_BASE_URL)
    CREWAI_DEFAULT_FAST_MODEL: str = "openai/kimi-k2.6"
    CREWAI_DEFAULT_BALANCED_MODEL: str = "openai/kimi-k2.6"
    CREWAI_DEFAULT_SMART_MODEL: str = "openai/kimi-k2.6"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Langfuse
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

    # CORS — comma-separated JSON list of allowed origins.
    # Default: localhost only. Override in Railway prod env.
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3333"]

    # Telemetry
    CREWAI_DISABLE_TELEMETRY: bool = True

    # Mock mode — set to True in test/CI environments to skip LLM + API calls
    AGENT_MOCK_MODE: bool = False

    # Composio — multi-channel tools (Gmail, Slack, Telegram, Calendar, Notion)
    COMPOSIO_API_KEY: str = ""
    COMPOSIO_USER_ID: str = "adrien"  # entity_id for multi-tenant support — TODO multi-tenant

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

    # ── Scheduler — owner attribution ────────────────────────────────────
    # owner_id attribué aux runs Chief planifiés (cron).
    # = UUID auth.users du propriétaire principal (valeur du backfill migration 0015).
    # Override via env si autre destinataire. Identifiant d'identité (non secret).
    CHIEF_SCHEDULER_OWNER_ID: str = "e0a983da-536f-4dad-a205-861acbae9468"

    # ── APScheduler ─────────────────────────────────────────────────────
    SCHEDULER_ENABLED: bool = True
    MORNING_HOUR: int = Field(default=8, ge=0, le=23)
    MORNING_MINUTE: int = Field(default=0, ge=0, le=59)
    EVENING_HOUR: int = Field(default=18, ge=0, le=23)
    EVENING_MINUTE: int = Field(default=30, ge=0, le=59)

    # Flow execution timeout — if flow.kickoff() exceeds this, status → "failed".
    # gt=0 guard: asyncio.wait_for(timeout=0) would expire immediately on every kickoff.
    # Raised from 300 to 900: Kimi K2.6 swarms with 4 tasks take 360-480s;
    # the only successful production run completed in ~250s — 900 gives headroom.
    FLOW_TIMEOUT_SECONDS: int = Field(default=900, gt=0, description="Max seconds before flow.kickoff() times out")

    # Per-task timeout multiplier for adaptive timeout calculation.
    # Used with n_tasks to compute max(FLOW_TIMEOUT_SECONDS, n_tasks * PER_TASK_TIMEOUT_SECONDS).
    PER_TASK_TIMEOUT_SECONDS: int = Field(
        default=120,
        gt=0,
        description="Per-task timeout budget (seconds). Adaptive timeout = max(FLOW_TIMEOUT_SECONDS, n_tasks * this).",
    )

    # Stale run cleanup — runs stuck in 'running' for longer than this are marked failed.
    STALE_RUN_MAX_AGE_MINUTES: int = Field(
        default=30,
        gt=0,
        description="Runs in 'running' status older than this (minutes) are marked failed at boot and by the cleanup job.",
    )

    # Interval between stale-run cleanup sweeps (APScheduler job).
    STALE_RUN_CLEANUP_INTERVAL_MINUTES: int = Field(
        default=10,
        gt=0,
        description="Interval in minutes between periodic stale-run cleanup sweeps.",
    )

    # Max lag (seconds) before APScheduler skips a misfired job entirely.
    MISFIRE_GRACE_TIME_SECONDS: int = Field(default=300, gt=0)  # max lag before skipping misfired job

    # Architect Agent — timeout (s) de génération de spec de swarm. La
    # génération inclut jusqu'à 3 appels LLM Opus (retry) — d'où une marge
    # plus large qu'un simple appel. gt=0 : 0 expirerait immédiatement.
    ARCHITECT_TIMEOUT_SECONDS: int = Field(
        default=180,
        gt=0,
        description="Max seconds before architect spec generation times out",
    )


settings = Settings()

# ── P2-1 : silence LiteLLM botocore pre-load noise at ERROR level.
# WHY: litellm imports botocore at startup and emits WARNING-level noise about
# missing AWS credentials even when AWS is never used. Setting ERROR silences
# those warnings without hiding real LiteLLM errors (which are ERROR+).
import warnings  # noqa: E402

logging.getLogger("LiteLLM").setLevel(logging.ERROR)

# ── P2-2 : suppress pydantic UserWarning about non-serializable callbacks.
# WHY: CrewAI passes function callbacks into pydantic models; pydantic emits
# "function callbacks cannot be serialized and will prevent checkpointing"
# on every crew creation. We silence this one specific message — NOT all
# UserWarnings — so that we don't accidentally swallow unrelated warnings.
warnings.filterwarnings(
    "ignore",
    message=r".*callbacks cannot be serialized.*",
    category=UserWarning,
)

# ── Boot-time misconfig warnings ─────────────────────────────────────────────
# Ne cassent PAS le boot — logging uniquement. Permet d'identifier les
# configurations partielles avant que les agents tombent en erreur à l'exécution.
#
# Politique Hypercli-only : HYPERCLI_API_KEY est désormais la seule clé LLM
# critique. ANTHROPIC_API_KEY et OPENAI_API_KEY sont optionnelles (abaissées
# en info) — aucun chemin de production ne devrait les appeler directement.
# COMPOSIO_API_KEY reste critique (tools Composio indépendants du provider LLM).
_CRITICAL_API_KEYS = {
    "HYPERCLI_API_KEY": settings.HYPERCLI_API_KEY,
    "COMPOSIO_API_KEY": settings.COMPOSIO_API_KEY,
}
for _key, _val in _CRITICAL_API_KEYS.items():
    if not _val:
        _boot_logger.warning(
            "Boot misconfiguration: %s is empty — agents using this provider will fail at runtime.",
            _key,
        )

# Clés optionnelles (plus utilisées en production — Hypercli-only) : simple info.
_OPTIONAL_API_KEYS = {
    "ANTHROPIC_API_KEY": settings.ANTHROPIC_API_KEY,
    "OPENAI_API_KEY": settings.OPENAI_API_KEY,
}
for _key, _val in _OPTIONAL_API_KEYS.items():
    if not _val:
        _boot_logger.info(
            "Boot info: %s is empty (optional — Hypercli-only policy, no LLM call expected on this provider).",
            _key,
        )

# COMPOSIO_USER_ID garde sa valeur par défaut en production → risque multi-tenant.
if settings.COMPOSIO_USER_ID == "adrien" and _IS_PROD_ENV:
    _boot_logger.warning(
        "Boot misconfiguration: COMPOSIO_USER_ID is still the default value 'adrien' in production — "
        "set a proper user/entity_id for multi-tenant isolation."
    )
