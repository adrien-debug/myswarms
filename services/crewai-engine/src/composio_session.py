"""Composio session factory — fail-soft if API key missing or auth fails."""
from __future__ import annotations

import logging

from .config import settings

logger = logging.getLogger(__name__)

# Module-level cache: maps frozenset of toolkit slugs → fetched tools list.
# Populated on first kickoff; subsequent kickoffs (and concurrent ones after
# the first has resolved) hit the cache instantly — no Composio network call.
# Key is tuple[str, ...] (sorted) for hashability.
_tools_cache: dict[tuple[str, ...], list] = {}


def get_composio_tools_for_toolkits(toolkits: list[str]) -> list:
    """Return Composio tool objects for the given toolkit names.

    Results are cached in _tools_cache by sorted toolkit set. First call per
    unique toolkit combination triggers a real Composio network request; all
    subsequent calls (including concurrent kickoffs after first resolution)
    return the cached list instantly.

    Returns an empty list if:
    - COMPOSIO_API_KEY is not set
    - The toolkit authorization hasn't been completed (OAuth not done)
    - Any other connection failure

    Fail-soft: callers (agents) will simply have no tools for that toolkit.
    """
    cache_key = tuple(sorted(toolkits))

    if cache_key in _tools_cache:
        logger.debug(
            "Composio cache hit for toolkits=%s (%d tools)",
            list(cache_key),
            len(_tools_cache[cache_key]),
        )
        return _tools_cache[cache_key]

    if not settings.COMPOSIO_API_KEY:
        logger.warning("COMPOSIO_API_KEY not set — returning empty tools (not cached, allows retry after key injection)")
        return []

    try:
        from composio_crewai import CrewAIProvider  # type: ignore[import-untyped]
        from composio import Composio  # type: ignore[import-untyped]

        # NOTE: Composio toolkit slugs may vary by account/version.
        # Common slugs: "google_calendar", "googlecalendar", "gcalendar".
        # Verify slug via: composio apps list | grep -i calendar
        # If get_composio_tools_for_toolkits returns [], check slug and OAuth auth status.
        composio = Composio(
            api_key=settings.COMPOSIO_API_KEY,
            provider=CrewAIProvider(),
        )
        session = composio.create(
            user_id=settings.COMPOSIO_USER_ID,
            toolkits=toolkits,
        )
        tools = session.tools()
        logger.info(
            "Composio session created for user_id=%s, toolkits=%s, tools=%d",
            settings.COMPOSIO_USER_ID,
            toolkits,
            len(tools),
        )
        _tools_cache[cache_key] = tools
        return tools
    except ImportError:
        logger.warning("composio / composio-crewai not installed — skipping Composio tools")
        _tools_cache[cache_key] = []
        return []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Composio session failed for toolkits=%s: %s", toolkits, exc)
        # Do not cache failures — next call should retry (transient errors).
        return []
