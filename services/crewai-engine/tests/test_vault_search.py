"""Tests for VaultSearchTool — fail-soft behavior on all error paths."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
import requests


@pytest.fixture(autouse=True)
def _set_cortex_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default: Cortex configured. Tests overriding this can clear it."""
    monkeypatch.setenv("CORTEX_URL", "http://test-cortex:3030")
    monkeypatch.setenv("CORTEX_API_KEY", "test-key")
    # Force settings reload to pick up env
    from src import config
    config.settings = config.Settings()


def _make_tool():
    from src.tools.vault_search import VaultSearchTool
    return VaultSearchTool()


def test_success_returns_formatted_markdown():
    tool = _make_tool()
    fake_resp = MagicMock()
    fake_resp.ok = True
    fake_resp.status_code = 200
    fake_resp.json.return_value = {
        "query": "test",
        "count": 1,
        "results": [
            {"path": "02_Projets/X.md", "title": "Projet X", "score": 0.92, "content_preview": "Décision clé sur X"},
        ],
    }
    with patch("src.tools.vault_search.requests.post", return_value=fake_resp):
        out = tool._run("decision sur X")
    assert "Projet X" in out
    assert "02_Projets/X.md" in out
    assert "Décision clé" in out
    assert "Vault unavailable" not in out


def test_timeout_fail_soft():
    tool = _make_tool()
    with patch("src.tools.vault_search.requests.post", side_effect=requests.Timeout()):
        out = tool._run("test")
    assert out.startswith("Vault unavailable")
    assert "timeout" in out.lower()


def test_5xx_fail_soft():
    tool = _make_tool()
    fake_resp = MagicMock()
    fake_resp.ok = False
    fake_resp.status_code = 503
    with patch("src.tools.vault_search.requests.post", return_value=fake_resp):
        out = tool._run("test")
    assert out.startswith("Vault unavailable")
    assert "503" in out


def test_cortex_url_missing_fail_soft():
    # Replace the settings object seen by vault_search with one having empty CORTEX_URL.
    from src import config
    from src.tools import vault_search

    empty_settings = config.Settings.model_construct(
        CREWAI_ENGINE_AUTH_TOKEN="00000000000000000000000000000000",
        CORTEX_URL="",
        CORTEX_API_KEY="",
    )
    with patch.object(vault_search, "settings", empty_settings):
        tool = _make_tool()
        out = tool._run("test")
    assert out.startswith("Vault unavailable")
    assert "not configured" in out.lower()
