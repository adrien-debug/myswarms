from importlib.metadata import PackageNotFoundError, version

from fastapi import APIRouter

router = APIRouter()

try:
    APP_VERSION = version("crewai-engine")
except PackageNotFoundError:
    APP_VERSION = "0.0.0-dev"


@router.get("/health")
def health_check() -> dict[str, str]:
    """Healthcheck endpoint — no auth required. Used by Railway healthcheck probe."""
    return {"status": "ok", "version": APP_VERSION}
