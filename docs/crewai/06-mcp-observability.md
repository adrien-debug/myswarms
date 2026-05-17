# 06 — MCP + Observability + Telemetry

CrewAI's ecosystem integrates two transformative capabilities: **Model Context Protocol (MCP)** servers for extensible tool provisioning, and **comprehensive observability platforms** for production-grade monitoring. Combined with configurable **telemetry** that respects privacy, these form the backbone of observable, auditable AI agent systems. This section ingests 23 pages of CrewAI documentation across MCP (7 pages), Observability (16 providers), and Telemetry/Skills, synthesized for the Daily Chief of Staff AI use case with Langfuse as primary observability layer.

---

## MCP (Model Context Protocol) — Extensible Tool Infrastructure

### Overview & Core Integration Patterns

**Source** : https://docs.crewai.com/en/mcp/overview.md

MCP servers deliver standardized, discoverable tools to CrewAI agents through two complementary approaches:

**DSL Integration (Recommended):** The simplest path uses the `mcps` field on agents, accepting string references to external servers, connected integrations, or specific tool selectors. Examples:
- External HTTPS server: `"https://mcp.example.com/api"`
- With authentication: `"https://mcp.exa.ai/mcp?api_key=your_key"`
- Specific tool selection: `"https://api.weather.com/mcp#get_forecast"`
- Catalog reference: `"snowflake"` or `"stripe#list_invoices"`

CrewAI automatically discovers tools, applies naming conventions to prevent conflicts, caches schemas for 5 minutes, and only establishes connections when tools are actually invoked (not at agent creation).

**Advanced MCPServerAdapter:** For complex scenarios requiring granular lifecycle control, the `crewai-tools` library exposes `MCPServerAdapter` for manual connection management with explicit `start()` and `stop()` calls.

