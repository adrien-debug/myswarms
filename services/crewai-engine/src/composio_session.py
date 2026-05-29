"""Composio session factory — fail-soft if API key missing or auth fails.

FIX (composio 1.0.0-rc2): In the new SDK, ``session.tools()`` always returns
the same 6 meta/router tools (COMPOSIO_SEARCH_TOOLS, COMPOSIO_MULTI_EXECUTE_TOOL,
etc.) regardless of how many toolkits are requested.  To get the actual
per-toolkit tools you must pass ``session_preset=SESSION_PRESET_DIRECT_TOOLS``
and ``preload={"tools": "all"}``.  Without these flags, a 3-toolkit request
was silently returning only 6 tools instead of ~224.

DURABILITY additions:
- Hard tool cap      : at most ``_MAX_TOOLS_PER_AGENT`` tools returned per call.
  Budget is distributed **round-robin across toolkits** (grouped by uppercase
  prefix before the first ``_`` in the tool name, e.g. ``GMAIL_SEND_EMAIL``
  → toolkit ``GMAIL``).  This ensures no requested toolkit is fully silenced
  when multiple toolkits share the budget.  A ``[COMPOSIO_TOOLS_TRUNCATED]``
  warning reports the final per-toolkit breakdown.
- Tool-count logging : every successful fetch logs the raw count via
  ``logger.info`` so the number is always visible in Langfuse/grep.
- Exponential retry  : 3 attempts, backoff 2 s → 4 s on *transient* errors
  only.  Non-transient errors (auth 401/403, invalid API key) are NOT retried
  and do NOT arm the circuit breaker.
- Circuit breaker    : if > 5 cumulative *transient* failures in a 5-minute
  sliding window, short-circuit and return [] without hitting the network.
- [COMPOSIO_DOWN] tag: visible warning on every transient failure path.
- [COMPOSIO_AUTH] tag: distinct warning for auth / non-retriable errors.
- Cache behaviour    : successes cached; failures never cached (allows recovery).

Thread-safety note on ``time.sleep``:
    ``get_composio_tools_for_toolkits`` is a *synchronous* function.  It is
    called from ``create_agents()`` → ``create_dynamic_crew()`` → the Flow's
    ``run_crew()`` step, which itself runs inside ``asyncio.to_thread()`` (see
    ``routes/swarms.py : _execute_dynamic_flow_background``).  The function
    therefore runs in a worker thread, **outside** the asyncio event loop.
    Using ``time.sleep()`` for backoff is safe in this context and avoids the
    complexity of a full async rewrite.

Thread-safety note on shared state:
    ``_cb_failure_timestamps`` and ``_tools_cache`` may be accessed from
    multiple worker threads concurrently (parallel kickoffs via
    ``asyncio.to_thread``).  A module-level ``threading.Lock`` (``_state_lock``)
    guards all read-modify-write sequences on these structures.  The lock is
    held only during accesses to the deque/dict — never while performing I/O —
    so it does not serialise network calls or introduce deadlocks.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import deque

from .config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hard cap on the number of tools injected into a single agent.
# ~60 tools ≈ 6–12 k tokens of tool definitions; beyond this cost/latency
# grows non-linearly.  Adjust via _MAX_TOOLS_PER_AGENT if toolkits grow.
# ---------------------------------------------------------------------------
_MAX_TOOLS_PER_AGENT = 60

# ---------------------------------------------------------------------------
# Module-level cache: maps sorted tuple of toolkit slugs → fetched tools list.
# Populated on first kickoff; subsequent calls hit the cache instantly.
# ---------------------------------------------------------------------------
_tools_cache: dict[tuple[str, ...], list] = {}

# ---------------------------------------------------------------------------
# Circuit-breaker state — armed only by *transient* (network/5xx) failures.
# Auth errors (401/403/ApiKeyError) bypass this entirely.
# ---------------------------------------------------------------------------
_CB_FAILURE_THRESHOLD = 5      # open after this many transient failures in the window
_CB_WINDOW_SECONDS = 300       # 5-minute sliding window
_cb_failure_timestamps: deque[float] = deque()  # timestamps of recent transient failures

# ---------------------------------------------------------------------------
# FIX C: Module-level lock — guards read-modify-write on CB deque and cache.
# Held only during accesses to _cb_failure_timestamps / _tools_cache, never
# during I/O, so it cannot serialise network calls or create deadlocks.
# ---------------------------------------------------------------------------
_state_lock = threading.Lock()


def _cb_is_open() -> bool:
    """Return True if the circuit breaker is open (too many recent transient failures)."""
    now = time.monotonic()
    with _state_lock:
        # Prune timestamps outside the window
        while _cb_failure_timestamps and _cb_failure_timestamps[0] < now - _CB_WINDOW_SECONDS:
            _cb_failure_timestamps.popleft()
        return len(_cb_failure_timestamps) > _CB_FAILURE_THRESHOLD


def _cb_record_failure() -> None:
    """Record a transient failure timestamp for the circuit breaker."""
    with _state_lock:
        _cb_failure_timestamps.append(time.monotonic())


def _is_auth_error(exc: Exception) -> bool:
    """Return True if *exc* is a non-retriable auth / bad-key error.

    Matches:
    - composio_client.AuthenticationError  (401 from stainless-generated SDK)
    - composio_client.PermissionDeniedError (403 from stainless-generated SDK)
    - composio.exceptions.ApiKeyError (and its subclasses, e.g. ApiKeyNotProvidedError)
    - composio.exceptions.HTTPError with status_code 401 or 403
    - Any exception whose string representation contains "unauthorized",
      "invalid api key", or "forbidden" (case-insensitive safety net for
      future SDK changes or plain HTTP exceptions from underlying requests).

    FIX B: ``composio_client`` (stainless-generated) raises
    ``AuthenticationError`` (401) and ``PermissionDeniedError`` (403) which do
    NOT inherit from ``composio.exceptions.HTTPError`` or ``ApiKeyError``.
    They were previously misclassified as transient errors, causing spurious
    retries and false circuit-breaker arming.  The import is defensive
    (try/except) in case the package path changes across SDK versions.
    """
    # FIX B — composio_client stainless-generated exceptions (401 / 403)
    try:
        from composio_client._exceptions import (  # type: ignore[import-untyped] -- package sans stubs mypy
            AuthenticationError as _CCAuth,
            PermissionDeniedError as _CCPerm,
        )
        if isinstance(exc, (_CCAuth, _CCPerm)):
            return True
    except Exception:  # noqa: BLE001
        pass

    # composio high-level SDK exceptions
    try:
        from composio.exceptions import ApiKeyError, HTTPError  # type: ignore[import-untyped] -- package sans stubs mypy
        if isinstance(exc, ApiKeyError):
            return True
        if isinstance(exc, HTTPError) and exc.status_code in (401, 403):
            return True
    except ImportError:
        pass

    # String-based safety net for HTTP clients that raise generic exceptions
    msg = str(exc).lower()
    return any(kw in msg for kw in ("unauthorized", "invalid api key", "forbidden", "401", "403"))


# ---------------------------------------------------------------------------
# FIX A: Round-robin toolkit-aware truncation
# ---------------------------------------------------------------------------

def _toolkit_prefix(tool: object) -> str:
    """Return the toolkit group for a Composio-wrapped tool.

    CrewAI-wrapped Composio tools are ``crewai.tools.BaseTool`` instances
    whose ``.name`` attribute equals the tool slug (e.g. ``GMAIL_SEND_EMAIL``).
    The toolkit is the uppercase prefix before the first ``_``.

    If the name contains no ``_`` (unexpected), the full name is used as the
    group key so the tool is never silently discarded.
    """
    name: str = getattr(tool, "name", "") or ""
    return name.split("_")[0].upper() if "_" in name else name.upper()


def _round_robin_cap(tools: list, cap: int) -> list:
    """Distribute *tools* across toolkit groups using round-robin up to *cap*.

    Groups tools by their toolkit prefix (``_toolkit_prefix``), then picks one
    tool from each group in turn until the cap is reached.  This guarantees
    that every toolkit present in *tools* contributes at least one entry in the
    result as long as ``cap >= number_of_distinct_toolkits``.

    Returns the capped list and logs a per-toolkit breakdown via
    ``[COMPOSIO_TOOLS_TRUNCATED]``.
    """
    if len(tools) <= cap:
        return tools

    # Group tools by toolkit prefix, preserving original order within each group
    from collections import defaultdict
    groups: dict[str, list] = defaultdict(list)
    for tool in tools:
        groups[_toolkit_prefix(tool)].append(tool)

    # Round-robin: pick one tool per group per round until budget exhausted
    result: list = []
    group_keys = list(groups.keys())
    iterators = {k: iter(v) for k, v in groups.items()}
    while len(result) < cap:
        advanced = False
        for key in group_keys:
            if len(result) >= cap:
                break
            try:
                result.append(next(iterators[key]))
                advanced = True
            except StopIteration:
                pass
        if not advanced:
            # All iterators exhausted (shouldn't happen since len > cap, but guard)
            break

    # Build per-toolkit breakdown for the log
    from collections import Counter
    breakdown = Counter(_toolkit_prefix(t) for t in result)
    breakdown_str = " ".join(f"{k}={v}" for k, v in sorted(breakdown.items()))
    logger.warning(
        "[COMPOSIO_TOOLS_TRUNCATED] raw=%d capped to %d: %s",
        len(tools),
        len(result),
        breakdown_str,
    )
    return result


# ---------------------------------------------------------------------------
# Retry helpers
# ---------------------------------------------------------------------------
_RETRY_ATTEMPTS = 3
# Backoff before attempt 2, then 3.  Attempt 4 is never reached (loop ends).
_RETRY_BACKOFF_SECONDS = [2, 4]


def get_composio_tools_for_toolkits(toolkits: list[str]) -> list:
    """Return Composio tool objects for the given toolkit names.

    Uses ``SESSION_PRESET_DIRECT_TOOLS`` + ``preload={"tools": "all"}`` to
    ensure the SDK returns actual per-toolkit tools (not the 6 meta-router
    tools that the default mode always returns).  The returned list is capped
    at ``_MAX_TOOLS_PER_AGENT`` tools using a round-robin per-toolkit
    distribution so that no requested toolkit is silenced by the cap.

    Results are cached in ``_tools_cache`` by sorted toolkit set.  First call
    per unique toolkit combination triggers a real Composio network request;
    subsequent calls return the cached list instantly.

    Returns an empty list (fail-soft) if:
    - ``COMPOSIO_API_KEY`` is not set
    - The composio / composio-crewai packages are not installed
    - The circuit breaker is open (> 5 transient failures in the last 5 min)
    - All retry attempts are exhausted (transient error)
    - A non-retriable auth error occurs (401 / 403 / ApiKeyError)

    Tags emitted:
    - ``[COMPOSIO_DOWN]``  — transient / retriable error paths.
    - ``[COMPOSIO_AUTH]``  — non-retriable auth / bad-key errors (no retry,
      no CB arming).
    - ``[COMPOSIO_TOOLS_TRUNCATED]`` — when raw count exceeds _MAX_TOOLS_PER_AGENT;
      includes per-toolkit breakdown (e.g. "capped to 60: GMAIL=20 SLACK=20 TELEGRAM=20").
    """
    cache_key = tuple(sorted(toolkits))

    # FIX C: atomic check-then-read under lock
    with _state_lock:
        cached = _tools_cache.get(cache_key)
    if cached is not None:
        logger.debug(
            "Composio cache hit for toolkits=%s (%d tools)",
            list(cache_key),
            len(cached),
        )
        return cached

    if not settings.COMPOSIO_API_KEY:
        logger.warning(
            "[COMPOSIO_DOWN] COMPOSIO_API_KEY not set — returning empty tools "
            "(not cached; allows retry after key injection)"
        )
        return []

    # --- Circuit breaker check ------------------------------------------------
    if _cb_is_open():
        logger.warning(
            "[COMPOSIO_DOWN] Circuit breaker OPEN (>%d transient failures in last %ds) — "
            "skipping Composio network call for toolkits=%s",
            _CB_FAILURE_THRESHOLD,
            _CB_WINDOW_SECONDS,
            list(toolkits),
        )
        return []

    # --- Import guard ---------------------------------------------------------
    try:
        from composio import Composio, SESSION_PRESET_DIRECT_TOOLS  # type: ignore[import-untyped] -- package sans stubs mypy
        from composio_crewai import CrewAIProvider  # type: ignore[import-untyped] -- package sans stubs mypy
    except ImportError:
        logger.warning(
            "[COMPOSIO_DOWN] composio / composio-crewai not installed — "
            "skipping Composio tools"
        )
        # Cache permanently: a missing package won't fix itself at runtime.
        with _state_lock:
            _tools_cache[cache_key] = []
        return []

    # --- Retry loop with exponential backoff (transient errors only) ----------
    last_exc: Exception | None = None
    for attempt in range(1, _RETRY_ATTEMPTS + 1):
        try:
            composio = Composio(
                api_key=settings.COMPOSIO_API_KEY,
                provider=CrewAIProvider(),
            )
            # FIX: SESSION_PRESET_DIRECT_TOOLS + preload={"tools": "all"} is
            # required in composio 1.0.0-rc2+ to expose real per-toolkit tools
            # from session.tools().  Without this, the SDK always returns 6
            # meta-router tools regardless of how many toolkits are specified.
            session = composio.create(
                user_id=settings.COMPOSIO_USER_ID,
                toolkits=toolkits,
                session_preset=SESSION_PRESET_DIRECT_TOOLS,
                preload={"tools": "all"},
            )
            tools = session.tools()
            raw_count = len(tools)
            logger.info(
                "Composio %s -> %d tools (attempt %d/%d, user_id=%s)",
                toolkits,
                raw_count,
                attempt,
                _RETRY_ATTEMPTS,
                settings.COMPOSIO_USER_ID,
            )

            # FIX A: round-robin cap — ensures no toolkit is fully silenced.
            if raw_count > _MAX_TOOLS_PER_AGENT:
                tools = _round_robin_cap(tools, _MAX_TOOLS_PER_AGENT)

            # FIX C: atomic write under lock
            with _state_lock:
                _tools_cache[cache_key] = tools
            return tools

        except Exception as exc:  # noqa: BLE001
            if _is_auth_error(exc):
                # Non-retriable: bad API key or forbidden — log and bail out
                # immediately without touching the circuit breaker.
                logger.warning(
                    "[COMPOSIO_AUTH] Non-retriable auth error for toolkits=%s "
                    "(not retrying, CB not armed): %s",
                    toolkits,
                    exc,
                )
                return []

            # Transient error: record for CB and maybe retry.
            last_exc = exc
            _cb_record_failure()
            logger.warning(
                "[COMPOSIO_DOWN] Composio attempt %d/%d failed for toolkits=%s: %s",
                attempt,
                _RETRY_ATTEMPTS,
                toolkits,
                exc,
            )
            if attempt < _RETRY_ATTEMPTS:
                backoff = _RETRY_BACKOFF_SECONDS[attempt - 1]
                logger.debug(
                    "Composio retry in %ds (attempt %d → %d)",
                    backoff,
                    attempt,
                    attempt + 1,
                )
                # time.sleep is safe here: this function always executes inside
                # a worker thread (asyncio.to_thread) — never on the event loop.
                # See module docstring for the full call-chain rationale.
                time.sleep(backoff)

    # All transient attempts exhausted
    logger.warning(
        "[COMPOSIO_DOWN] All %d Composio attempts exhausted for toolkits=%s — "
        "returning [] (fail-soft). Last error: %s",
        _RETRY_ATTEMPTS,
        toolkits,
        last_exc,
    )
    # Do NOT cache failures — a later call should retry (transient errors).
    return []
