"""Priority scoring tool — assigns P0-P4 to classified messages using keyword rules."""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from crewai.tools import BaseTool

from ..config import settings

logger = logging.getLogger(__name__)

# Priority multipliers for urgency signals
_URGENT_BOOSTERS = [
    r"\bP0\b",
    r"\bP1\b",
    r"\bbloqué\b",
    r"\bblocked\b",
    r"\bURGENT\b",
    r"\bASAP\b",
    r"\bdeadline\b",
    r"\boverdue\b",
    r"\baujourd'hui\b",
    r"\btoday\b",
    r"\bpayment\b",
    r"\binvoice overdue\b",
    r"\bmeeting today\b",
    r"\bcritical\b",
]


def _is_vip(sender: str) -> bool:
    """Check if sender matches the VIP contacts list."""
    if not settings.VIP_CONTACTS:
        return False
    sender_lower = sender.lower()
    return any(vip.lower() in sender_lower for vip in settings.VIP_CONTACTS)


def _score_message(msg: dict[str, Any]) -> str:
    """Return P0-P4 based on message signals."""
    content = f"{msg.get('subject_or_channel', '')} {msg.get('content', '')}".lower()
    sender = msg.get("from", "")
    category = msg.get("category", "")

    # Check urgent keywords from config.
    # settings.URGENT_KEYWORDS are plain strings (user-configured) → escape metacharacters.
    # _URGENT_BOOSTERS already contain intentional regex patterns → kept as-is.
    all_urgents_escaped = [re.escape(kw) for kw in settings.URGENT_KEYWORDS]
    all_urgents = all_urgents_escaped + list(_URGENT_BOOSTERS)
    has_urgent_keyword = any(re.search(kw, content, re.IGNORECASE) for kw in all_urgents)
    is_vip_sender = _is_vip(sender)

    # Category quick-priority mapping
    category_priority_map = {
        "spam-noise": "P4",
        "to-read-later": "P3",
        "opportunity": "P2",
        "important": "P1",
        "urgent": "P0",
        "invoice": "P1",
        "appointment": "P1",
        "to-reply": "P1",
        "finance": "P1",
        "document-to-process": "P2",
    }

    if has_urgent_keyword and is_vip_sender:
        return "P0"
    if has_urgent_keyword or (is_vip_sender and category in {"important", "to-reply", "urgent"}):
        return "P0" if has_urgent_keyword and category == "urgent" else "P1"

    base = category_priority_map.get(category, "P2")
    if is_vip_sender and base in {"P2", "P3"}:
        return "P1"
    return base


class PriorityScorer(BaseTool):
    name: str = "priority_scorer"
    description: str = (
        "Assigns P0-P4 priority to each classified message in the inbox JSON list. "
        "Uses urgent keywords, VIP sender matching, category rules, and deadline detection. "
        "Input: JSON string array of classified messages. "
        "Output: same array with 'priority' field added to each message."
    )

    def _run(self, messages_json: str) -> str:
        """Score each message in the JSON list and return the enriched list."""
        try:
            messages = json.loads(messages_json)
            if not isinstance(messages, list):
                return json.dumps({"error": "Input must be a JSON array"})
        except json.JSONDecodeError as exc:
            return json.dumps({"error": f"Invalid JSON: {exc}"})

        for msg in messages:
            if isinstance(msg, dict) and "status" not in msg:
                try:
                    msg["priority"] = _score_message(msg)
                except Exception as exc:  # noqa: BLE001
                    msg["priority"] = "P3"  # safe fallback on scoring error
                    logger.warning("Priority scoring failed for msg: %s", exc)

        return json.dumps(messages, ensure_ascii=False)
