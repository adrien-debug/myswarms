"""Pytest configuration for crewai-engine tests.

Sets the minimum required environment variables before any src module is
imported. CREWAI_ENGINE_AUTH_TOKEN is required (min_length=32) by Settings —
without this the pydantic validation fails at import time.

All other secrets default to empty strings in Settings, so tests can override
them per-module via unittest.mock.patch as needed.
"""
from __future__ import annotations

import os

# Must be set before any src.* import triggers config.py → Settings().
# Value is a dummy 32-char hex string valid only in tests.
os.environ.setdefault(
    "CREWAI_ENGINE_AUTH_TOKEN",
    "00000000000000000000000000000000",  # 32 hex chars — satisfies min_length=32
)
