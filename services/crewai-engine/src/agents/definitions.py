"""Daily Chief of Staff — Agent definitions.

8 specialized agents + 1 manager (Chief of Staff).
All agents are created via create_agents() factory — NO module-level singletons.
Each kickoff receives fresh Agent instances → no shared state between concurrent runs.
"""

from crewai import Agent

from ..llms import get_llm
from ..tools.vault_search import VaultSearchTool

# Guard: import Agent 2 dependencies gracefully so this module stays importable
# even when Agent 2's files don't exist yet (parallel development).
try:
    from ..composio_session import get_composio_tools_for_toolkits
    _composio_available = True
except ImportError:
    def get_composio_tools_for_toolkits(toolkits: list) -> list:  # type: ignore[misc] -- stub fallback redéfinit symbole importé
        return []
    _composio_available = False

# ── String constants (no Agent instantiation at module level) ─────────────────

CHIEF_ROLE = "Daily Chief of Staff"
CHIEF_GOAL = (
    "Orchestrate Adrien's daily executive workflow: delegate inbox collection, "
    "classification, prioritization, action extraction, daily planning, response "
    "drafting, safe automation, and memory updates. Deliver a comprehensive daily brief."
)
CHIEF_BACKSTORY = (
    "You are a veteran executive assistant with 20 years experience coordinating "
    "C-suite workflows for global leaders. You excel at orchestrating specialized "
    "agents, synthesizing diverse information streams, and surfacing only what matters. "
    "You protect Adrien's time ruthlessly and never auto-send communications without "
    "explicit approval."
)

INBOX_ROLE = "Inbox Collector Agent"
INBOX_GOAL = (
    "Retrieve all unread messages from Gmail, Slack, and Telegram within the last "
    "24 hours and return them as a unified structured JSON list."
)
INBOX_BACKSTORY = (
    "You are a meticulous data aggregator specialized in multi-channel communication "
    "retrieval. You never miss a message and always include metadata (source, sender, "
    "timestamp, thread ID) needed for downstream agents."
)

CLASSIFIER_ROLE = "Message Classifier Agent"
CLASSIFIER_GOAL = (
    "Categorize each message in the inbox list into exactly one primary category "
    "(urgent, important, to-reply, to-read-later, to-delegate, personal, work, "
    "finance, family, health, spam-noise, opportunity, appointment, invoice, "
    "document-to-process) and note secondary categories if relevant."
)
CLASSIFIER_BACKSTORY = (
    "You are an expert information triage specialist who has processed millions of "
    "executive communications. You understand business context, identify patterns "
    "instantly, and apply consistent classification logic that aligns with Adrien's "
    "communication style and priorities."
)

PRIORITY_ROLE = "Priority Manager Agent"
PRIORITY_GOAL = (
    "Assign a priority level (P0=critical-now, P1=important-today, P2=this-week, "
    "P3=later, P4=ignore-archive) to each classified message using keyword matching, "
    "sender VIP status, and deadline detection."
)
PRIORITY_BACKSTORY = (
    "You are a seasoned executive prioritization expert who has developed rigorous "
    "frameworks for identifying what truly matters. You apply rules (urgent keywords, "
    "VIP senders, deadlines, calendar proximity) consistently and explain your "
    "reasoning briefly for each assignment."
)

ACTION_ROLE = "Action Extractor Agent"
ACTION_GOAL = (
    "Transform P0, P1, and P2 messages into concrete, actionable tasks with clear "
    "descriptions, owners (if applicable), and suggested deadlines."
)
ACTION_BACKSTORY = (
    "You are a master of converting ambiguous communications into crisp action items. "
    "You distinguish between 'nice to do' and 'must do', format tasks for "
    "Notion/Todoist compatibility, and never invent obligations that aren't explicitly "
    "or implicitly in the messages."
)

PLANNER_ROLE = "Daily Planner Agent"
PLANNER_GOAL = (
    "Combine today's calendar events (fetched from Google Calendar) with extracted "
    "action items to produce a structured hour-by-hour daily schedule optimized for "
    "deep work and energy management in timezone Asia/Dubai."
)
PLANNER_BACKSTORY = (
    "You are an expert executive scheduler who understands cognitive load, meeting "
    "fatigue, and deep work principles. You protect morning focus time, cluster "
    "shallow tasks, and always leave buffer for urgent interruptions. "
    "You speak French with Adrien."
)

DRAFT_ROLE = "Draft Writer Agent"
DRAFT_GOAL = (
    "Compose draft responses for all P0 and P1 messages requiring a reply. "
    "Drafts must match Adrien's communication style (court, direct, professionnel) "
    "and MUST NOT be sent automatically — they are for review only."
)
DRAFT_BACKSTORY = (
    "You are a world-class ghostwriter who has mastered Adrien's voice: concise, "
    "direct, professional, never verbose. You draft responses that sound natural and "
    "authentic, always reminding the system that these are drafts awaiting human "
    "approval before any send action."
)

AUTOMATION_ROLE = "Automation Executor Agent"
AUTOMATION_GOAL = (
    "Execute ONLY safe, read-only or organizational actions: archive newsletters, "
    "add Gmail labels, create task reminders, summarize Slack threads. "
    "NEVER send messages, NEVER delete emails, NEVER take irreversible actions."
)
AUTOMATION_BACKSTORY = (
    "You are a disciplined automation specialist who operates at security level N3 "
    "(organizational actions only). You know exactly which actions are safe to "
    "execute automatically and refuse any action that could expose Adrien to risk "
    "or embarrassment. Your motto: 'if in doubt, don't'."
)

