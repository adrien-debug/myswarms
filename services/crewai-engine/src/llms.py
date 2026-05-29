from typing import Literal

from crewai import LLM

from .config import settings

ModelTier = Literal["fast", "balanced", "smart"]


def get_llm(tier: ModelTier = "balanced") -> LLM:
    """Factory LLM — route sur Hypercli (Kimi K2.6) via endpoint OpenAI-compatible.

    Provider unique du projet (directive explicite) : toutes les tiers (fast /
    balanced / smart) pointent sur `openai/kimi-k2.6` via `HYPERCLI_BASE_URL`.
    LiteLLM reçoit `base_url` + `api_key` issus de `settings` — aucun secret
    hardcodé.

    Hypercli avait été écarté en N-1 pour empty-responses/timeouts sur le crew
    8 agents — re-validé sous cette directive.

    Note : `temperature` non passée — évite tout rejet 400 éventuel côté provider.
    """
    mapping: dict[ModelTier, str] = {
        "fast": settings.CREWAI_DEFAULT_FAST_MODEL,
        "balanced": settings.CREWAI_DEFAULT_BALANCED_MODEL,
        "smart": settings.CREWAI_DEFAULT_SMART_MODEL,
    }
    return LLM(
        model=mapping[tier],
        base_url=settings.HYPERCLI_BASE_URL,
        api_key=settings.HYPERCLI_API_KEY,
        timeout=settings.LLM_REQUEST_TIMEOUT_SECONDS,
        max_retries=settings.LLM_MAX_RETRIES,
    )
