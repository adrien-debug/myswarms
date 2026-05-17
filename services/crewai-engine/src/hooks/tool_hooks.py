"""Tool call hooks — security level gates for send/delete actions."""
from __future__ import annotations

import logging
import re

from crewai.hooks import ToolCallHookContext, after_tool_call, before_tool_call

from ..config import settings

logger = logging.getLogger(__name__)

# Regex pour convertir PascalCase/camelCase → UPPER_SNAKE
_PASCAL_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")

# Actions blocked at security level < 4 (auto-send protection).
# Comparaisons faites en UPPER pour gérer les variantes Composio
# (GMAIL_SEND_EMAIL, gmail_send_email, GmailSendEmail, etc.)
_BLOCKED_BELOW_N4 = frozenset(
    {
        "GMAIL_SEND_EMAIL",
        "GMAIL_REPLY_TO_EMAIL",   # reply = envoi sortant
        "GMAIL_FORWARD_EMAIL",    # forward = envoi sortant
        "SLACK_SEND_MESSAGE",
        "SLACK_CREATE_DM",
        "SLACK_REPLY_IN_THREAD",  # reply dans un thread Slack
        "SLACK_SEND_DM",          # alias Composio possible pour CREATE_DM
        "TELEGRAM_SEND_MESSAGE",
        "GOOGLECALENDAR_CREATE_EVENT",  # block calendar creation at N1-N3
    }
)

# Irreversible actions — blocked below N5
_BLOCKED_BELOW_N5 = frozenset(
    {
        "GMAIL_DELETE_EMAIL",
        "GMAIL_TRASH_EMAIL",   # legacy Composio
        "GMAIL_MOVE_TO_TRASH", # Composio 0.13+ alias
    }
)


@before_tool_call
def enforce_security_level(context: ToolCallHookContext) -> bool | None:
    """Block send/delete actions based on current SECURITY_LEVEL setting."""
    # Normaliser en UPPER_SNAKE pour être insensible aux variantes Composio
    # (snake_case, UPPER_CASE, PascalCase/camelCase)
    # Ex: "GmailForwardEmail" → "GMAIL_FORWARD_EMAIL"
    raw = context.tool_name or ""
    tool_name_upper = _PASCAL_RE.sub("_", raw).upper()
    sec_level = settings.SECURITY_LEVEL

    if tool_name_upper in _BLOCKED_BELOW_N4 and sec_level < 4:
        logger.warning(
            "Tool %s BLOCKED — security level %d < 4 (auto-send protection)",
            context.tool_name,
            sec_level,
        )
        return False  # block the tool call

    if tool_name_upper in _BLOCKED_BELOW_N5 and sec_level < 5:
        logger.warning(
            "Tool %s BLOCKED — security level %d < 5 (irreversible action protection)",
            context.tool_name,
            sec_level,
        )
        return False

    return None  # allow


@after_tool_call
def audit_sensitive_tool_result(context: ToolCallHookContext) -> str | None:
    """Audit hook — log les résultats d'outils sensibles pour traçabilité.

    Ce hook est un hook d'AUDIT (logging), pas de scrubbing réel.
    Il ne modifie pas le résultat (les agents ont besoin des adresses e-mail
    pour rédiger des réponses). Pour un scrubbing réel, implémenter un
    hook dédié avec redaction explicite.
    """
    if context.tool_result and isinstance(context.tool_result, str):
        # Only apply to potentially sensitive tools
        # Normalize tool_name to UPPER_SNAKE (same as enforce_security_level)
        raw = context.tool_name or ""
        tool_name_upper = _PASCAL_RE.sub("_", raw).upper()
        sensitive_tools = {"GMAIL_FETCH_EMAILS", "GMAIL_GET_MESSAGE", "SLACK_FETCH_MESSAGES"}
        if tool_name_upper in sensitive_tools:
            logger.debug("Processed sensitive tool result from %s", tool_name_upper)
    return None  # don't modify result
