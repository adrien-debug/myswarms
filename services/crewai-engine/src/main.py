import hmac
import logging
import os
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .observability.langfuse_setup import init_observability
from .persistence import swarm_store, run_store
from .routes.health import router as health_router
from .routes.crews import router as crews_router
from .routes.swarms import router as swarms_router
from . import hooks  # registers LLM + tool hooks at startup (side-effect import)  # noqa: F401
from .scheduler import create_scheduler

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sentry init — fail-soft: skip silently if SENTRY_DSN is absent or empty.
# WHY: The SENTRY_AUTH_TOKEN currently returns 403 in some envs; we want the
# service to boot cleanly regardless. Re-enable sourcemaps when token is fixed.
# ---------------------------------------------------------------------------
_SENTRY_TRACES_SAMPLE_RATE_PROD = 0.1   # 10 % in production to limit quota
_SENTRY_TRACES_SAMPLE_RATE_DEV = 1.0    # 100 % in dev/staging for full visibility

_sentry_dsn = os.getenv("SENTRY_DSN", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=os.getenv("ENVIRONMENT", "development"),
        traces_sample_rate=_SENTRY_TRACES_SAMPLE_RATE_PROD if os.getenv("ENVIRONMENT") == "production" else _SENTRY_TRACES_SAMPLE_RATE_DEV,
        send_default_pii=False,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
        ],
    )
    logger.info("Sentry initialised (dsn present)")
else:
    logger.info("Sentry skipped — SENTRY_DSN not set")

# Boot observability (Langfuse + OpenTelemetry). Fail-soft if keys absent.
init_observability()


def _resolve_allowed_origins() -> list[str]:
    """Résout la liste des origines CORS autorisées.

    Priorité :
    1. `CREWAI_ENGINE_ALLOWED_ORIGINS` (CSV) — alias convivial Railway prod.
       Ex: "https://myswarms.vercel.app,https://staging.myswarms.app"
    2. `settings.ALLOWED_ORIGINS` (JSON array via pydantic-settings) — défaut
       `["http://localhost:3000"]`.
    """
    csv = os.getenv("CREWAI_ENGINE_ALLOWED_ORIGINS", "").strip()
    if csv:
        return [origin.strip() for origin in csv.split(",") if origin.strip()]
    return list(settings.ALLOWED_ORIGINS)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: RUF029
    """FastAPI lifespan — starts/stops APScheduler."""
    scheduler = None

    # Boot stale-run cleanup — fail-soft: never prevents startup.
    try:
        n_swarm = swarm_store.cleanup_stale_runs(settings.STALE_RUN_MAX_AGE_MINUTES)
        n_chief = run_store.cleanup_stale_runs(settings.STALE_RUN_MAX_AGE_MINUTES)
        logger.info(
            "Boot stale-run cleanup: %d swarm_runs + %d chief_run_log rows marked failed",
            n_swarm,
            n_chief,
        )
    except Exception as _exc:  # noqa: BLE001
        logger.warning("Boot stale-run cleanup failed (non-fatal): %s", _exc)

    if settings.SCHEDULER_ENABLED:
        scheduler = create_scheduler()
        scheduler.start()
        logger.info("APScheduler started")

        if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
            missing = []
            if not settings.TELEGRAM_BOT_TOKEN:
                missing.append("TELEGRAM_BOT_TOKEN")
            if not settings.TELEGRAM_CHAT_ID:
                missing.append("TELEGRAM_CHAT_ID")
            logger.warning(
                "Telegram digest disabled — missing env vars: %s. "
                "Morning/evening briefs will NOT be sent to Telegram.",
                ", ".join(missing),
            )

    yield  # app is running here

    if scheduler is not None:
        # wait=False — fast shutdown for Railway SIGTERM (15s grace period).
        # Running jobs receive CancelledError and update their DB status via _run_scheduled_kickoff's except block.
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")


app = FastAPI(
    title="crewai-engine",
    description="MySwarms CrewAI orchestration microservice",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — origins loaded from env var. Set restrictively in prod.
# Note FastAPI : les middlewares ajoutés via add_middleware sont exécutés
# dans l'ordre INVERSE (LIFO). On ajoute CORS APRES verify_bearer pour qu'il
# soit appelé en PREMIER sur chaque requête — sinon les preflight OPTIONS
# seraient interceptés par bearer auth et renvoient 401 (cf B3).
_ALLOWED_ORIGINS = _resolve_allowed_origins()
logger.info("CORS allowed origins: %s", _ALLOWED_ORIGINS)


# Bearer auth middleware — all routes except /health require a valid token
@app.middleware("http")
async def verify_bearer(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    # B3 — whitelist preflight OPTIONS pour ne pas casser CORS.
    # Le middleware CORS répond aux preflights via add_middleware ci-dessous,
    # mais les middlewares HTTP custom (comme celui-ci) tournent AVANT le
    # middleware CORS dans l'ordre LIFO, donc on shortcut explicitement ici.
    if request.method == "OPTIONS":
        return await call_next(request)

    if request.url.path == "/health":
        return await call_next(request)

    # Dev-only bypass : Swagger UI / OpenAPI / ReDoc accessibles sans Bearer
    # tant que ENGINE_ENV != "production". Fermé automatiquement en prod.
    if os.getenv("ENGINE_ENV", "dev").lower() != "production" and request.url.path in (
        "/docs", "/redoc", "/openapi.json",
    ):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return Response(content="Unauthorized", status_code=401)

    token = auth_header.removeprefix("Bearer ").strip()
    # P0.1 — constant-time comparison to prevent timing attacks
    if not (token and hmac.compare_digest(token, settings.CREWAI_ENGINE_AUTH_TOKEN)):
        return Response(content="Unauthorized", status_code=401)

    return await call_next(request)


# CORS middleware ajouté APRES verify_bearer pour qu'il soit le PREMIER appelé
# (Starlette empile en LIFO). De toute façon le shortcut OPTIONS dans
# verify_bearer rend l'ordre robuste.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


app.include_router(health_router)
app.include_router(crews_router)
app.include_router(swarms_router)
