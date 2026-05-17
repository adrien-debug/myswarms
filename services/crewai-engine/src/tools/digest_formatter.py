"""Digest formatter tool — formats daily summary for Telegram."""
from __future__ import annotations

import json
import logging
from datetime import datetime

from crewai.tools import BaseTool

logger = logging.getLogger(__name__)

# Telegram message length constraints: keep action previews short to avoid truncated bubbles.
_ACTION_PREVIEW_LEN = 100   # chars — fits in a single Telegram line without wrapping
_SCHEDULE_DESC_LEN = 80     # slightly shorter for schedule slots (time prefix adds ~8 chars)

_TRIGGER_LABELS = {
    "morning": "Résumé du matin",
    "evening": "Résumé du soir",
    "intraday": "Alerte intraday",
    "on_demand": "Résumé à la demande",
    "webhook": "Mise à jour",
}


class DigestFormatterTool(BaseTool):
    name: str = "digest_formatter"
    description: str = (
        "Formats the aggregated daily brief data (inbox items, schedule, drafts, action items) "
        "into a structured Telegram-ready markdown summary. "
        "Input: JSON string with keys 'inbox_summary', 'schedule', 'drafts', 'action_items', 'trigger'. "
        "Output: formatted markdown string ready to send via Telegram."
    )

    def _run(self, data_json: str, trigger: str = "on_demand") -> str:
        """Format daily brief data into Telegram markdown."""
        try:
            data = json.loads(data_json) if isinstance(data_json, str) else data_json
        except json.JSONDecodeError:
            data = {"raw": str(data_json)}

        now = datetime.now().strftime("%d/%m %H:%M")
        title = _TRIGGER_LABELS.get(trigger, "Résumé")
        lines = [f"*{title}* — {now}\n"]

        # Urgent / P0-P1 items
        items = data.get("top_items") or data.get("action_items") or []
        p0 = [i for i in items if i.get("priority") == "P0"] if items else []
        p1 = [i for i in items if i.get("priority") == "P1"] if items else []

        if p0:
            lines.append("*Urgent (P0):*")
            for item in p0[:3]:
                action = item.get("action") or item.get("subject_or_channel") or item.get("content", "")
                lines.append(f"• {action[:_ACTION_PREVIEW_LEN]}")
            lines.append("")

        if p1:
            lines.append("*Important (P1):*")
            for item in p1[:5]:
                action = item.get("action") or item.get("subject_or_channel") or item.get("content", "")
                lines.append(f"• {action[:_ACTION_PREVIEW_LEN]}")
            lines.append("")

        # Schedule preview
        schedule = data.get("schedule") or []
        if schedule:
            lines.append("*Planning suggéré:*")
            for slot in schedule[:4]:
                time = slot.get("time", "?")
                desc = slot.get("description", "")[:_SCHEDULE_DESC_LEN]
                lines.append(f"• {time} — {desc}")
            lines.append("")

        # Drafts
        drafts = data.get("drafts") or []
        draft_count = len(drafts) if isinstance(drafts, list) else data.get("drafts_prepared", 0)
        if draft_count:
            lines.append(f"_{draft_count} brouillon(s) prêt(s) — en attente de validation_\n")

        # Footer
        inbox = data.get("inbox_summary", {})
        if inbox:
            total = inbox.get("total", "?")
            lines.append(f"_{total} messages traités_")

        return "\n".join(lines)
