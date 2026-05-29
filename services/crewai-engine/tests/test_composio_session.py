"""Tests for services/crewai-engine/src/composio_session.py.

All tests mock the Composio SDK so that CI does not require a real API key or
network access.

Strategy: we patch ``src.composio_session.settings`` directly (a module-level
attribute) so that pydantic Settings validation is not triggered for tests.
The composio SDK imports are replaced via ``sys.modules`` patching so that no
real network call is ever made.

Test coverage:
1. Multi-toolkit union — 3 toolkits mocked at 6 tools each → 18 tools total.
2. Retry on transient error — 1st call raises, 2nd succeeds → tools returned,
   no exception propagated.
3. Circuit breaker — 6 consecutive failures → 7th call does NOT invoke the SDK
   (circuit open).
4. Fail-soft on missing COMPOSIO_API_KEY — returns [] without exception.
5. FIX A: Round-robin truncation — 3 toolkits at 80/100/40 tools, cap 60 →
   each toolkit has ≥1 tool and total ≤ 60.
6. FIX B: composio_client.AuthenticationError → no retry, CB not armed, [] returned.
"""
from __future__ import annotations

import sys
import time
import types
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Ensure src/ is importable (the package is installed via `uv sync --dev`)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Helpers to build fake tools
# ---------------------------------------------------------------------------

def _make_fake_tool(name: str) -> MagicMock:
    t = MagicMock()
    t.name = name
    return t


def _make_fake_tools(prefix: str, count: int) -> list[MagicMock]:
    return [_make_fake_tool(f"{prefix}_TOOL_{i}") for i in range(count)]


# ---------------------------------------------------------------------------
# Helpers to build fake Composio module + session
# ---------------------------------------------------------------------------

def _make_composio_module(
    MockComposio: MagicMock,
    session_preset: str = "direct_tools",
) -> types.ModuleType:
    """Build a fake 'composio' module with Composio class + SESSION_PRESET_DIRECT_TOOLS."""
    mod = types.ModuleType("composio")
    mod.Composio = MockComposio  # type: ignore[attr-defined] -- ModuleType dynamique, pas de stubs
    mod.SESSION_PRESET_DIRECT_TOOLS = session_preset  # type: ignore[attr-defined] -- ModuleType dynamique, pas de stubs
    return mod


def _make_composio_crewai_module(MockCrewAIProvider: MagicMock) -> types.ModuleType:
    """Build a fake 'composio_crewai' module with CrewAIProvider class."""
    mod = types.ModuleType("composio_crewai")
    mod.CrewAIProvider = MockCrewAIProvider  # type: ignore[attr-defined] -- ModuleType dynamique, pas de stubs
    return mod


def _build_composio_mock(
    *,
    tools_per_call: list[list[MagicMock]] | None = None,
    side_effect: list[Any] | None = None,
) -> tuple[MagicMock, MagicMock]:
    """Return (MockComposio class, MockCrewAIProvider class).

    ``tools_per_call``: successive lists returned by session.tools().
    ``side_effect``   : successive side effects on session.tools() — can mix
                        exceptions and lists.
    """
    mock_session = MagicMock()
    if side_effect is not None:
        mock_session.tools.side_effect = side_effect
    elif tools_per_call is not None:
        mock_session.tools.side_effect = tools_per_call

    mock_composio_instance = MagicMock()
    mock_composio_instance.create.return_value = mock_session

    MockComposio = MagicMock(return_value=mock_composio_instance)
    MockCrewAIProvider = MagicMock(return_value=MagicMock())

    return MockComposio, MockCrewAIProvider


# ---------------------------------------------------------------------------
# Shared fixture: import composio_session once, reset state per test
# ---------------------------------------------------------------------------

@pytest.fixture()
def cs():
    """Import (or retrieve cached) composio_session module and reset its state."""
    import src.composio_session as _cs
    # Reset module state between tests
    _cs._tools_cache.clear()
    _cs._cb_failure_timestamps.clear()
    return _cs


@pytest.fixture(autouse=True)
def _patch_settings(cs):
    """Patch settings with safe defaults for every test in this module."""
    fake_settings = MagicMock()
    fake_settings.COMPOSIO_API_KEY = "ak_test_key"
    fake_settings.COMPOSIO_USER_ID = "test_user"
    with patch.object(cs, "settings", fake_settings):
        yield fake_settings


