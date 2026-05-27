"""Dead-man switch heartbeat worker.

Calls Hyperliquid scheduleCancel every `deadman_interval_seconds`. If this
process dies, HL auto-cancels all open orders for the account within
`deadman_seconds` of the last heartbeat.

This is venue-side belt-and-braces in addition to our own kill switches.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os

from ..adapters.hyperliquid import HyperliquidAdapter
from ..config import settings

logger = logging.getLogger("execution-engine.deadman")


class DeadmanWorker:
    def __init__(self) -> None:
        cfg = settings()
        self.interval = int(os.getenv("DEADMAN_INTERVAL_SECONDS", "20"))
        self.deadman_seconds = int(os.getenv("DEADMAN_TIMEOUT_SECONDS", "60"))
        self.adapter = HyperliquidAdapter(
            api_url=cfg.hyperliquid_api_url,
            account_address=cfg.hyperliquid_account_address,
            secret_key=cfg.hyperliquid_secret_key,
            dry_run=cfg.dry_run,
            timeout_seconds=cfg.order_send_timeout_seconds,
            deadman_seconds=self.deadman_seconds,
        )
        self.stopping = False
        self.consecutive_failures = 0

    async def run_forever(self) -> None:
        if self.adapter.dry_run:
            logger.info("Dead-man worker disabled (dry_run mode)")
            return
        if not (self.adapter.account_address and self.adapter.secret_key):
            logger.warning("Dead-man worker disabled (no HL creds)")
            return
        logger.info(
            "Dead-man worker starting",
            extra={"interval": self.interval, "timeout": self.deadman_seconds},
        )
        while not self.stopping:
            try:
                ok = await self.adapter.schedule_deadman()
                if ok:
                    self.consecutive_failures = 0
                else:
                    self.consecutive_failures += 1
                    if self.consecutive_failures >= 3:
                        logger.critical(
                            "Dead-man heartbeat failing %d cycles in a row — venue may not auto-cancel",
                            self.consecutive_failures,
                        )
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Dead-man heartbeat failed")
                self.consecutive_failures += 1
            await asyncio.sleep(self.interval)
