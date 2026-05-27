"""Generic LLM agent runner. Common contract for all 4 swarm agents."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable

import openai

from ..config import settings

logger = logging.getLogger("swarm.agent")


@dataclass(frozen=True)
class AgentResult:
    agent: str
    status: str             # 'ok' | 'degraded' | 'failed' | 'timeout'
    payload: dict[str, Any]
    confidence: float | None
    model: str | None
    latency_ms: int
    langfuse_trace_id: str | None = None


async def run_agent(
    *,
    name: str,
    system_prompt: str,
    user_payload: dict[str, Any],
) -> AgentResult:
    """Single agent call. Returns a structured AgentResult — never raises."""
    cfg = settings()
    start = time.perf_counter()
    client = openai.AsyncOpenAI(
        api_key=cfg.hypercli_api_key,
        base_url=cfg.hypercli_base_url,
        timeout=cfg.agent_timeout_seconds,
    )
    try:
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=cfg.hypercli_default_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
            ),
            timeout=cfg.agent_timeout_seconds,
        )
    except asyncio.TimeoutError:
        return AgentResult(
            agent=name,
            status="timeout",
            payload={"reason": "agent_timeout"},
            confidence=None,
            model=cfg.hypercli_default_model,
            latency_ms=int((time.perf_counter() - start) * 1000),
        )
    except openai.APIError as e:
        return AgentResult(
            agent=name,
            status="failed",
            payload={"reason": f"api_error: {type(e).__name__}", "detail": str(e)[:300]},
            confidence=None,
            model=cfg.hypercli_default_model,
            latency_ms=int((time.perf_counter() - start) * 1000),
        )
    except Exception as e:  # noqa: BLE001
        return AgentResult(
            agent=name,
            status="failed",
            payload={"reason": f"unexpected: {type(e).__name__}", "detail": str(e)[:300]},
            confidence=None,
            model=cfg.hypercli_default_model,
            latency_ms=int((time.perf_counter() - start) * 1000),
        )

    content = resp.choices[0].message.content or ""
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return AgentResult(
            agent=name,
            status="degraded",
            payload={"raw": content[:1000], "reason": "non_json_output"},
            confidence=None,
            model=cfg.hypercli_default_model,
            latency_ms=int((time.perf_counter() - start) * 1000),
        )

    confidence = payload.get("confidence")
    if isinstance(confidence, (int, float)):
        confidence = float(max(0.0, min(1.0, confidence)))
    else:
        confidence = None

    return AgentResult(
        agent=name,
        status="ok",
        payload=payload,
        confidence=confidence,
        model=cfg.hypercli_default_model,
        latency_ms=int((time.perf_counter() - start) * 1000),
    )


def agent_factory(
    name: str, system_prompt: str
) -> Callable[[dict[str, Any]], "asyncio.Future[AgentResult]"]:
    """Bind name + prompt; return an awaitable factory."""
    async def _run(ctx: dict[str, Any]) -> AgentResult:
        return await run_agent(name=name, system_prompt=system_prompt, user_payload=ctx)
    return _run
