"""Daily Chief of Staff — Crew factory.

Process.hierarchical with the Chief of Staff agent as manager.
8 specialized agents handle the task chain; Chief of Staff delegates and synthesizes.
Security Level N3: organizational actions only, no auto-send.

Agents are created fresh on each call to create_daily_chief_crew() via create_agents().
No module-level Agent singletons — safe for concurrent kickoffs.
"""

from crewai import Crew, Process, Task

from ..agents.definitions import create_agents

# Architecture note: agents and tasks are defined inline (Python) rather than via @CrewBase + YAML
# for explicit type safety and dynamic parameter injection (trigger, timezone, language).
# Migrate to YAML if configuration complexity grows significantly.


def create_tasks(
    agents: dict,
    trigger: str = "on_demand",
    user_timezone: str = "Asia/Dubai",
    user_language: str = "fr",
) -> list[Task]:
    """Create the ordered task list for the Daily Chief of Staff crew.

    Agents dict is passed explicitly so tasks bind to the same fresh instances
    created by create_daily_chief_crew() for this kickoff.
    """

    collect_task = Task(
        description="""Fetch ALL unread messages received in the last 24 hours from:
- Gmail: unread emails (use GMAIL_FETCH_EMAILS with query "is:unread newer_than:1d", max 50)
- Slack: recent messages where Adrien was mentioned or DMed (use SLACK_FETCH_MESSAGES)
- Telegram: recent bot updates (use TELEGRAM_GET_UPDATES if available)

Return as a JSON list of objects with fields:
{{
  "source": "gmail"|"slack"|"telegram",
  "from": "sender name or username",
  "subject_or_channel": "email subject or Slack channel",
  "content": "message content (truncated to 500 chars if long)",
  "timestamp": "ISO 8601",
  "thread_id": "optional thread ID for reply context",
  "link": "optional URL"
}}

If a service is unavailable or returns an error, include an entry:
{{"source": "X", "status": "unavailable", "error": "..."}}""",
        agent=agents["inbox_collector"],
        expected_output=(
            "A JSON array of message objects from all available channels. "
            "May include error entries for unavailable services."
        ),
    )

    classify_task = Task(
        description=f"""Classify each message in the inbox JSON provided by the Inbox Collector.

For each message, determine:
1. Primary category: one of [urgent, important, to-reply, to-read-later, to-delegate,
   personal, work, finance, family, health, spam-noise, opportunity, appointment,
   invoice, document-to-process]
2. Secondary tags: 0-2 additional relevant categories
3. Requires response: yes/no

Return the SAME list with added fields:
- "category": primary category string
- "tags": list of secondary tags
- "requires_response": boolean

Trigger context: {trigger} (morning runs should flag time-sensitive items more aggressively)""",
        agent=agents["classifier"],
        expected_output=(
            "The inbox JSON array enriched with 'category', 'tags', and "
            "'requires_response' fields on each message."
        ),
        context=[collect_task],
    )

    prioritize_task = Task(
        description=f"""Assign priority P0-P4 to each classified message using the Priority Scorer tool and these rules:

RULES:
- P0 = critical, handle NOW: contains urgent/ASAP/deadline/bloqué/invoice overdue,
  or from VIP + meeting today
- P1 = important today: requires response within the day, time-sensitive decision
- P2 = this week: can wait but shouldn't be ignored past 7 days
- P3 = read later: no action required immediately
- P4 = ignore/archive: newsletters, spam, irrelevant notifications

USER TIMEZONE: {user_timezone}

Use the priority_scorer tool with the classified inbox JSON.
Return the list with an added "priority" field (P0-P4) on each message.""",
        agent=agents["priority_manager"],
        expected_output=(
            "The classified inbox JSON array with 'priority' (P0/P1/P2/P3/P4) on each message."
        ),
        context=[classify_task],
    )

    extract_task = Task(
        description="""Extract concrete action items from ALL P0 and P1 messages.

For each actionable message, produce:
{
  "source_message_id": "optional thread ID or subject hash",
  "action": "specific, verb-first task description (e.g., 'Send document to X', \
'Confirm meeting at 15h', 'Review contract section 3')",
  "owner": "Adrien" or delegate name if applicable,
  "suggested_deadline": "ISO date or 'today' or 'this week'",
  "priority": "P0" or "P1",
  "context": "1-line reference to source message"
}

Return as {"action_items": [...list of action objects...]}""",
        agent=agents["action_extractor"],
        expected_output=(
            "A JSON object with 'action_items' array containing extracted tasks "
            "from P0/P1 messages."
        ),
        context=[prioritize_task],
    )

    plan_task = Task(
        description=f"""Create today's executive schedule for Adrien.

STEPS:
1. If Google Calendar tools are available: fetch today's calendar events using GOOGLECALENDAR_LIST_EVENTS
   If NO calendar tools are available: note "Calendar unavailable — schedule based on action items only" and skip step 1
2. Combine available calendar events (if any) + action items from previous agent
3. Create an optimized hour-by-hour schedule in timezone {user_timezone}

RULES:
- Protect 09:00-11:00 for deep work (P0/P1 actions, not meetings)
- Group admin/email tasks in 15-30 min blocks
- Add buffer time between meetings
- Flag scheduling conflicts explicitly

Return as:
{{
  "schedule": [
    {{"time": "09:00-10:00", "type": "deep-work", "description": "..."}},
    ...
  ],
  "calendar_events": [...from Google Calendar, or [] if unavailable...],
  "conflicts": [...any detected conflicts...]
}}

Language: {user_language}""",
        agent=agents["daily_planner"],
        expected_output=(
            "A JSON object with 'schedule' array, 'calendar_events', and 'conflicts' keys."
        ),
        context=[extract_task],
    )

    draft_task = Task(
        description=f"""Write draft responses for all P0 and P1 messages that require a response (requires_response=true).

STYLE: {user_language}, court, direct, professionnel. Never verbose.

For each message requiring a response, produce:
{{
  "source_message": "brief description of what the message is about",
  "draft": "the complete draft response text",
  "subject": "email subject if applicable (prefix with Re:)",
  "channel": "gmail"|"slack"|"telegram",
  "to": "recipient name or email",
  "thread_id": "thread ID for reply context if available"
}}

⚠️ CRITICAL: These are DRAFTS ONLY. Never suggest sending.
Always include "DRAFT — Review required before sending" header.

Return as {{"drafts": [...list of draft objects...]}}""",
        agent=agents["draft_writer"],
        expected_output=(
            "A JSON object with 'drafts' array containing all prepared response "
            "drafts with DRAFT headers."
        ),
        context=[prioritize_task, extract_task],
    )

    automate_task = Task(
        description="""Execute ONLY safe organizational actions on classified messages:

ALLOWED ACTIONS (Level N3 — organizational only):
- Archive newsletters and P4 messages: GMAIL_ARCHIVE_EMAIL
- Add labels: GMAIL_ADD_LABEL (e.g., "Chief-AI/P0", "Chief-AI/Finance")
- Mark as read where appropriate: GMAIL_MARK_AS_READ
- DO NOT: send any messages, delete emails, create calendar events,
  take any irreversible action

Process:
1. For each P4 / spam-noise message → archive it
2. For each P0-P2 message → add appropriate label based on category + priority
3. Return a summary of actions taken

Return as:
{"actions_taken": [{"action": "GMAIL_ARCHIVE_EMAIL", "message": "...", "result": "success/failed"}, ...]}""",
        agent=agents["automation_executor"],
        expected_output=(
            "A JSON object with 'actions_taken' array logging each automation action "
            "and its result."
        ),
        context=[prioritize_task],
    )

    memory_task = Task(
        description="""Analyze today's communication patterns to extract memory-worthy insights:

EXTRACT:
1. New VIP contacts encountered (people Adrien spent significant time communicating with)
2. Active projects referenced in messages (project names, codenames, client names)
3. Recurring topics that appeared multiple times
4. Preferences inferred (communication patterns, working hours, frequent collaborators)

DO NOT: store sensitive personal data, financial details, or confidential content verbatim.

Return as:
{
  "vip_contacts_identified": [{"name": "...", "email": "...", "context": "..."}],
  "active_projects": ["project-name", ...],
  "recurring_topics": ["topic", ...],
  "preference_hints": [
    "Adrien responds quickly to X",
    "Prefers direct communication with Y",
    ...
  ]
}""",
        agent=agents["memory_agent"],
        expected_output=(
            "A JSON object with memory insights: VIP contacts, active projects, "
            "recurring topics, and preference hints."
        ),
        context=[classify_task, prioritize_task],
    )

    return [
        collect_task,
        classify_task,
        prioritize_task,
        extract_task,
        plan_task,
        draft_task,
        automate_task,
        memory_task,
    ]