@pytest.fixture(autouse=True)
def _no_real_sleep(cs, monkeypatch):
    """Replace time.sleep inside composio_session to avoid real delays."""
    monkeypatch.setattr(cs.time, "sleep", lambda _: None)


# ---------------------------------------------------------------------------
# 1. Multi-toolkit union
# ---------------------------------------------------------------------------

class TestMultiToolkitUnion:
    """get_composio_tools_for_toolkits(['a','b','c']) must return the union
    of tools for all requested toolkits, not just 6 meta-router tools."""

    def test_three_toolkits_return_union(self, cs) -> None:
        """3 toolkits with 6 tools each → 18 tools total."""
        all_tools = (
            _make_fake_tools("GMAIL", 6)
            + _make_fake_tools("SLACK", 6)
            + _make_fake_tools("TELEGRAM", 6)
        )
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            tools_per_call=[all_tools]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            tools = cs.get_composio_tools_for_toolkits(["gmail", "slack", "telegram"])

        assert len(tools) == 18, f"Expected 18 tools, got {len(tools)}"

    def test_session_created_with_direct_tools_preset(self, cs) -> None:
        """create() must be called with SESSION_PRESET_DIRECT_TOOLS and preload=all."""
        all_tools = _make_fake_tools("GMAIL", 6)
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            tools_per_call=[all_tools]
        )
        fake_preset = "direct_tools"
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio, session_preset=fake_preset),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            cs.get_composio_tools_for_toolkits(["gmail"])

        composio_instance = MockComposio.return_value
        create_kwargs = composio_instance.create.call_args.kwargs
        assert create_kwargs.get("session_preset") == fake_preset, (
            "session_preset must be SESSION_PRESET_DIRECT_TOOLS"
        )
        assert create_kwargs.get("preload") == {"tools": "all"}, (
            "preload must be {'tools': 'all'}"
        )

    def test_results_cached_on_second_call(self, cs) -> None:
        """Second call with same toolkits must use cache (no extra SDK call)."""
        all_tools = _make_fake_tools("GMAIL", 6)
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            tools_per_call=[all_tools]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            result1 = cs.get_composio_tools_for_toolkits(["gmail"])
            result2 = cs.get_composio_tools_for_toolkits(["gmail"])

        assert result1 is result2, "Second call must return cached list (same object)"
        assert MockComposio.return_value.create.call_count == 1, (
            "SDK create() must be called exactly once"
        )


# ---------------------------------------------------------------------------
# 2. Retry on transient error
# ---------------------------------------------------------------------------

class TestRetry:
    """Verify exponential retry: 1st call fails, 2nd succeeds → tools returned."""

    def test_retry_succeeds_on_second_attempt(self, cs) -> None:
        """First session.tools() raises, second succeeds — tools returned, no exception."""
        good_tools = _make_fake_tools("GMAIL", 6)
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            side_effect=[RuntimeError("transient network error"), good_tools]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            tools = cs.get_composio_tools_for_toolkits(["gmail"])

        assert len(tools) == 6, f"Expected 6 tools after retry, got {len(tools)}"
        session = MockComposio.return_value.create.return_value
        assert session.tools.call_count == 2, "Expected exactly 2 attempts"

    def test_all_retries_exhausted_returns_empty(self, cs) -> None:
        """All 3 retry attempts fail → [] returned without exception."""
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            side_effect=[
                RuntimeError("fail 1"),
                RuntimeError("fail 2"),
                RuntimeError("fail 3"),
            ]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            tools = cs.get_composio_tools_for_toolkits(["gmail"])

        assert tools == [], "Should return [] after exhausting all retries"
        assert ("gmail",) not in cs._tools_cache, "Failures must not be cached"

    def test_failures_not_cached(self, cs) -> None:
        """A failed call must not be cached; the next call must retry successfully."""
        call_count = {"n": 0}
        good_tools = _make_fake_tools("SLACK", 4)

        def _side_effect():
            call_count["n"] += 1
            if call_count["n"] <= 3:  # first call exhausts all 3 retries
                raise RuntimeError("transient")
            return good_tools  # second invocation's first attempt succeeds

        mock_session = MagicMock()
        mock_session.tools.side_effect = _side_effect
        mock_composio_instance = MagicMock()
        mock_composio_instance.create.return_value = mock_session
        MockComposio = MagicMock(return_value=mock_composio_instance)
        MockCrewAIProvider = MagicMock(return_value=MagicMock())

        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            # First invocation: all retries fail
            result1 = cs.get_composio_tools_for_toolkits(["slack"])
            assert result1 == [], "First call should fail-soft to []"

            # Manually clear circuit breaker so second call is not short-circuited
            cs._cb_failure_timestamps.clear()

            # Second invocation: should succeed (not served from cache of failure)
            result2 = cs.get_composio_tools_for_toolkits(["slack"])

        assert len(result2) == 4, f"Second call should succeed, got {len(result2)}"


