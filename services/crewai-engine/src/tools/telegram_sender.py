"""Telegram sender tool — security-level gated."""
from __future__ import annotations

import logging

from crewai.tools import BaseTool

from ..config import settings

logger = logging.getLogger(__name__)

# Actions blocked at security levels < 4
_TELEGRAM_AUTO_SEND_WHITELIST = frozenset(
    [
        "Merci, bien reçu.",
        "Confirmé.",
        "Je regarde et je reviens vers toi.",
        "On avance comme ça.",
        "Noté, merci.",
    ]
)


class TelegramSenderTool(BaseTool):
    name: str = "telegram_sender"
    description: str = (
        "Sends a message to Adrien's Telegram chat. "
        "Security level gated: at level < 4, only whitelisted simple messages are auto-sent; "
        "all other messages are saved as drafts pending human approval. "
        "Input: message text, optional chat_id (defaults to TELEGRAM_CHAT_ID from config). "
        "Output: JSON with status (sent/draft/blocked) and details."
    )

    def _run(self, message: str, chat_id: str = "") -> str:
        import json

        target_chat = chat_id or settings.TELEGRAM_CHAT_ID
        sec_level = settings.SECURITY_LEVEL

        # N1-N3: only whitelist messages may be auto-sent
        if sec_level < 4:
            is_whitelisted = any(phrase in message for phrase in _TELEGRAM_AUTO_SEND_WHITELIST)
            if not is_whitelisted:
                logger.info(
                    "Telegram send blocked at security level %d — saved as draft: %.80s...",
                    sec_level,
                    message,
                )
                return json.dumps(
                    {
                        "status": "draft",
                        "message": message,
                        "reason": f"Security level {sec_level} requires human approval before sending",
                    }
                )

        # N4: human approval required (not yet implemented — treat as draft)
        if sec_level == 4:
            return json.dumps(
                {
                    "status": "pending_approval",
                    "message": message,
                    "reason": "Security level 4: HitL approval required before sending",
                }
            )

        # N5 or whitelisted N1-N3: actually send
        if not settings.TELEGRAM_BOT_TOKEN or not target_chat:
            return json.dumps(
                {
                    "status": "skipped",
                    "reason": "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured",
                }
            )

        try:
            import httpx

            api_url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
            safe_url = "https://api.telegram.org/bot[REDACTED]/sendMessage"  # for logging only
            resp = httpx.post(
                api_url,
                json={"chat_id": target_chat, "text": message, "parse_mode": "Markdown"},
                timeout=10.0,
            )
            resp.raise_for_status()
            return json.dumps({"status": "sent", "chat_id": target_chat})
        except httpx.HTTPStatusError as exc:
            logger.error("Telegram HTTP error at %s: %d", safe_url, exc.response.status_code)
            return json.dumps({"status": "error", "error": f"HTTP {exc.response.status_code}"})
        except Exception as exc:  # noqa: BLE001
            # Do NOT log str(exc) directly — may contain the API URL with token embedded
            logger.error("Telegram send failed at %s: %s", safe_url, type(exc).__name__)
            return json.dumps({"status": "error", "error": type(exc).__name__})
