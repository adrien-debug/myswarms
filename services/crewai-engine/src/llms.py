from typing import Literal

from crewai import LLM

from .config import settings

ModelTier = Literal["fast", "balanced", "smart"]


def get_llm(tier: ModelTier = "balanced") -> LLM:
    """Factory LLM via Claude (Anthropic) — provider natif CrewAI.

    Bascule depuis Kimi/Hypercli (essais infructueux : empty responses sur prompts
    longs avec function-calling, 404 sur anthropic/, timeouts en ReAct).
    Sonnet 4.6 tient le rythme de 8 agents séquentiels + tools Composio.

    Note : `temperature` retirée — déprécié sur Claude 4.x (renvoie 400 si fourni).
    """
    mapping: dict[ModelTier, str] = {
        "fast": settings.CREWAI_DEFAULT_FAST_MODEL,
        "balanced": settings.CREWAI_DEFAULT_BALANCED_MODEL,
        "smart": settings.CREWAI_DEFAULT_SMART_MODEL,
    }
    return LLM(model=mapping[tier])
