import hmac
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .observability.langfuse_setup import init_observability
from .routes.health import router as health_router
from .routes.crews import router as crews_router
from .routes.swarms import router as swarms_router
from . import hooks  # registers LLM + tool hooks at startup (side-effect import)  # noqa: F401
from .scheduler import create_scheduler

logger = logging.getLogger(__name__)

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
    if settings.SCHEDULER_ENABLED:
        scheduler = create_scheduler()
        scheduler.start()
        logger.info("APScheduler started")

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
async def verify_bearer(request: Request, call_next: object) -> Response:
    # B3 — whitelist preflight OPTIONS pour ne pas casser CORS.
    # Le middleware CORS répond aux preflights via add_middleware ci-dessous,
    # mais les middlewares HTTP custom (comme celui-ci) tournent AVANT le
    # middleware CORS dans l'ordre LIFO, donc on shortcut explicitement ici.
    if request.method == "OPTIONS":
        return await call_next(request)  # type: ignore[operator]

    if request.url.path == "/health":
        return await call_next(request)  # type: ignore[operator]

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return Response(content="Unauthorized", status_code=401)

    token = auth_header.removeprefix("Bearer ").strip()
    # P0.1 — constant-time comparison to prevent timing attacks
    if not (token and hmac.compare_digest(token, settings.CREWAI_ENGINE_AUTH_TOKEN)):
        return Response(content="Unauthorized", status_code=401)

    return await call_next(request)  # type: ignore[operator]


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


# Routers
app.include_router(health_router)
app.include_router(crews_router)
app.include_router(swarms_router)
