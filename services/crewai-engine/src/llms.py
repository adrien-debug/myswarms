from typing import Literal

from crewai import LLM

from .config import settings

ModelTier = Literal["fast", "balanced", "smart"]

# TODO: Future — custom BaseLLM bridge for Hypercli fallback (Kimi K2.6).
# Use openai.OpenAI(api_key=settings.HYPERCLI_API_KEY, base_url=settings.HYPERCLI_BASE_URL).


def get_llm(tier: ModelTier = "balanced") -> LLM:
    """Factory LLM par tier coût/qualité. Utilise Claude via CrewAI natif (anthropic/...)."""
    mapping: dict[ModelTier, str] = {
        "fast": settings.CREWAI_DEFAULT_FAST_MODEL,
        "balanced": settings.CREWAI_DEFAULT_BALANCED_MODEL,
        "smart": settings.CREWAI_DEFAULT_SMART_MODEL,
    }
    return LLM(model=mapping[tier], temperature=0.2)
