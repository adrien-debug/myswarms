import os

from ..config import settings


def init_observability() -> None:
    """Initialise Langfuse + OpenTelemetry auto-instrumentation. Idempotent."""
    if settings.CREWAI_DISABLE_TELEMETRY:
        os.environ["CREWAI_DISABLE_TELEMETRY"] = "true"

    if not (settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY):
        # Fail-soft: skip observability if keys are absent (local dev without Langfuse)
        return

    os.environ["LANGFUSE_PUBLIC_KEY"] = settings.LANGFUSE_PUBLIC_KEY
    os.environ["LANGFUSE_SECRET_KEY"] = settings.LANGFUSE_SECRET_KEY
    os.environ["LANGFUSE_HOST"] = settings.LANGFUSE_HOST

    from langfuse import get_client

    langfuse = get_client()
    langfuse.auth_check()
    # openlit non utilisé : conflit opentelemetry-sdk entre openlit>=1.30 et crewai 1.14.4.
    # Langfuse v3 auto-instrumentation CrewAI via OpenTelemetry exporter natif suffit.