# ---------------------------------------------------------------------------
# 3. Circuit breaker
# ---------------------------------------------------------------------------

class TestCircuitBreaker:
    """After > 5 failures in 5 min, the 7th call must not invoke the SDK."""

    def test_circuit_opens_after_threshold(self, cs) -> None:
        """6 consecutive failures → circuit open → next call returns [] without SDK call."""
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            side_effect=[RuntimeError("fail")] * 100
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            # Each call exhausts 3 retry attempts → records 3 failures.
            # After 2 calls (6 failures) the circuit breaker opens.
            for i in range(2):
                cs.get_composio_tools_for_toolkits([f"toolkit_{i}"])

            # Circuit should now be open
            assert cs._cb_is_open(), "Circuit breaker should be open after 6 failures"

            session = MockComposio.return_value.create.return_value
            calls_before = session.tools.call_count

            # Next call (circuit open) — must NOT hit the SDK
            result = cs.get_composio_tools_for_toolkits(["new_toolkit"])

        assert result == [], "Circuit-open call must return []"
        assert session.tools.call_count == calls_before, (
            "SDK must not be called when circuit is open"
        )

    def test_circuit_resets_after_window(self, cs) -> None:
        """Failures older than the window don't count; circuit closes again."""
        good_tools = _make_fake_tools("GMAIL", 6)
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            tools_per_call=[good_tools]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            # Inject old timestamps (beyond the 5-min window)
            old_ts = time.monotonic() - (cs._CB_WINDOW_SECONDS + 10)
            for _ in range(cs._CB_FAILURE_THRESHOLD + 2):
                cs._cb_failure_timestamps.append(old_ts)

            # Circuit should be closed (all timestamps expired)
            assert not cs._cb_is_open(), "Circuit should be closed after window expiry"

            result = cs.get_composio_tools_for_toolkits(["gmail"])

        assert len(result) == 6


# ---------------------------------------------------------------------------
# 4. Fail-soft on missing API key
# ---------------------------------------------------------------------------

class TestFailSoft:
    """Missing COMPOSIO_API_KEY → [] without exception."""

    def test_empty_api_key_returns_empty_list(self, cs, _patch_settings) -> None:
        _patch_settings.COMPOSIO_API_KEY = ""
        MockComposio, MockCrewAIProvider = _build_composio_mock(tools_per_call=[[]])

        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            tools = cs.get_composio_tools_for_toolkits(["gmail", "slack"])

        assert tools == [], "Missing API key must return [] fail-soft"
        assert MockComposio.return_value.create.call_count == 0, (
            "SDK must never be called when API key is absent"
        )

    def test_none_api_key_returns_empty_list(self, cs, _patch_settings) -> None:
        _patch_settings.COMPOSIO_API_KEY = None
        MockComposio, MockCrewAIProvider = _build_composio_mock(tools_per_call=[[]])

        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            tools = cs.get_composio_tools_for_toolkits(["gmail"])

        assert tools == []

    def test_import_error_cached_as_empty(self, cs) -> None:
        """If composio package is not installed, result is cached as [] permanently."""
        with patch.dict(sys.modules, {"composio": None, "composio_crewai": None}):
            tools = cs.get_composio_tools_for_toolkits(["gmail"])

        assert tools == [], "ImportError must return [] fail-soft"
        # Must be cached as [] (package won't re-appear at runtime)
        assert ("gmail",) in cs._tools_cache, "ImportError result must be cached"


