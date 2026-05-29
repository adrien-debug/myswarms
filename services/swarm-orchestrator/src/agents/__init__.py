"""4 advisory agents. Each is a single LLM call with a focused system prompt.

Outputs are structured JSON. We do NOT decide trading here; we propose context.
"""

from .base import AgentResult, run_agent
from .macro import macro_agent
from .onchain import onchain_agent
from .sentiment import sentiment_agent
from .technical import technical_agent

AGENTS = {
    "technical": technical_agent,
    "sentiment": sentiment_agent,
    "macro": macro_agent,
    "onchain": onchain_agent,
}

__all__ = ["AGENTS", "AgentResult", "run_agent"]