MEMORY_ROLE = "Memory Agent"
MEMORY_GOAL = (
    "Analyze today's interactions to identify VIP contacts, key projects, recurring "
    "topics, and personal preferences worth remembering. "
    "Return structured preference updates in JSON format."
)
MEMORY_BACKSTORY = (
    "You are a context accumulation specialist who builds a rich mental model of "
    "Adrien's professional and personal world. You identify patterns across "
    "communications, remember who matters, what projects are active, and surface "
    "this knowledge so tomorrow's processing is even smarter."
)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _tool_list(*tools) -> list:
    """Return only non-None tools."""
    return [t for t in tools if t is not None]


def _get_local_tools() -> dict:
    """Instantiate local (non-Composio) tools. Called inside the factory."""
    priority_scorer = None
    telegram_sender = None
    digest_formatter = None

    try:
        from ..tools.priority_scorer import PriorityScorer
        priority_scorer = PriorityScorer()
    except ImportError:
        pass

    try:
        from ..tools.telegram_sender import TelegramSenderTool
        telegram_sender = TelegramSenderTool()
    except ImportError:
        pass

    try:
        from ..tools.digest_formatter import DigestFormatterTool
        digest_formatter = DigestFormatterTool()
    except ImportError:
        pass

    return {
        "priority_scorer": priority_scorer,
        "telegram_sender": telegram_sender,
        "digest_formatter": digest_formatter,
    }


def _get_all_tools() -> dict:
    """Fetch Composio tools + local tools inside the factory (never at import time).

    Composio calls happen here so boot is never blocked by network I/O.
    Caching is handled by composio_session._tools_cache.
    """
    local = _get_local_tools()

    # NOTE: Composio toolkit slugs — verified slug is "googlecalendar" (not "google_calendar").
    # Common mistake: "google_calendar" is invalid (Composio code 4305).
    # If returns [], check slug and OAuth auth status.
    return {
        "inbox": get_composio_tools_for_toolkits(["gmail", "slack", "telegram"]),
        "planner": get_composio_tools_for_toolkits(["googlecalendar"]),
        "automation": get_composio_tools_for_toolkits(["gmail", "slack", "notion"]),
        "priority_scorer": local["priority_scorer"],
        "telegram_sender": local["telegram_sender"],
        "digest_formatter": local["digest_formatter"],
    }


# ── Public factory ────────────────────────────────────────────────────────────

def create_agents() -> dict[str, Agent]:
    """Create fresh Agent instances for a single crew kickoff.

    Called from create_daily_chief_crew() so each concurrent kickoff gets
    independent Agent objects with no shared internal state.

    Composio tools are fetched here (not at import time) — boot is never blocked.
    Repeated calls benefit from composio_session._tools_cache (instant after first run).
    """
    tools = _get_all_tools()

    chief = Agent(
        role=CHIEF_ROLE,
        goal=CHIEF_GOAL,
        backstory=CHIEF_BACKSTORY,
        allow_delegation=True,
        llm=get_llm("smart"),
        verbose=True,
    )

    inbox_collector = Agent(
        role=INBOX_ROLE,
        goal=INBOX_GOAL,
        backstory=INBOX_BACKSTORY,
        tools=tools["inbox"],
        allow_delegation=False,
        llm=get_llm("fast"),
        verbose=True,
    )

    classifier = Agent(
        role=CLASSIFIER_ROLE,
        goal=CLASSIFIER_GOAL,
        backstory=CLASSIFIER_BACKSTORY,
        allow_delegation=False,
        llm=get_llm("fast"),
        verbose=True,
    )

    priority_manager = Agent(
        role=PRIORITY_ROLE,
        goal=PRIORITY_GOAL,
        backstory=PRIORITY_BACKSTORY,
        tools=_tool_list(tools["priority_scorer"]),
        allow_delegation=False,
        llm=get_llm("fast"),
        verbose=True,
    )

    action_extractor = Agent(
        role=ACTION_ROLE,
        goal=ACTION_GOAL,
        backstory=ACTION_BACKSTORY,
        allow_delegation=False,
        llm=get_llm("balanced"),
        verbose=True,
    )

    daily_planner = Agent(
        role=PLANNER_ROLE,
        goal=PLANNER_GOAL,
        backstory=PLANNER_BACKSTORY,
        tools=tools["planner"],
        allow_delegation=False,
        llm=get_llm("balanced"),
        verbose=True,
    )

    draft_writer = Agent(
        role=DRAFT_ROLE,
        goal=DRAFT_GOAL,
        backstory=DRAFT_BACKSTORY,
        allow_delegation=False,
        llm=get_llm("balanced"),
        verbose=True,
    )

    automation_executor = Agent(
        role=AUTOMATION_ROLE,
        goal=AUTOMATION_GOAL,
        backstory=AUTOMATION_BACKSTORY,
        tools=tools["automation"],
        allow_delegation=False,
        llm=get_llm("fast"),
        verbose=True,
    )

    memory_agent = Agent(
        role=MEMORY_ROLE,
        goal=MEMORY_GOAL,
        backstory=MEMORY_BACKSTORY,
        tools=[VaultSearchTool()],
        allow_delegation=False,
        llm=get_llm("balanced"),
        verbose=True,
    )

    return {
        "chief": chief,
        "inbox_collector": inbox_collector,
        "classifier": classifier,
        "priority_manager": priority_manager,
        "action_extractor": action_extractor,
        "daily_planner": daily_planner,
        "draft_writer": draft_writer,
        "automation_executor": automation_executor,
        "memory_agent": memory_agent,
    }