def create_daily_chief_crew(
    trigger: str = "on_demand",
    user_timezone: str = "Asia/Dubai",
    user_language: str = "fr",
) -> Crew:
    """Create the Daily Chief of Staff crew with hierarchical process.

    Fresh Agent instances are created on each call via create_agents() factory.
    Safe for concurrent kickoffs — no shared Agent state between calls.

    Chief of Staff is the manager agent that delegates to 8 specialized agents.
    Security Level N3: organizational actions only (no auto-send).
    """
    agents = create_agents()

    tasks = create_tasks(
        agents=agents,
        trigger=trigger,
        user_timezone=user_timezone,
        user_language=user_language,
    )

    return Crew(
        agents=[
            agents["inbox_collector"],
            agents["classifier"],
            agents["priority_manager"],
            agents["action_extractor"],
            agents["daily_planner"],
            agents["draft_writer"],
            agents["automation_executor"],
            agents["memory_agent"],
        ],
        tasks=tasks,
        # Process.sequential (V1): tasks run in order, each agent processes its task
        # and passes context to the next. Lighter on LLM calls than hierarchical
        # (no manager delegation overhead = fewer/shorter prompts = lower risk of
        # "Invalid response from LLM call - None or empty." with Kimi K2.6).
        # The Chief of Staff agent is no longer the manager — its goal is now encoded
        # in the task chain itself (collect → classify → prioritize → extract → plan →
        # draft → automate → memorize).
        process=Process.sequential,
        planning=False,
        verbose=True,
    )
