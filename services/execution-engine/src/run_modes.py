"""HEDGE run modes — DRY_RUN | PAPER | LIVE.

Mode is the FIRST gate Execution checks before dispatching anything. Live
requires ALL of:
  - HEDGE_MODE == 'live'
  - global kill switch OFF
  - tenant in HEDGE_LIVE_TENANT_ALLOWLIST
  - venue in HEDGE_LIVE_VENUE_ALLOWLIST
  - per-order notional under HEDGE_LIVE_NOTIONAL_CAP_USD

If ANY check fails → fallback to DRY_RUN behaviour for this specific order
(but still log + alert; runs do not silently degrade).
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

logger = logging.getLogger("execution-engine.run_modes")


class RunMode(StrEnum):
    DRY_RUN = "dry_run"
    PAPER = "paper"
    LIVE = "live"


@dataclass(frozen=True)
class ModeContext:
    mode: RunMode
    live_tenant_allowlist: frozenset[str]
    live_venue_allowlist: frozenset[str]
    live_notional_cap_usd: float

    def allows_live(self, *, tenant_id: UUID, venue: str, notional_usd: float) -> tuple[bool, str | None]:
        """Returns (allowed_live, reject_reason). If not live-eligible the
        caller must downgrade to dry_run for this order."""
        if self.mode != RunMode.LIVE:
            return False, "mode_not_live"
        tid = str(tenant_id)
        if tid not in self.live_tenant_allowlist:
            return False, "tenant_not_in_live_allowlist"
        if venue not in self.live_venue_allowlist:
            return False, "venue_not_in_live_allowlist"
        if notional_usd > self.live_notional_cap_usd:
            return False, "notional_exceeds_live_cap"
        return True, None

    @classmethod
    def from_env(cls) -> "ModeContext":
        raw = os.getenv("HEDGE_MODE", "dry_run").lower().strip()
        try:
            mode = RunMode(raw)
        except ValueError:
            logger.warning("Unknown HEDGE_MODE=%s — defaulting to dry_run", raw)
            mode = RunMode.DRY_RUN
        tenants = frozenset(
            t.strip() for t in os.getenv("HEDGE_LIVE_TENANT_ALLOWLIST", "").split(",") if t.strip()
        )
        venues = frozenset(
            v.strip() for v in os.getenv("HEDGE_LIVE_VENUE_ALLOWLIST", "").split(",") if v.strip()
        )
        try:
            cap = float(os.getenv("HEDGE_LIVE_NOTIONAL_CAP_USD", "0"))
        except ValueError:
            cap = 0.0
        # Safety: if LIVE selected with empty allowlists, force dry_run.
        if mode == RunMode.LIVE and (not tenants or not venues or cap <= 0):
            logger.critical(
                "HEDGE_MODE=live but allowlists/cap incomplete — forcing dry_run."
            )
            mode = RunMode.DRY_RUN
        return cls(
            mode=mode,
            live_tenant_allowlist=tenants,
            live_venue_allowlist=venues,
            live_notional_cap_usd=cap,
        )
