"""APScheduler — morning + evening Chief of Staff cron jobs."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import settings

logger = logging.getLogger(__name__)


async def _run_scheduled_kickoff(trigger: str) -> None:
    """Execute a Chief of Staff flow run for scheduled trigger (morning/evening).

    Persistence (run_store) is imported here — fail-soft if Supabase not configured.
    """
    logger.info("Scheduled kickoff starting — trigger=%s", trigger)
    kickoff_id: str | None = None

    try:
        # Deferred import: ChiefOfStaffFlow imports crews/agents which may not be fully initialized
        # at scheduler module load time.
        from .flows.chief_of_staff_flow import ChiefOfStaffFlow
        from .persistence import run_store

        kickoff_id = str(uuid4())
        started_at = datetime.now(timezone.utc).isoformat()

        run_store.save_run(
            kickoff_id,
            trigger,
            "running",
            started_at,
            owner_id=settings.CHIEF_SCHEDULER_OWNER_ID or None,
        )

        flow = ChiefOfStaffFlow()
        result = await asyncio.wait_for(
            asyncio.to_thread(
                flow.kickoff,
                inputs={
                    "trigger": trigger,
                    "user_timezone": settings.USER_TIMEZONE,
                    "user_language": settings.USER_LANGUAGE,
                    "mock_mode": settings.AGENT_MOCK_MODE,
                },
            ),
            timeout=settings.FLOW_TIMEOUT_SECONDS,
        )

        result_str = str(result)
        run_store.update_run(kickoff_id, "completed", result=result_str)
        logger.info(
            "Scheduled kickoff completed — trigger=%s, kickoff_id=%s",
            trigger,
            kickoff_id,
        )

        # Send Telegram digest in a thread — httpx.post() is synchronous, must not block event loop
        await asyncio.to_thread(_send_telegram_digest, result_str, trigger)

    except asyncio.TimeoutError:
        logger.error("Scheduled kickoff timed out — trigger=%s", trigger)
        if kickoff_id:
            from .persistence import run_store

            run_store.update_run(
                kickoff_id,
                "failed",
                error_text=f"Timeout after {settings.FLOW_TIMEOUT_SECONDS}s",
            )
    except asyncio.CancelledError:
        # Pod shutdown (SIGTERM) during scheduled run — mark as cancelled before process terminates
        logger.warning("Scheduled kickoff cancelled (pod shutdown) — trigger=%s", trigger)
        if kickoff_id:
            try:
                from .persistence import run_store

                run_store.update_run(kickoff_id, "cancelled", error_text="Server shutdown")
            except Exception:  # noqa: BLE001
                pass
        raise  # re-raise for proper asyncio propagation
    except Exception as exc:  # noqa: BLE001
        logger.error("Scheduled kickoff failed — trigger=%s: %s", trigger, exc, exc_info=True)
        if kickoff_id:
            try:
                from .persistence import run_store

                run_store.update_run(kickoff_id, "failed", error_text=str(exc))
            except Exception:  # noqa: BLE001
                pass


async def _run_market_intel_scout() -> None:
    """Kickoff the Market Intelligence Scout swarm at 7h50 (10 min before CoS morning brief).

    Looks up the swarm by name in Supabase. If found and is_active=True, kicks it off
    via the dynamic swarm execution path. Fail-soft: logs silently if not found.
    """
    logger.info("Market Intel Scout job starting — trigger=market_intel_morning")

    try:
        from supabase import create_client

        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

        # Look up the swarm by name (template or user-owned copy)
        resp = (
            supabase.table("swarms")
            .select("id, name, is_active, owner_id, config_json")
            .eq("name", "Market Intelligence Scout")
            .limit(1)
            .execute()
        )

        if not resp.data:
            logger.info("Market Intel Scout swarm not found, skipping")
            return

        swarm = resp.data[0]

        if not swarm.get("is_active", False):
            logger.info("Market Intel Scout swarm found but is_active=False, skipping")
            return

        swarm_id = swarm["id"]
        owner_id: str | None = swarm.get("owner_id") or swarm.get("config_json", {}).get("owner_id")
        logger.info("Market Intel Scout swarm found — swarm_id=%s, kicking off", swarm_id)

        # Deferred import — ChiefOfStaffFlow pattern, avoid circularity at module load time.
        from .flows.dynamic_swarm_flow import DynamicSwarmFlow
        from .persistence import swarm_store

        run_id = str(uuid4())
        trigger = "market_intel_morning"
        inputs = {
            "trigger": trigger,
            "user_timezone": settings.USER_TIMEZONE,
            "user_language": settings.USER_LANGUAGE,
            "mock_mode": settings.AGENT_MOCK_MODE,
        }

        swarm_store.save_swarm_run(
            run_id=run_id,
            swarm_id=swarm_id,
            trigger=trigger,
            status="running",
            inputs_json=inputs,
        )

        try:
            flow = DynamicSwarmFlow()
            state_dict = {
                "swarm_id": swarm_id,
                "run_id": run_id,
                "trigger": trigger,
                "inputs": inputs,
                "owner_id": owner_id,
            }
            await asyncio.wait_for(
                asyncio.to_thread(flow.kickoff, inputs=state_dict),
                timeout=settings.FLOW_TIMEOUT_SECONDS,
            )
            logger.info("Market Intel Scout completed — run_id=%s", run_id)

            await asyncio.to_thread(_send_telegram_digest, "market_intel_morning completed", trigger)

        except asyncio.TimeoutError:
            logger.error("Market Intel Scout timed out after %ss", settings.FLOW_TIMEOUT_SECONDS)
            swarm_store.update_swarm_run(
                run_id,
                status="failed",
                error_text=f"Timeout after {settings.FLOW_TIMEOUT_SECONDS}s",
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Market Intel Scout flow failed: %s", exc, exc_info=True)
            try:
                swarm_store.update_swarm_run(
                    run_id,
                    status="failed",
                    error_text=str(exc),
                    finished_at=datetime.now(timezone.utc).isoformat(),
                )
            except Exception:  # noqa: BLE001
                pass

    except Exception as exc:  # noqa: BLE001
        logger.error("Market Intel Scout job failed unexpectedly: %s", exc, exc_info=True)


def _send_telegram_digest(result: str, trigger: str) -> None:
    """Send the daily digest via Telegram. Fail-soft."""
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        logger.debug(
            "Telegram not configured — skipping digest for trigger=%s", trigger
        )
        return

    try:
        from .tools.telegram_sender import TelegramSenderTool
        from .tools.digest_formatter import DigestFormatterTool

        formatter = DigestFormatterTool()
        try:
            data = json.loads(result) if result.strip().startswith("{") else {"raw": result}
        except json.JSONDecodeError:
            data = {"raw": result}

        formatted = formatter._run(json.dumps(data), trigger=trigger)

        sender = TelegramSenderTool()
        send_result = sender._run(formatted, chat_id=settings.TELEGRAM_CHAT_ID)
        logger.info("Telegram digest sent — trigger=%s, result=%s", trigger, send_result)
    except Exception as exc:  # noqa: BLE001
        logger.error("Telegram digest failed for trigger=%s: %s", trigger, exc)


def create_scheduler() -> AsyncIOScheduler:
    """Create and configure the APScheduler instance.

    Returns a configured but NOT yet started scheduler.
    Caller (lifespan) is responsible for start/shutdown.

    # WARN: If uvicorn runs with --reload (dev), each hot-reload creates a new AsyncIOScheduler
    # while the previous one may still be active in the process, causing duplicate Telegram alerts.
    # In production (Railway, no --reload), this is not an issue.
    # Mitigation: use SCHEDULER_ENABLED=false in dev unless testing cron behavior.
    """
    import pytz

    try:
        tz = pytz.timezone(settings.USER_TIMEZONE)
    except Exception:  # noqa: BLE001
        logger.warning(
            "Invalid USER_TIMEZONE %r — falling back to UTC", settings.USER_TIMEZONE
        )
        tz = pytz.UTC

    scheduler = AsyncIOScheduler(timezone=tz)

    # Morning brief
    scheduler.add_job(
        _run_scheduled_kickoff,
        CronTrigger(
            hour=settings.MORNING_HOUR,
            minute=settings.MORNING_MINUTE,
            timezone=tz,
        ),
        args=["morning"],
        id="chief-of-staff-morning",
        replace_existing=True,
        max_instances=1,  # no overlap if run takes > 24h (impossible but defensive)
        misfire_grace_time=settings.MISFIRE_GRACE_TIME_SECONDS,  # see config — defaults to 300s
        # NOTE: If the pod restarts within MISFIRE_GRACE_TIME_SECONDS of the scheduled time,
        # the misfired job will run at startup. This means 2 runs on the same morning/evening
        # in case of crash-restart. Acceptable for MVP; add idempotency check if needed.
    )

    # Evening brief
    scheduler.add_job(
        _run_scheduled_kickoff,
        CronTrigger(
            hour=settings.EVENING_HOUR,
            minute=settings.EVENING_MINUTE,
            timezone=tz,
        ),
        args=["evening"],
        id="chief-of-staff-evening",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=settings.MISFIRE_GRACE_TIME_SECONDS,  # see config — defaults to 300s
        # NOTE: If the pod restarts within MISFIRE_GRACE_TIME_SECONDS of the scheduled time,
        # the misfired job will run at startup. This means 2 runs on the same morning/evening
        # in case of crash-restart. Acceptable for MVP; add idempotency check if needed.
    )

    # Market Intelligence Scout — 7h50 (10 min avant le CoS morning brief)
    scheduler.add_job(
        _run_market_intel_scout,
        CronTrigger(
            hour=7,
            minute=50,
            timezone=tz,
        ),
        id="market-intel-morning",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=settings.MISFIRE_GRACE_TIME_SECONDS,
    )

    logger.info(
        "Scheduler configured — morning=%02d:%02d, evening=%02d:%02d, market_intel=07:50, tz=%s, enabled=%s",
        settings.MORNING_HOUR,
        settings.MORNING_MINUTE,
        settings.EVENING_HOUR,
        settings.EVENING_MINUTE,
        settings.USER_TIMEZONE,
        settings.SCHEDULER_ENABLED,
    )
    return scheduler