**Pertinence Daily Chief of Staff** : OUI — MCP DSL permet de connecter Composio en mode MCP (au lieu de l'import direct), ou exposer un serveur MCP custom pour des actions perso d'Adrien (whitelisting custom).

---

### DSL Integration

**Source** : https://docs.crewai.com/en/mcp/dsl-integration.md

Agents acceptent un field `mcps` (liste de strings). CrewAI résout chaque string et fournit les outils à l'agent.

```python
agent = Agent(
    role="Inbox Collector",
    goal="Fetch all messages",
    mcps=[
        "composio#gmail",  # Composio Gmail toolkit only
        "https://api.exa.ai/mcp?api_key=..."  # Exa search MCP
    ]
)
```

**Pertinence Daily Chief of Staff** : OUI — Pattern alternatif pour Composio. Si on veut filter par toolkit précis sans charger les 250+ actions.

---

### Multiple Servers

**Source** : https://docs.crewai.com/en/mcp/multiple-servers.md

The `MCPServerAdapter` aggregates tools from multiple servers simultaneously:

```python
from crewai_tools import MCPServerAdapter, MCPServerStdio

servers = [
    MCPServerStdio(command="python3", args=["./local_server.py"]),
    {"url": "https://remote-mcp.example.com/api", "transport": "streamable-http"},
    {"url": "http://localhost:8000/sse", "transport": "sse"}
]

with MCPServerAdapter(servers) as adapter:
    agent = Agent(tools=adapter.get_tools(), ...)
```

The adapter handles lifecycle (start/stop) for all connections.

**Pertinence Daily Chief of Staff** : OUI — Permet de combiner Composio (cloud) + serveur MCP local custom (whitelisting safety) + autres.

---

### Security

**Source** : https://docs.crewai.com/en/mcp/security.md

**Fundamental principle:** Only connect to MCP servers you fully trust.

**Prompt Injection Risk:** Malicious servers can inject instructions via tool names and descriptions before the LLM even invokes tools. Vetting is essential.

**Threat Vectors:**
- Code execution on local system
- Data exposure from agent environment
- Behavioral manipulation via rogue API calls
- Input validation failures (command injection, path traversal)

**Mitigation Strategies:**
- Validate Origin and Host headers on remote transports
- Bind local servers to 127.0.0.1 only
- Require authentication for sensitive tools
- Validate token audiences to prevent confused deputy attacks
- Implement strict JSON schema validation on all parameters
- Rate limit to prevent abuse
- Maintain comprehensive logging for anomaly detection

**Pertinence Daily Chief of Staff** : **OUI CRITIQUE** — Adrien traite ses vrais emails et messages. Tout MCP server consommé doit être trustworthy (Composio = OK, serveurs publics inconnus = NO).

---

### Stdio Transport

**Source** : https://docs.crewai.com/en/mcp/stdio.md

Connects to local server processes via standard input/output streams. Ideal for on-machine deployments.

```python
from crewai_tools import MCPServerStdio

mcp_config = MCPServerStdio(
    command="npx",
    args=["-y", "@modelcontextprotocol/server-filesystem"],
    env={"API_KEY": "your_api_key"}
)

with MCPServerAdapter([mcp_config]) as adapter:
    agent = Agent(
        role="File Manager",
        goal="Manage files",
        tools=adapter.get_tools(),
        llm=llm
    )
    crew = Crew(agents=[agent])
```

**Pertinence Daily Chief of Staff** : OUI — Pour serveur MCP custom local (e.g., un MCP qui expose la whitelist Adrien des réponses auto-send autorisées N5).

---

### SSE Transport

**Source** : https://docs.crewai.com/en/mcp/sse.md

Real-time unidirectional streaming from remote MCP servers to CrewAI.

```python
from crewai_tools import MCPServerAdapter

adapter = MCPServerAdapter(
    [{"url": "http://localhost:8000/sse", "transport": "sse"}]
)
```

Key requirement: **DNS rebinding protection** — validate Origin headers, bind development servers only to `127.0.0.1` (not `0.0.0.0`), implement authentication for non-public endpoints.

**Pertinence Daily Chief of Staff** : À évaluer — Si on déploie un MCP server perso (Railway).

---

### Streamable HTTP Transport

**Source** : https://docs.crewai.com/en/mcp/streamable-http.md

Flexible HTTP-based connections supporting request-response and streaming patterns via SSE.

```python
adapter = MCPServerAdapter(
    [{"url": "http://localhost:8001/mcp", "transport": "streamable-http"}]
)
```

Always use HTTPS in production, validate incoming requests, implement proper authentication.

**Pertinence Daily Chief of Staff** : OUI — Le transport recommandé en production (vs stdio dev).

---

### Performance & Resilience Features

- **Tool discovery timeouts:** 10s connection, 15s discovery, 30s execution
- **Tool filtering:** Static allow/block lists or dynamic context-aware filtering
- **Schema caching:** 5-minute cache reduces repeated introspection
- **Lazy connection:** Tools instantiate connections only on invocation
- **Graceful degradation:** Timeouts and connection failures logged as warnings, agent continues with available tools

### CrewBase Decorator Integration

The `@CrewBase` decorator automates MCP adapter lifecycle through the `get_mcp_tools()` method, eliminating manual connection management:

```python
@CrewBase
class DailyChiefOfStaffCrew:
    def get_mcp_tools(self):
        return [
            MCPServerStdio(command="python3", args=["./local_safety_server.py"]),
            {"url": "https://mcp.exa.ai/mcp", "transport": "streamable-http"}
        ]
```

---

## Observability — Langfuse Focus

### Langfuse: Complete Setup for CrewAI

**Source** : https://docs.crewai.com/en/observability/langfuse.md

**Langfuse is an open-source LLM engineering platform** specializing in tracing, monitoring, and debugging LLM applications. For the Daily Chief of Staff AI, Langfuse is **the primary observability target** (already configured in .env.local with `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`).

#### Installation & Environment

```bash
pip install langfuse openlit crewai crewai-tools
```

**Required environment variables:**
```
LANGFUSE_PUBLIC_KEY=pk-lf-your_key
LANGFUSE_SECRET_KEY=sk-lf-your_key
LANGFUSE_HOST=https://cloud.langfuse.com
OPENAI_API_KEY=sk-...
```

#### Core Implementation Pattern

```python
from langfuse import get_client
import openlit

# 1. Verify Langfuse connection
langfuse = get_client()
langfuse.auth_check()  # Raises error if credentials invalid

# 2. Enable OpenTelemetry auto-instrumentation
openlit.init()

# 3. Now CrewAI runs are automatically traced
from crewai import Agent, Task, Crew

researcher = Agent(
    role="Research Analyst",
    goal="Gather intelligence on market trends",
    backstory="Expert market researcher",
    tools=[...]
)

research_task = Task(
    description="Analyze Q1 2025 market data",
    expected_output="Summary report",
    agent=researcher
)

crew = Crew(
    agents=[researcher],
    tasks=[research_task],
    verbose=True
)

result = crew.kickoff()  # Auto-traced to Langfuse
```

#### What Gets Traced

Once OpenTelemetry is initialized, Langfuse automatically captures:
- **LLM calls:** Model name, prompt, completion, tokens (input/output), latency, cost
- **Agent interactions:** Role, goal, reasoning steps
- **Task execution:** Description, dependencies, execution duration
- **Tool invocations:** Tool name, input parameters, output, latency
- **Errors:** Stack traces and failure context
- **Performance metrics:** End-to-end latency, token consumption, estimated costs

#### Production-Ready Pattern for Daily Chief of Staff

```python
import os
from langfuse import get_client
import openlit
from crewai import Agent, Task, Crew

# Initialize observability
langfuse_client = get_client()
langfuse_client.auth_check()
openlit.init()

def run_daily_chief_workflow():
    """Daily Chief of Staff executes morning briefing."""
    
    chief = Agent(
        role="Daily Chief of Staff",
        goal="Deliver morning briefing with urgent items + draft responses",
        tools=[...]  # Composio Gmail/Slack/Telegram/Calendar
    )
    
    crew = Crew(
        agents=[chief, ...],
        tasks=[...],
        verbose=True
    )
    
    result = crew.kickoff()
    return result

if __name__ == "__main__":
    run_daily_chief_workflow()
```

#### Custom Tracing & Metadata

```python
from langfuse.decorators import trace

@trace
def custom_agent_logic():
    pass

# Or use context manager:
with langfuse_client.trace(name="daily_chief_morning_run", tags=["chief", "morning"]) as t:
    pass
```

---

## Observability — Other Providers (Alternative Options)

**Source** : https://docs.crewai.com/en/observability/overview.md

CrewAI supports 15+ observability platforms. The following are documented but **not recommended for Daily Chief of Staff V1** (Langfuse suffices):

| Provider | Source | Key Value | Status |
|----------|--------|-----------|--------|
| **Arize Phoenix** | /observability/arize-phoenix | End-to-end tracing + evaluation OpenTelemetry | Alternative to Langfuse |
| **Braintrust** | /observability/braintrust | Comprehensive eval framework + experiment tracking | Eval-focused |
| **Datadog** | /observability/datadog | Enterprise APM + LLM observability view | Enterprise only |
| **OpenLIT** | /observability/openlit | Single-line monitoring, PromptHub | Open-source |
| **Opik (Comet)** | /observability/opik | Debugging + CI/CD integration | Development-focused |
| **Weave (W&B)** | /observability/weave | End-to-end tracking + guardrails | MLOps-centric |
| **LangDB** | /observability/langdb | 350+ LLM access + gateway observability | Gateway-first |
| **Langtrace** | /observability/langtrace | Open-source, token/cost analysis | Alternative open-source |
| **Galileo** | /observability/galileo | Evaluation + monitoring + listener | Eval-focused |
| **Patronus AI** | /observability/patronus-evaluation | Custom evaluation tools | QA-focused |
| **Portkey** | /observability/portkey | 200+ LLMs + reliability (fallback/retry/caching) | Gateway + reliability |
| **MLflow** | /observability/mlflow | ML lifecycle + autolog tracing | Data science-centric |
| **Neatlogs** | /observability/neatlogs | Collaborative debugging + inline comments | Team debugging |
| **TrueFoundry** | /observability/truefoundry | 250+ LLM + HIPAA/SOC2 compliance | Regulated environments |
| **Maxim** | /observability/maxim | Quality + agent observability | Eval-focused |

**Recommendation:** Stick with **Langfuse** for V1. Layer Patronus or Opik later if evaluation needed.

---

### Tracing Overview

**Source** : https://docs.crewai.com/en/observability/tracing.md

CrewAI offre tracing OpenTelemetry natif. Tous les providers OpenTelemetry-compatible (Langfuse, Arize, OpenLIT, Langtrace) bénéficient de l'auto-instrumentation via `openlit.init()`.

---

## Telemetry Configuration & Skills

### CrewAI Telemetry: Privacy by Default

**Source** : https://docs.crewai.com/en/telemetry.md

CrewAI collects **anonymous usage statistics** by default. Critically, **NO personal data is collected** — this includes:
- Prompts, task descriptions, agent backstories
- API responses, processed data, secrets
- Environment variables, credentials

**Data collected (anonymously):**
- Software versions (CrewAI, Python)
- Process type and task/agent counts
- Tool usage statistics and names (not outputs)
- LLM technical attributes (model name, token counts)
- Execution timing data

#### Disabling Telemetry

Two opt-out mechanisms:

```python
import os

# Option 1: Disable CrewAI telemetry only
os.environ['CREWAI_DISABLE_TELEMETRY'] = 'true'

# Option 2: Disable all OpenTelemetry globally
os.environ['OTEL_SDK_DISABLED'] = 'true'
```

**Recommendation Daily Chief of Staff** : Add to `.env.local` :
```
CREWAI_DISABLE_TELEMETRY=true
```

Disables CrewAI's anonymous telemetry while keeping **Langfuse tracing active** (Langfuse is observability, not telemetry).

---

### CrewAI Skills

**Source** : https://docs.crewai.com/en/skills.md

**CrewAI Skills** is a skill pack for coding agents (Claude Code, Cursor, etc.) available on skills.sh.

**Installation:**
```bash
npx skills add crewaiinc/skills
```

**What agents learn:**
- Flows, Crews & Agents (YAML-first configuration)
- Tools & Integrations (API connectivity)
- Project Architecture (CLI scaffolds, repo standards)
- Current Best Practices (up-to-date conventions)

**Pertinence Daily Chief of Staff** : OUI — Installer dans le projet Claude Code pour scaffold automatique des crews CrewAI.

---

### CrewAI Built-In Tracing (Optional)

Separate from Langfuse, CrewAI offers native tracing via `app.crewai.com`:

```python
crew = Crew(
    agents=[...],
    tasks=[...],
    tracing=True  # Requires CrewAI account
)

# Or globally:
os.environ['CREWAI_TRACING_ENABLED'] = 'true'
```

**NOT recommended** for Daily Chief of Staff—Langfuse provides superior debugging and cost analytics.

---

## Synthèse Observability pour Daily Chief of Staff

### Stack recommandée

| Layer | Tool | Purpose | Config |
|-------|------|---------|--------|
| **LLM Observability** | Langfuse | Trace LLM calls, cost, latency, tokens | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` (.env.local) |
| **MCP Tool Integration** | Composio (cloud) + Custom MCP local | Whitelisting + composabilité | `mcps` field on agents |
| **Telemetry** | Désactivé | Privacy | `CREWAI_DISABLE_TELEMETRY=true` |
| **Debugging** | Langfuse Dashboard | Nested traces, errors, costs | https://cloud.langfuse.com |

### Setup complet snippet

```python
import os
from langfuse import get_client
import openlit
from crewai import Agent, Task, Crew
from crewai_tools import MCPServerStdio, MCPServerAdapter
from composio_crewai import ComposioProvider
from composio import Composio

# 1. Configuration (.env.local)
# LANGFUSE_PUBLIC_KEY=pk-lf-...
# LANGFUSE_SECRET_KEY=sk-lf-...
# LANGFUSE_HOST=https://cloud.langfuse.com
# CREWAI_DISABLE_TELEMETRY=true
# COMPOSIO_API_KEY=...
# OPENAI_API_KEY=...
# ANTHROPIC_API_KEY=...

# 2. Initialize Langfuse + OpenTelemetry
langfuse = get_client()
langfuse.auth_check()
openlit.init()

# 3. Composio session
composio = Composio(provider=ComposioProvider())
session = composio.create(
    user_id="adrien-chief-of-staff",
    toolkits=["gmail", "slack", "telegram", "google_calendar", "notion"]
)
composio_tools = session.tools()

# 4. Optional local MCP (safety whitelist server)
local_mcp = MCPServerStdio(
    command="python3",
    args=["./services/crewai-engine/mcp_safety_server.py"]
)

# 5. Agents
with MCPServerAdapter([local_mcp]) as adapter:
    safety_tools = adapter.get_tools()
    
    chief = Agent(
        role="Daily Chief of Staff",
        goal="Orchestrate daily inbox triage + drafting + scheduling",
        backstory="20 years exec assistant experience",
        tools=composio_tools + safety_tools,
        verbose=True,
        allow_delegation=True
    )
    
    # ... 7 autres agents ...
    
    crew = Crew(
        agents=[chief, ...],
        tasks=[...],
        process=Process.hierarchical,
        manager_agent=chief
    )
    
    result = crew.kickoff()  # Auto-traced Langfuse
```

### Privacy Checklist

- [ ] Set `CREWAI_DISABLE_TELEMETRY=true` in `.env.local`
- [ ] Verify `LANGFUSE_HOST` points to your Langfuse instance
- [ ] Audit MCP server trust before enabling
- [ ] Implement MCP server rate limiting if exposed
- [ ] Never log prompts containing PII; Langfuse handles trace retention
- [ ] Review Langfuse retention (default 90 days)

### Roadmap Observability

**V1** : Langfuse tracing + MCP stdio local + telemetry disabled
**V2** : MCP SSE distributed + Langfuse evaluation + cost alerts
**V3** : Patronus AI eval auto + Portkey gateway multi-LLM + custom MCP perso