# ---------------------------------------------------------------------------
# 5. FIX A — Round-robin truncation preserves all toolkits
# ---------------------------------------------------------------------------

class TestRoundRobinTruncation:
    """FIX A: When total tools > cap, every toolkit must be represented."""

    def test_three_toolkits_all_represented_after_cap(self, cs) -> None:
        """3 toolkits with 80/100/40 tools, cap=60 → each toolkit has ≥1 tool."""
        # Build tools with UPPERCASE_TOOLKIT prefix so _toolkit_prefix works
        gmail_tools = _make_fake_tools("GMAIL", 80)
        slack_tools = _make_fake_tools("SLACK", 100)
        telegram_tools = _make_fake_tools("TELEGRAM", 40)
        all_tools = gmail_tools + slack_tools + telegram_tools  # 220 total

        MockComposio, MockCrewAIProvider = _build_composio_mock(
            tools_per_call=[all_tools]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            tools = cs.get_composio_tools_for_toolkits(["gmail", "slack", "telegram"])

        assert len(tools) <= cs._MAX_TOOLS_PER_AGENT, (
            f"Result must not exceed cap ({cs._MAX_TOOLS_PER_AGENT}), got {len(tools)}"
        )
        names = [t.name for t in tools]
        gmail_count = sum(1 for n in names if n.startswith("GMAIL_"))
        slack_count = sum(1 for n in names if n.startswith("SLACK_"))
        telegram_count = sum(1 for n in names if n.startswith("TELEGRAM_"))

        assert gmail_count >= 1, f"GMAIL must have ≥1 tool after cap, got {gmail_count}"
        assert slack_count >= 1, f"SLACK must have ≥1 tool after cap, got {slack_count}"
        assert telegram_count >= 1, f"TELEGRAM must have ≥1 tool after cap, got {telegram_count}"

    def test_round_robin_distribution_is_roughly_balanced(self, cs) -> None:
        """Round-robin: with equal-sized groups, distribution should be uniform."""
        # 3 toolkits × 30 tools each = 90 total; cap = 60 → 20 per toolkit
        all_tools = (
            _make_fake_tools("GMAIL", 30)
            + _make_fake_tools("SLACK", 30)
            + _make_fake_tools("TELEGRAM", 30)
        )
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            tools_per_call=[all_tools]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            tools = cs.get_composio_tools_for_toolkits(["gmail", "slack", "telegram"])

        names = [t.name for t in tools]
        gmail_count = sum(1 for n in names if n.startswith("GMAIL_"))
        slack_count = sum(1 for n in names if n.startswith("SLACK_"))
        telegram_count = sum(1 for n in names if n.startswith("TELEGRAM_"))

        # Each toolkit should get exactly 20 (60 / 3)
        assert gmail_count == 20, f"Expected 20 GMAIL tools, got {gmail_count}"
        assert slack_count == 20, f"Expected 20 SLACK tools, got {slack_count}"
        assert telegram_count == 20, f"Expected 20 TELEGRAM tools, got {telegram_count}"

    def test_no_truncation_when_under_cap(self, cs) -> None:
        """When total tools < cap, all tools must be returned unchanged."""
        all_tools = (
            _make_fake_tools("GMAIL", 6)
            + _make_fake_tools("SLACK", 6)
            + _make_fake_tools("TELEGRAM", 6)
        )
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            tools_per_call=[all_tools]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            tools = cs.get_composio_tools_for_toolkits(["gmail", "slack", "telegram"])

        assert len(tools) == 18, f"Expected all 18 tools when under cap, got {len(tools)}"


# ---------------------------------------------------------------------------
# 6. FIX B — composio_client auth errors → no retry, CB not armed
# ---------------------------------------------------------------------------

class TestComposioClientAuthErrors:
    """FIX B: composio_client.AuthenticationError / PermissionDeniedError must
    be detected as non-retriable auth errors — no retry, CB not armed, [] returned."""

    def _make_cc_auth_error(self) -> Exception:
        """Build a real composio_client.AuthenticationError instance."""
        from composio_client._exceptions import AuthenticationError
        # AuthenticationError requires an httpx.Response; use a mock
        response_mock = MagicMock()
        response_mock.status_code = 401
        response_mock.headers = {}
        response_mock.text = "Unauthorized"
        try:
            return AuthenticationError(response=response_mock, body={})
        except Exception:
            # Fallback: just instantiate with no args if signature differs
            err = Exception("401 Unauthorized")
            err.__class__ = AuthenticationError
            return err

    def _make_cc_perm_error(self) -> Exception:
        """Build a real composio_client.PermissionDeniedError instance."""
        from composio_client._exceptions import PermissionDeniedError
        response_mock = MagicMock()
        response_mock.status_code = 403
        response_mock.headers = {}
        response_mock.text = "Forbidden"
        try:
            return PermissionDeniedError(response=response_mock, body={})
        except Exception:
            err = Exception("403 Forbidden")
            err.__class__ = PermissionDeniedError
            return err

    def test_is_auth_error_detects_authentication_error(self, cs) -> None:
        """_is_auth_error() must return True for composio_client.AuthenticationError."""
        from composio_client._exceptions import AuthenticationError
        # Create instance via isinstance check (class itself is enough)
        # Use the string-based fallback as a cross-check
        assert cs._is_auth_error(AuthenticationError.__new__(AuthenticationError)), (
            "_is_auth_error must detect AuthenticationError"
        )

    def test_is_auth_error_detects_permission_denied_error(self, cs) -> None:
        """_is_auth_error() must return True for composio_client.PermissionDeniedError."""
        from composio_client._exceptions import PermissionDeniedError
        assert cs._is_auth_error(PermissionDeniedError.__new__(PermissionDeniedError)), (
            "_is_auth_error must detect PermissionDeniedError"
        )

    def test_authentication_error_no_retry_no_cb(self, cs) -> None:
        """composio_client.AuthenticationError: no retry, CB not armed, [] returned."""
        from composio_client._exceptions import AuthenticationError
        auth_err = AuthenticationError.__new__(AuthenticationError)

        MockComposio, MockCrewAIProvider = _build_composio_mock(
            side_effect=[auth_err]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            result = cs.get_composio_tools_for_toolkits(["gmail"])

        assert result == [], "Auth error must return []"

        # Only 1 attempt must have been made (no retry)
        session = MockComposio.return_value.create.return_value
        assert session.tools.call_count == 1, (
            f"Auth error must not retry; expected 1 call, got {session.tools.call_count}"
        )

        # Circuit breaker must NOT be armed
        assert not cs._cb_is_open(), "CB must not be armed after auth error"
        assert len(cs._cb_failure_timestamps) == 0, (
            "No transient failure must be recorded for auth errors"
        )

    def test_permission_denied_error_no_retry_no_cb(self, cs) -> None:
        """composio_client.PermissionDeniedError: no retry, CB not armed, [] returned."""
        from composio_client._exceptions import PermissionDeniedError
        perm_err = PermissionDeniedError.__new__(PermissionDeniedError)

        MockComposio, MockCrewAIProvider = _build_composio_mock(
            side_effect=[perm_err]
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            result = cs.get_composio_tools_for_toolkits(["slack"])

        assert result == [], "PermissionDenied must return []"

        session = MockComposio.return_value.create.return_value
        assert session.tools.call_count == 1, (
            f"PermissionDenied must not retry; expected 1 call, got {session.tools.call_count}"
        )
        assert not cs._cb_is_open(), "CB must not be armed after permission denied error"
        assert len(cs._cb_failure_timestamps) == 0

    def test_transient_error_still_retries_and_arms_cb(self, cs) -> None:
        """RuntimeError (transient): must still retry 3× and arm the CB."""
        MockComposio, MockCrewAIProvider = _build_composio_mock(
            side_effect=[RuntimeError("net")] * 3
        )
        with patch.dict(
            sys.modules,
            {
                "composio": _make_composio_module(MockComposio),
                "composio_crewai": _make_composio_crewai_module(MockCrewAIProvider),
            },
        ):
            result = cs.get_composio_tools_for_toolkits(["gmail"])

        assert result == []
        session = MockComposio.return_value.create.return_value
        assert session.tools.call_count == 3, "Transient error must exhaust all 3 retries"
        assert len(cs._cb_failure_timestamps) == 3, (
            "3 transient failures must be recorded in CB"
        )
