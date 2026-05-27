"""LLM fusion call. OpenAI-compatible client → Hypercli Kimi K2.6.

Returns a StrategySpec JSON (validated by Pydantic in the worker).
We use `response_format={"type": "json_object"}` to force JSON output.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import openai
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential_jitter

from .config import settings
from .models import SwarmSignalRead

logger = logging.getLogger("strategy-builder.llm")


SYSTEM_PROMPT = """You are the HEDGE Strategy Builder.

You receive structured signals from up to 4 advisory agents (technical, sentiment, macro, onchain).
Your job: fuse them into a single, schema-valid StrategySpec JSON.

You DO NOT decide whether to trade. You DO NOT decide final sizing. The Risk Engine does.
You produce a probabilistic recommendation. Be honest about confidence.

Return ONLY a JSON object matching exactly this shape (no extra fields, no markdown):

{
  "asset": "BTC",                          // string
  "quote": "USDT",                         // string
  "venue": "hyperliquid",                  // one of: hyperliquid|binance|bybit
  "direction": "long",                     // one of: long|short
  "timeframe": "1h",                       // one of: 1m|5m|15m|1h|4h|1d
  "entry": {
    "type": "limit",                       // one of: market|limit|conditional
    "price_hint": 50000.0,                 // number, optional
    "conditions": [
      {"indicator": "rsi_14", "op": "<", "value": 30}
    ]
  },
  "exit": {
    "take_profit": [{"price_pct": 0.02, "size_pct": 1.0}],
    "stop_loss": {"price_pct": 0.01, "type": "fixed"},
    "time_stop_seconds": 3600
  },
  "leverage_suggestion": 2.0,              // 1..50
  "risk_assumptions": {
    "expected_vol": 0.01,
    "max_loss_pct": 0.02,
    "win_rate_est": 0.55,
    "rr_ratio": 2.0
  },
  "confidence": 0.65,                      // 0..1
  "rationale": "Short rationale citing signals (≤ 400 chars)."
}

Rules:
- If signals conflict heavily, lower confidence (≤ 0.4) and pick the most defensible direction.
- If signals are weak / degraded, prefer `confidence ≤ 0.35`.
- Never invent indicator values not present in any signal.
- Never recommend leverage > 5 if vol > 3% expected_vol.
- Use `confidence` honestly — Risk Engine will reject anyway if math doesn't pass.
"""


class LLMError(Exception):
    pass


@retry(
    reraise=True,
    stop=stop_after_attempt(2),
    wait=wait_exponential_jitter(initial=0.5, max=4),
    retry=retry_if_exception_type((openai.APIConnectionError, openai.APITimeoutError, openai.RateLimitError)),
)
async def fuse_signals(
    *,
    request_id: str,
    tenant_id: str,
    raw_intent: str,
    signals: list[SwarmSignalRead],
) -> tuple[dict[str, Any], str]:
    """Call Kimi K2.6 to fuse signals. Returns (spec_dict, model)."""
    cfg = settings()
    client = openai.AsyncOpenAI(
        api_key=cfg.hypercli_api_key,
        base_url=cfg.hypercli_base_url,
        timeout=cfg.llm_timeout_seconds,
    )

    signals_payload = [
        {
            "agent": s.agent,
            "status": s.status,
            "confidence": s.confidence,
            "payload": s.payload,
        }
        for s in signals
    ]
    user_msg = json.dumps(
        {
            "request_id": request_id,
            "tenant_id": tenant_id,
            "raw_intent": raw_intent,
            "signals": signals_payload,
        },
        ensure_ascii=False,
    )

    try:
        resp = await client.chat.completions.create(
            model=cfg.hypercli_default_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
    except openai.APIError as e:
        raise LLMError(f"LLM API error: {e}") from e

    content = resp.choices[0].message.content
    if not content:
        raise LLMError("Empty LLM response")
    try:
        spec_partial = json.loads(content)
    except json.JSONDecodeError as e:
        raise LLMError(f"LLM returned invalid JSON: {e}") from e

    return spec_partial, cfg.hypercli_default_model
