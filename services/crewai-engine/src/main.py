import hmac

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .observability.langfuse_setup import init_observability
from .routes.health import router as health_router
from .routes.crews import router as crews_router

# Boot observability (Langfuse + OpenTelemetry). Fail-soft if keys absent.
init_observability()

app = FastAPI(
    title="crewai-engine",
    description="MySwarms CrewAI orchestration microservice",
    version="0.1.0",
)

# CORS — origins loaded from env var (ALLOWED_ORIGINS). Set restrictively in prod.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# Bearer auth middleware — all routes except /health require a valid token
@app.middleware("http")
async def verify_bearer(request: Request, call_next: object) -> Response:
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


# Routers
app.include_router(health_router)
app.include_router(crews_router)
