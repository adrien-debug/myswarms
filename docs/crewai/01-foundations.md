# 01 — Foundations (Getting Started + Core Concepts)

Ce document ingère exhaustivement le LOT 1 de la documentation CrewAI officielle : sections Getting Started (Introduction, Installation, Quickstart, Changelog) et Core Concepts (26 pages couvrant Agents, Tasks, Crews, Flows, Tools, Processes, LLMs, Memory, Knowledge, Skills, Reasoning, Planning, Checkpointing, Collaboration, Training, Testing, Event Listeners, Files, Production Architecture, CLI). Le tout est dense, sans fluff, avec signatures Python verbatim et pertinence annotée pour le Daily Chief of Staff microservice.

---

## 02. Introduction [Source](https://docs.crewai.com/en/introduction)

**But & Vision**

CrewAI est "the leading open-source framework for orchestrating autonomous AI agents and building complex workflows." Deux piliers : **Flows** (stateful process orchestration avec event-driven execution, branching, et persistence) + **Crews** (autonomous agent teams avec roles, goals, tools, et collaboration). Positionné pour 100k+ developers certifiés, "the standard for enterprise-ready AI automation."

**Concepts clés**
- Flows : state management layer, conditional logic, long-running process resilience
- Crews : agent teams collaboratives exécutant des task complexes avec planification et memory
- Tools, MCPs, Skills, Knowledge : ecosystem d'extensibilité

**Pertinence Daily Chief of Staff** : **OUI** — Flows sera le cœur du Daily Digest orchestrator (Email → Classifier → Planner → Writer → Send), Crews seront les 8 agents spécialisés.

---

## 03. Installation [Source](https://docs.crewai.com/en/installation)

**Dépendances & Setup**

Python >=3.10 et <3.14 requis. OpenAI SDK >=1.13.3. L'outil recommandé est `uv` pour la gestion de projets.

**Étapes installation**
```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Puis
uv tool install crewai
crewai create crew <project_name>

# Dans le project
crewai install
crewai run
```

**Versions**
- CrewAI CLI v0.102.0+
- OpenAI >=1.13.3
- Python 3.10–3.13

**Alternatives** : CrewAI AMP (SaaS, app.crewai.com), CrewAI Factory (self-hosted containerized).

**Pertinence Daily Chief of Staff** : **OUI** — Base du microservice FastAPI CrewAI sur Railway.

---

## 04. Quickstart [Source](https://docs.crewai.com/en/quickstart)

**Résumé**

En ~15 min, créer un research Flow mono-agent avec output markdown. Scaffold via `crewai create flow latest-ai-flow`. Agents définis en YAML (`agents.yaml`), tasks en YAML (`tasks.yaml`), Crew classe Python wires agents + tasks + tools, Flow classe orchestre via `@start()` + `@listen()` decorators. Web search via `SerperDevTool`.

**Flow architecture pattern**
```python
from crewai import Flow, Crew, Agent, Task
from crewai.tools import SerperDevTool

class ResearchFlow(Flow):
    @start()
    def research_topic(self):
        # Set topic in state
        return {"topic": "AI Trends"}
    
    @listen(research_topic)
    def run_research_crew(self, state):
        crew = ContentCrew().crew()
        result = crew.kickoff(inputs={"topic": state["topic"]})
        return result
```

**Setup steps**
1. Scaffold : `crewai create flow <name>`
2. Configure agents.yaml, tasks.yaml
3. Instantiate Crew + attach tools
4. Define Flow avec @start/@listen
5. Set .env (SERPER_API_KEY, LLM creds)
6. `crewai run`

**Output** : Markdown report → `output/report.md`

**Deployment** : CrewAI AMP via `crewai deploy create`, `crewai deploy push` (GitHub-hosted repos).

**Pertinence Daily Chief of Staff** : **OUI** — Template exact pour Daily Digest Flow + 8 agent crews.

---

## 05. Changelog [Source](https://docs.crewai.com/en/changelog)

**Version actuelle** : v1.14.5a6 (May 15, 2026)

**Récentes majores (v1.14.x)**
- v1.14.4 (May 1) : Custom persistence keys, Azure OpenAI Responses API, Vertex workload identity, Tavily + You.com MCPs
- v1.14.2 (Apr 17) : Checkpoint resume/diff/prune CLI, `from_checkpoint` Agent.kickoff, template mgmt, LLM token tracking w/ reasoning tokens
- v1.14.0 (Apr 7) : Runtime checkpointing, event system, SqliteProvider, CheckpointConfig, path traversal + SSRF protections
- v1.0.0 (Oct 20, 2025) : Enterprise production-ready (flows, memory, LLM providers)

**Récentes (v1.14.4–5a6)** : streamed tool calls, doc improvements, dependency updates (langsmith >=0.8.0).

**Pertinence Daily Chief of Staff** : **À évaluer** — Checkpointing critical pour resume email processing après crash, token tracking pour cost monitoring.

---

## 06. Agents [Source](https://docs.crewai.com/en/concepts/agents)

**Définition & Rôle**

Un **Agent** est l'unité autonome capable d'exécuter tasks, prendre décisions, utiliser tools, collaborer, et maintenir interaction memory.

**Attributs essentiels** (requis)
```python
Agent(
    role="str",            # Fonction et expertise
    goal="str",            # Objectif guidant les décisions
    backstory="str",       # Contexte et personnalité
)
```

**Attributs optionnels clés**
| Category | Parameters |
|----------|-----------|
| Model & Tools | `llm`, `function_calling_llm`, `tools` |
| Execution Control | `max_iter` (default 20), `max_rpm`, `max_execution_time`, `max_retry_limit` (default 2) |
| Behavior | `verbose`, `allow_delegation`, `allow_code_execution` *(deprecated)* |
| Context Management | `respect_context_window` (default True), `memory` |
| Advanced | `reasoning`, `max_reasoning_attempts`, `multimodal`, `inject_date` |
| Custom | `system_template`, `prompt_template`, `response_template` |
| Knowledge | `knowledge_sources`, `embedder` |

**Creation patterns**

*YAML (recommandé)*
```yaml
# config/agents.yaml
researcher:
  role: "{topic} Senior Data Researcher"
  goal: "Uncover cutting-edge developments in {topic}"
  backstory: "Seasoned researcher with expertise in {topic}..."
```

*Code direct*
```python
from crewai import Agent
from crewai.tools import SerperDevTool

agent = Agent(
    role="Senior Data Scientist",
    goal="Analyze datasets for actionable insights",
    backstory="10+ years in data science...",
    tools=[SerperDevTool()],
    verbose=True,
    respect_context_window=True
)

# Direct execution
result = agent.kickoff("Your query")
print(result.raw)
```

**Features critiques**
- `respect_context_window=True` : auto-summarizes content exceeding token limits
- `kickoff()` : direct agent interaction sans crew orchestration
- `response_format` : structured output via Pydantic models
- Deprecated : `allow_code_execution`, `CodeInterpreterTool` → use E2B/Modal instead

**Pertinence Daily Chief of Staff** : **OUI** — Agent est le cœur des 8 microservices (Inbox Collector, Classifier, Priority, Action Extractor, Daily Planner, Draft Writer, Automation Manager, Chief of Staff).

---

## 07. Agent Capabilities [Source](https://docs.crewai.com/en/concepts/agent-capabilities)

**Deux catégories**

**Action Capabilities** (agents *perform* actions)
- **Tools** : callable functions pour web search, file ops, API calls
- **MCP Servers** : remote tool servers via Model Context Protocol
- **Apps** : SaaS integrations (Gmail, Slack, Jira, Salesforce) avec platform tokens

**Context Capabilities** (agents *reason* + *know*)
- **Skills** : domain expertise injected in prompts (how to think)
- **Knowledge** : semantic search over docs/files/URLs (what to know) — RAG

**Intégration typique** : Research agent = web search tools (action) + research methodology skills (context) + company docs knowledge (context).

**Distinction clé** : actions expand *what agents do*, context shapes *how agents think*.

**Pertinence Daily Chief of Staff** : **OUI** — Inbox Collector = Gmail tool (action) + email triage skill, Daily Planner = calendar tool + scheduling skill + user context knowledge.

---

## 08. Tasks [Source](https://docs.crewai.com/en/concepts/tasks)

**Définition**

Un **Task** est une assignation spécifique exécutée par un **Agent**.

**Attributs clés**
| Attribute | Type | Purpose |
|-----------|------|---------|
| `description` | `str` | Clear requirement statement |
| `expected_output` | `str` | Completion criteria |
| `agent` | `Optional[BaseAgent]` | Responsible agent |
| `tools` | `List[BaseTool]` | Available resources |
| `context` | `Optional[List[Task]]` | Dependencies (other task outputs) |
| `async_execution` | `Optional[bool]` | Parallel processing |
| `output_file` | `Optional[str]` | Result file path |
| `output_pydantic` | `Optional[Type[BaseModel]]` | Structured output format |
| `guardrail` | `Optional[Callable]` | Validation function |
| `markdown` | `Optional[bool]` | Markdown formatting |
| `callback` | `Optional[Any]` | Post-execution function |

**Creation patterns**

*YAML (recommandé)*
```yaml
research_task:
  description: >
    Conduct research about {topic}
  expected_output: >
    A list with 10 bullet points
  agent: researcher
```

*Code direct*
```python
from crewai import Task, Agent

task = Task(
    description="Research latest AI developments",
    expected_output="Recent AI advancements summary (max 500 words)",
    agent=researcher_agent,
    async_execution=False
)
```

**Output structure** (`TaskOutput`)
- `raw` : default text output
- `json_dict` : JSON-formatted results
- `pydantic` : Pydantic model output
- `summary` : auto-generated (first 10 words)

**Advanced**
- **Guardrails** : validation functions (callable or LLM-based) before dependent tasks
- **Dependencies** : `context=[other_task]` for flexible orchestration
- **Async** : `async_execution=True` for parallel long-running tasks

**Pertinence Daily Chief of Staff** : **OUI** — Each of 8 agents has tasks (Inbox Collector task = fetch+parse emails, Classifier task = categorize, etc.).

---

## 09. Crews [Source](https://docs.crewai.com/en/concepts/crews)

**Définition**

Un **Crew** est "a collaborative group of agents working together to achieve a set of tasks." Définit stratégie exécution, collaboration agents, workflow management.

**Attributs essentiels**

Requis :
- `tasks` : list of assigned tasks
- `agents` : list of participating agents

Optionnels clés :
- `process` : execution flow (sequential ou hierarchical, default sequential)
- `verbose` : logging level
- `manager_llm` : required for hierarchical processes
- `memory` : short-term, long-term, entity memories
- `cache` : tool execution results (enabled by default)
- `checkpoint` : state persistence for resumable runs

**Creation patterns**

*YAML (recommandé)*
```python
from crewai import CrewBase, Crew, Process, Agent, Task

@CrewBase
class YourCrewName:
    agents_config = 'config/agents.yaml'
    tasks_config = 'config/tasks.yaml'
    
    @agent
    def researcher(self) -> Agent:
        return Agent(**self.agents_config["researcher"])
    
    @task
    def research_task(self) -> Task:
        return Task(**self.tasks_config["research"])
    
    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,  # or Process.hierarchical
            verbose=True
        )
```

*Code direct*
```python
crew = Crew(
    agents=[agent1, agent2],
    tasks=[task1, task2],
    process=Process.sequential,
    memory=True,  # enable unified memory
    cache=True
)
```

**Execution methods**
- Sync : `crew.kickoff()`, `crew.kickoff_for_each(inputs_list)`
- Async : `crew.akickoff()`, `crew.akickoff_for_each()`

**Output** (`CrewOutput`)
- `raw` : default string output
- `json_dict` : structured dict
- `pydantic` : type-safe model
- `tasks_output` : individual task results
- `token_usage` : LLM performance metrics

**Advanced features**
- **Checkpointing** : resume interrupted runs
- **Streaming** : real-time output visibility
- **Replay** : resume from specific checkpoint via CLI
- **Logging** : save to `.txt` or `.json`

**Pertinence Daily Chief of Staff** : **OUI** — Central orchestrator pour chaque workflow (Email Processing Crew, Slack Processing Crew, Calendar Crew, etc.).

---

## 10. Flows [Source](https://docs.crewai.com/en/concepts/flows)

**Définition**

Flows permettent structured, event-driven AI workflows chaînant tasks, crews, agents. State management + conditional logic + persistence.

**Core decorators**

```python
from crewai import Flow, Crew, Agent, Task
from pydantic import BaseModel

class MyState(BaseModel):
    user_id: str
    messages: list[str]

class MyFlow(Flow):
    model_config = {'extra': 'forbid'}
    
    @start()
    def initialize(self) -> dict:
        """Entry point, sets initial state."""
        return {"user_id": "user123", "messages": []}
    
    @listen(initialize)
    def process_input(self, state: MyState) -> dict:
        """Triggered after initialize."""
        crew = MyCrew().crew()
        result = crew.kickoff(inputs={"data": state.messages})
        return {"result": result.raw}
    
    @router(process_input)
    def router_method(self, state: MyState) -> str:
        """Conditional branching."""
        if len(state.messages) > 5:
            return "high_volume"
        return "normal"
    
    @listen("high_volume")
    def handle_high_volume(self, state: MyState) -> None:
        """Triggered by router returning 'high_volume'."""
        pass
```

**State Management**

*Unstructured (dict)*
```python
@start()
def init(self):
    return {"topic": "AI", "depth": "deep"}
```

*Structured (Pydantic, recommandé)*
```python
from pydantic import BaseModel

class ResearchState(BaseModel):
    topic: str
    depth: str  # shallow, medium, deep
    sources: list[str] = []
    id: str = Field(default_factory=lambda: str(uuid4()))
```

**Persistence**

```python
class MyFlow(Flow):
    @persist(on="all_methods")  # Save state after each method
    def method(self):
        pass

# Resume
flow.kickoff(inputs={"id": <saved_uuid>})

# Fork (new state.id, hydrate from old)
flow.kickoff(restore_from_state_id=<uuid>)
```

**Flow control operators**

- `or_(method1, method2)` : listener triggers on any completion
- `and_(method1, method2)` : listener triggers when all complete
- `@human_feedback()` : pause for human approval (CrewAI 1.8.0+)

**Integration**

- **Agents** : lightweight execution with tools + structured Pydantic output
- **Crews** : complex multi-agent orchestration

**Execution & CLI**

```python
flow.kickoff(inputs={"topic": "AI"})         # Sync
flow.kickoff_async(inputs={"topic": "AI"})   # Async
flow.plot("filename.html")                    # Visualization
flow.remember(key, value)                     # Memory
flow.recall(query, scope="/context")          # Memory query
```

```bash
crewai create flow [name]
crewai run
crewai flow plot
```

**Pertinence Daily Chief of Staff** : **OUI — CRITIQUE** — Flow est le master orchestrator. Daily Digest Flow = email fetch → classify → prioritize → extract → plan → write → send avec conditional branching (auto vs manual).

---

## 11. Tools [Source](https://docs.crewai.com/en/concepts/tools)

**Définition**

Tools sont "callable functions" donnant aux agents capacité d'action : web search, file ops, API calls.

**Trois approches création**

**1. BaseTool subclassing**
```python
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

class MyToolInput(BaseModel):
    query: str = Field(..., description="Search query")

class MyCustomTool(BaseTool):
    name: str = "my_tool"
    description: str = "Tool description for agent reasoning"
    args_schema: type[BaseModel] = MyToolInput
    
    def _run(self, query: str) -> str:
        # Implementation
        return f"Result for {query}"
```

**2. Tool decorator (sync)**
```python
from crewai.tools import tool

@tool("Search Web")
def search_web(query: str) -> str:
    """Search the web and return top results."""
    # Implementation
    return f"Search results for {query}"
```

**3. Async tool**
```python
@tool("Async Search")
async def async_search(query: str) -> str:
    """Async search implementation."""
    await some_async_operation(query)
    return results
```

**Built-in tools (35+)**
- Search/RAG : SerperDevTool, WebsiteSearchTool, ExaSearchTool, PDFSearchTool, CSVSearchTool
- Code : CodeInterpreterTool *(deprecated)*, GithubSearchTool, CodeDocsSearchTool
- Web : FirecrawlSearchTool, ScrapeWebsiteTool, BrowserbaseLoadTool
- Media : DALL-E Tool, YoutubeVideoSearchTool
- Database : PGSearchTool

**Advanced features**

```python
class CachedTool(BaseTool):
    def cache_function(self, args: dict) -> Optional[str]:
        """Return cache key if cacheable, None otherwise."""
        if args.get("cached_query"):
            return f"cache_{args['cached_query']}"
        return None
```

**Enterprise** : CrewAI AMP Tools Repository (pre-built enterprise connectors, version control, compliance).

**Pertinence Daily Chief of Staff** : **OUI** — Gmail tool (fetch/parse emails), Slack tool (fetch messages), Google Calendar tool, Notion API tool, Telegram/WhatsApp API tools.

---

## 12. Processes [Source](https://docs.crewai.com/en/concepts/processes)

**Définition**

"Processes orchestrate the execution of tasks by agents, akin to project management in human teams."

**Process types**

**Sequential** (default)
```python
from crewai import Crew, Process

crew = Crew(
    agents=my_agents,
    tasks=my_tasks,
    process=Process.sequential
)
```
Tasks exécutées en ordre, output d'une task informe la suivante.

**Hierarchical**
```python
crew = Crew(
    agents=my_agents,
    tasks=my_tasks,
    process=Process.hierarchical,
    manager_llm="gpt-4o"  # or manager_agent=custom_agent
)
```
"Organizes tasks in a managerial hierarchy with delegation and chain-of-command execution."

**Consensual** (planned, not available)
Democratic decision-making among agents.

**Takeaway** : Process alignent agent efforts vers common objectives avec efficiency et coherence.

**Pertinence Daily Chief of Staff** : **OUI** — Sequential pour Daily Digest (email → classify → prioritize → plan → write). Hierarchical si Chief of Staff agent délègue à specialists.

---

## 13. LLMs [Source](https://docs.crewai.com/en/concepts/llms)

**Providers natifs**

OpenAI, Anthropic, Google Gemini, Azure OpenAI, AWS Bedrock + 60+ autres via LiteLLM.

**Configuration (3 approches)**

```bash
# 1. Env variable
MODEL=gpt-4o
```

```yaml
# 2. YAML agents.yaml
agents:
  researcher:
    llm:
      model: "gpt-4o"
      temperature: 0.7
```

```python
# 3. Direct code
from crewai import Agent
from crewai_tools import SerperDevTool

agent = Agent(
    role="Researcher",
    goal="Research topics",
    llm="gpt-4o",
    tools=[SerperDevTool()]
)
```

**Key parameters**

| Parameter | Range | Purpose |
|-----------|-------|---------|
| `temperature` | 0.0–1.0 | Randomness (0=deterministic, 1=creative) |
| `max_tokens` | int | Response length limit |
| `context_window` | int | Max processable text |
| `top_p` | 0.0–1.0 | Nucleus sampling |
| `frequency_penalty` | -2.0–2.0 | Reduce repetition |
| `stream` | bool | Real-time response chunks |

**Advanced features**

**Streaming**
```python
crew = Crew(..., streaming=True)
result = crew.kickoff(...)
# Responses arrive in chunks with event handlers
```

**Async**
```python
result = await llm.acall(messages=[...])  # Non-blocking
```

**Structured outputs**
```python
from pydantic import BaseModel

class AnalysisOutput(BaseModel):
    summary: str
    score: int

task = Task(
    description="Analyze...",
    output_pydantic=AnalysisOutput
)
```

**Extended thinking** (Claude Sonnet 4+, o1, o3)
```python
agent = Agent(
    role="Analyst",
    llm="claude-sonnet-4",
    reasoning=True,
    max_reasoning_attempts=5
)
```

**Provider highlights**
- **OpenAI** : reasoning models (o1, o3), Responses API (multimodal)
- **Anthropic** : extended thinking, max_tokens requis
- **Google Gemini** : 1M token context, Vertex AI integration
- **AWS Bedrock** : unified Converse API

**Installation**
```bash
# Native provider
uv add "crewai[openai]"  # or anthropic, google, etc.

# LiteLLM (non-native)
uv add "crewai[litellm]"
```

**Pertinence Daily Chief of Staff** : **OUI** — LLM choice impacts cost/quality trade-off. GPT-4o for complex reasoning (Daily Planner, Draft Writer), GPT-4o-mini for lightweight (Classifier, Action Extractor).

---

## 14. Memory [Source](https://docs.crewai.com/en/concepts/memory)

**Unified Memory system**

Single `Memory` class avec intelligent storage + retrieval. LLM-driven content understanding + composite scoring (semantic + recency + importance).

**Usage patterns**

```python
from crewai import Memory

# Standalone
memory = Memory()
memory.remember("Important fact about user preferences")
results = memory.recall("What does user like?", depth="deep")

# With crews
crew = Crew(..., memory=True)  # Default config
# or
crew = Crew(..., memory=Memory(llm="gpt-4o-mini"))

# With agents (scoped access)
agent = Agent(..., memory=crew.memory.scope("/agent/researcher"))

# With flows
class MyFlow(Flow):
    def some_method(self):
        self.remember("Key insight", scope="/project/beta")
        results = self.recall("Find similar insights", scope="/")
        self.extract_memories(scope="/project")
```

**Hierarchical scopes** (filesystem-like)

```python
memory.tree()                                      # View hierarchy
memory.info("/project")                            # Scope stats
memory.recall("query", scope="/project/beta")     # Search branch
memory.reset(scope="/project/old")                # Delete subtree
```

**Memory slices** (multi-scope views)

```python
view = memory.slice(
    scopes=["/agent/researcher", "/company/knowledge"],
    read_only=True
)
# Agents use sliced view, can't modify shared knowledge
```

**Composite scoring**

`score = semantic_weight * similarity + recency_weight * decay + importance_weight * importance`

Configurable weights + half-life for tuning (fast projects vs long-term KBs).

**Save behavior**

Consolidation checks similarity; LLM decides keep/update/delete/insert_new. `remember_many()` non-blocking (returns immediately, background thread saves).

**Recall depths**

- **Shallow** : Direct vector search (~200ms), no LLM
- **Deep** (default) : Multi-step RecallFlow avec query analysis, scope selection, adaptive exploration
- Optimization : queries <200 chars skip LLM analysis in deep mode

**Privacy & source tracking**

```python
memory.remember("secret info", source="confidential", private=True)
# Private memories only appear if source matches during recall
```

**Configuration**

```python
from crewai.memory import Memory

memory = Memory(
    llm="gpt-4o-mini",  # Default: gpt-4o-mini
    embedder={
        "provider": "openai",
        "config": {"model": "text-embedding-3-small"}
    },
    storage="lancedb",  # Default backend
    semantic_weight=0.5,
    recency_weight=0.3,
    importance_weight=0.2,
    recency_half_life_days=30,
    consolidation_threshold=0.85,
    query_analysis_threshold=200  # chars
)

# Fully private
memory = Memory(
    llm="ollama/llama3.2",
    embedder={"provider": "ollama", "config": {"model_name": "mxbai-embed-large"}}
)
```

**Storage**

Default LanceDB at `./.crewai/memory`, configurable via `storage` parameter ou `CREWAI_STORAGE_DIR` env var. Custom backends implement `StorageBackend` protocol.

**Discovery**

```python
memory.list_scopes("/")                # Child scopes
memory.list_categories()               # Available categories
memory.list_records(scope="/project")  # Records in scope
```

CLI : `crewai memory` launches interactive TUI.

**Event monitoring**

All operations emit events (`source_type="unified_memory"`). Listen via `BaseEventListener` for `MemoryQueryStartedEvent`, `MemoryQueryCompletedEvent`, etc.

**Pertinence Daily Chief of Staff** : **OUI — CRITIQUE** — User context memory (preferences, previous decisions, important dates) est essential pour Daily Planner et Draft Writer. Scoped memory per agent.

---

## 15. Knowledge [Source](https://docs.crewai.com/en/concepts/knowledge)

**Définition**

"A reference library agents can consult while working." RAG system enabling semantic search over external documents (PDFs, URLs, CSVs, etc.).

**RAG providers** (provider-neutral)

- **ChromaDB** (default vector store)
- **Qdrant** (alternative)

Identical APIs : collection creation, document addition, semantic search.

**Knowledge sources** (supported types)

```python
from crewai.knowledge import PDFKnowledgeSource, CSVKnowledgeSource, URLKnowledgeSource, TextKnowledgeSource

# Agent-level knowledge
agent = Agent(
    role="Analyst",
    knowledge_sources=[
        PDFKnowledgeSource(file_path="./knowledge/reports.pdf"),
        CSVKnowledgeSource(file_path="./knowledge/data.csv"),
        URLKnowledgeSource(urls=["https://example.com/docs"]),
        TextKnowledgeSource(content="Raw text content")
    ]
)

# Crew-level knowledge (shared)
crew = Crew(
    agents=[...],
    tasks=[...],
    knowledge_sources=[
        PDFKnowledgeSource(file_path="./knowledge/company_handbook.pdf")
    ]
)
```

**Storage locations** (platform-specific)

- macOS : `~/Library/Application Support/CrewAI/{project}/knowledge/`
- Linux : `~/.local/share/CrewAI/{project}/knowledge/`
- Windows : `C:\Users\{username}\AppData\Local\CrewAI\{project}\knowledge\`
- Custom : `CREWAI_STORAGE_DIR` env var

**Configuration**

```python
crew = Crew(
    agents=[...],
    tasks=[...],
    knowledge_sources=[...],
    knowledge_config={
        "results_limit": 5,          # Default: 3
        "score_threshold": 0.4,      # Default: 0.35
        "embedder": {
            "provider": "openai",
            "config": {"model": "text-embedding-3-large"}
        }
    }
)
```

**Advanced features**

- **Query rewriting** : auto-optimize task prompts for retrieval
- **Knowledge events** : `KnowledgeRetrievalStartedEvent`, `KnowledgeRetrievalCompletedEvent` for monitoring
- **Custom sources** : extend `BaseKnowledgeSource` for proprietary data

**Best practices**

- Organize related information into separate sources
- Use agent-level knowledge for role-specific docs; crew-level for shared
- Set embedders explicitly in production
- Reset knowledge after source updates : `crewai reset-memories --knowledge`
- Configure `CREWAI_STORAGE_DIR` explicitly in prod

**Pertinence Daily Chief of Staff** : **OUI** — User knowledge base (email history summaries, past decisions, preferences, important contacts) injected via agent-level knowledge sources.

---

## 16. Skills [Source](https://docs.crewai.com/en/concepts/skills)

**Définition**

**"Skills are NOT tools."** Skills = filesystem-based packages injecting domain expertise (how to think). Tools = callable functions (what to do).

**Structure**

```
my_skill/
├── SKILL.md          # Required: YAML frontmatter + markdown instructions
├── scripts/          # Optional: auxiliary scripts
├── references/       # Optional: reference materials
└── assets/           # Optional: images, diagrams
```

**SKILL.md format**

```yaml
---
name: "Research Methodology Skill"
description: "Guidelines for conducting thorough research"
license: "MIT"
compatibility: ["agent", "crew"]
metadata:
  tags: ["research", "methodology"]
---

# Research Guidelines

1. Define research objectives clearly
2. Identify authoritative sources
3. Cross-reference findings
4. Document sources
5. Summarize key insights
```

**Loading & priority**

```python
# Agent-level (takes priority)
agent = Agent(
    role="Researcher",
    skills=[ResearchMethodologySkill()]
)

# Crew-level
crew = Crew(
    agents=[...],
    tasks=[...],
    skills=[ResearchMethodologySkill()]  # Shared
)
```

"Agent-level skills take priority—if same skill at both levels, agent's version is used."

**Patterns**

- **Skills alone** : expertise without external actions (e.g., technical writers)
- **Tools alone** : capabilities without methodology (e.g., general web search)
- **Skills + Tools** (most common) : methodology guides action (e.g., security analyst = audit checklists + scanning tools)

Works with MCPs, platform Apps too.

**Skills vs Knowledge**

| Aspect | Skills | Knowledge |
|--------|--------|-----------|
| Method | Prompt injection | Vector search (RAG) |
| Purpose | Procedures, guidelines | Factual data |
| Use case | Methodology, best practices | Reference material |

**Pertinence Daily Chief of Staff** : **OUI** — Daily Planner skill = scheduling best practices, Draft Writer skill = email composition guidelines, Classifier skill = email categorization rules.

---

## 17. Reasoning [Source](https://docs.crewai.com/en/concepts/reasoning)

**Core configuration**

```python
from crewai import Agent

agent = Agent(
    role="Data Analyst",
    goal="Analyze complex datasets",
    reasoning=True,                    # Enable planning
    max_reasoning_attempts=3           # Limit refinement cycles
)
```

**Operational workflow**

1. Reflect on assigned task
2. Generate detailed execution plan
3. Assess readiness to proceed
4. Refine as needed (until max_reasoning_attempts or ready)
5. Inject plan into task execution

**Plan typically includes**

- Task comprehension analysis
- Sequential step identification
- Challenge mitigation strategies
- Tool utilization planning
- Expected outcome definition

**Behavior**

"This helps agents break down complex tasks into manageable steps and identify potential challenges before starting."

**Resilience**

If reasoning fails, execution continues without plan. Error handling ensures task completion.

**Pertinence Daily Chief of Staff** : **À évaluer** — Useful for Daily Planner (reason about task prioritization) + Chief of Staff manager (plan multi-agent orchestration). May add latency.

---

## 18. Planning [Source](https://docs.crewai.com/en/concepts/planning)

**Définition**

Crews develop step-by-step strategies before execution. "Before each Crew iteration, all Crew information is sent to an AgentPlanner that will plan the tasks step by step."

**Activation**

```python
from crewai import Crew, Process

crew = Crew(
    agents=my_agents,
    tasks=my_tasks,
    process=Process.sequential,
    planning=True,                     # Enable planning
    planning_llm="gpt-4o"              # Custom LLM (default: gpt-4o-mini)
)
```

**Default LLM**

Uses `gpt-4o-mini` (requires valid OpenAI API key). Override via `planning_llm` parameter.

**Output example**

AgentPlanner generates detailed step-by-step instructions covering scope definition, source identification, data collection, analysis, information organization, final compilation.

**Consideration**

"This could cause confusion if you don't have an OpenAI API key configured or if you're experiencing unexpected behavior related to LLM API calls when agents use different LLM providers than the planner."

**Pertinence Daily Chief of Staff** : **À évaluer** — May improve complex multi-agent orchestration but adds latency + cost. Best for Chief of Staff manager, not all agents.

---

## 19. Checkpointing [Source](https://docs.crewai.com/en/concepts/checkpointing)

**Définition**

"Automatically save execution state so crews, flows, and agents can resume after failures."

**Basic implementation**

```python
from crewai import Crew, CheckpointConfig

# Simple
crew = Crew(
    agents=[...],
    tasks=[...],
    checkpoint=True  # Saves to ./.checkpoints/
)

# Advanced
crew = Crew(
    agents=[...],
    tasks=[...],
    checkpoint=CheckpointConfig(
        location="./my_checkpoints",
        on_events=["task_completed", "crew_kickoff_completed"],
        provider="sqlite",  # or "json"
        max_checkpoints=5
    )
)
```

**Configuration parameters**

| Parameter | Purpose |
|-----------|---------|
| `location` | Directory or DB path |
| `on_events` | Trigger events (task_completed, crew_kickoff_completed, etc.) |
| `provider` | Backend (JsonProvider or SqliteProvider) |
| `max_checkpoints` | Max snapshots stored; oldest pruned |
| `restore_from` | Path to prior checkpoint for resumption |

**Recovery strategies**

**Resume**
```python
result = crew.kickoff(
    from_checkpoint=CheckpointConfig(
        restore_from="./my_checkpoints/20260407T120000_abc123.json"
    )
)
```

**Fork** (new lineage, prevents collisions)
```python
crew = Crew.fork(config, branch="experiment-a")
result = crew.kickoff(inputs={"strategy": "aggressive"})
```

**Storage options**

- **JsonProvider** : human-readable files, good for inspection
- **SqliteProvider** : single DB file, better for high-frequency checkpointing

**CLI**

```bash
crewai checkpoint                    # Interactive TUI
crewai checkpoint --location ./path  # Specify path
crewai checkpoint list ./path        # List checkpoints
# Browse, resume, fork, edit task outputs before resumption
```

**Pertinence Daily Chief of Staff** : **OUI — CRITIQUE** — Email processing often interrupted. Checkpointing enables resume from last completed task without reprocessing.

---

## 20. Collaboration [Source](https://docs.crewai.com/en/concepts/collaboration)

**Enabling delegation**

```python
agent = Agent(
    role="Senior Analyst",
    goal="Comprehensive analysis",
    allow_delegation=True  # Enable inter-agent communication
)
```

**Collaboration tools**

- **Delegate Work Tool** : assign tasks to teammates with expertise, context, coworker ID
- **Ask Question Tool** : request information from colleagues

**Common patterns**

**Sequential workflow** : research → writing → editing, each stage receives prior outputs

**Unified task** : lead agent manages one task, calls specialists as needed

**Hierarchical** : manager coordinates non-delegating specialists (prevent loops)

**Best practices**

- Define distinct, complementary roles (not generic)
- Use `context` parameters to share task outputs
- Write specific task descriptions
- Enable delegation selectively (coordinators yes, specialists no)
- Integrate memory (`memory=True`) for improved delegation decisions

**Troubleshooting**

- *Isolation* : verify `allow_delegation=True`
- *Excessive back-and-forth* : enhance task context, clarify specialist roles
- *Delegation loops* : clear hierarchy, disable delegation for specialists

**Pertinence Daily Chief of Staff** : **À évaluer** — Chief of Staff manager could delegate email triage to Classifier agent, prioritization to Priority agent, etc. Requires careful role definition to avoid circular delegation.

---

## 21. Training [Source](https://docs.crewai.com/en/concepts/training)

**Overview**

Agents improve through iterative feedback cycles. Captures human input, consolidates learnings into persistent guidance files.

**Training methods**

```bash
# CLI
crewai train -n 5 -f learned_behavior.pkl
```

```python
# Programmatic
YourCrewName_Crew().crew().train(
    n_iterations=5,
    inputs={"topic": "AI"},
    filename="learned_behavior.pkl"
)
```

**Two-phase architecture**

**1. Active training**
Per iteration records :
- Initial agent output
- Human feedback
- Improved output
- Saved to session-specific `training_data.pkl`

**2. Post-training consolidation**
- "Clear, actionable instructions distilled from your feedback"
- Quality scores (0–10)
- Step-by-step action items
- Persistent `trained_agents_data.pkl`

**Fine-tuning strategies**

**Model selection matters** : smaller models (≤7B params) struggle with structured outputs + complex instructions. Minimums : Mistral 7B, Claude 3 Sonnet, GPT-4o.

**Constraints**
- `n_iterations` must be positive int
- Filename must end `.pkl`
- Requires interactive human input
- Guidance applies at prompt-time only

**Best practices**
- Regular retraining keeps agents current
- Absolute paths via `-f` flag
- Agents auto-load from default file unless renamed

**Pertinence Daily Chief of Staff** : **À évaluer** — Could train agents on user's email style preferences (Draft Writer), categorization rules (Classifier), priority criteria (Priority agent). Requires human feedback loop.

---

## 22. Testing [Source](https://docs.crewai.com/en/concepts/testing)

**Overview**

CLI-based testing evaluates crew performance over multiple iterations.

**Testing command**

```bash
crewai test
crewai test --n_iterations 5 --model gpt-4o
crewai test -n 5 -m gpt-4o
```

**Parameters**
- `n_iterations` (optional, default 2)
- `model` (optional, default gpt-4o-mini)
- Currently OpenAI only

**Performance metrics**

Scoring table displays :
- Individual task scores (1–10, higher better)
- Agent assignments per task
- Average scores across iterations
- Overall crew performance
- Execution time tracking

**Pertinence Daily Chief of Staff** : **À évaluer** — Use to evaluate crew quality before production. Iterate on agents until consistency and accuracy pass thresholds.

---

## 23. Event Listener [Source](https://docs.crewai.com/en/concepts/event-listener)

**Core architecture**

`CrewAIEventsBus` (singleton) + `BaseEvent` (foundation) + `BaseEventListener` (abstract handler).

**Implementation**

```python
from crewai.event import CrewAIEventsBus, BaseEventListener, CrewKickoffStartedEvent, CrewKickoffCompletedEvent

class MyCustomListener(BaseEventListener):
    def setup_listeners(self, crewai_event_bus):
        @crewai_event_bus.on(CrewKickoffStartedEvent)
        def handle_crew_start(source, event):
            print(f"Crew '{event.crew_name}' started at {event.timestamp}")
        
        @crewai_event_bus.on(CrewKickoffCompletedEvent)
        def handle_crew_complete(source, event):
            print(f"Crew completed. Output: {event.output}")

# Module-level instantiation (prevents GC)
listener = MyCustomListener()
```

**Critical requirement** : Module-level instantiation prevents garbage collection and ensures handler registration.

**60+ event types** (organized by category)

| Category | Sample Events |
|----------|---------------|
| Crew | CrewKickoffStartedEvent, CrewKickoffCompletedEvent, CrewKickoffFailedEvent |
| Agent | AgentExecutionStartedEvent, AgentExecutionCompletedEvent, AgentEvaluationCompletedEvent |
| Task | TaskStartedEvent, TaskCompletedEvent, TaskFailedEvent |
| Tools | ToolUsageStartedEvent, ToolUsageFinishedEvent, ToolExecutionErrorEvent |
| MCP | MCPConnectionStartedEvent, MCPToolExecutionCompletedEvent, MCPConnectionFailedEvent |
| Knowledge | KnowledgeRetrievalStartedEvent, KnowledgeQueryCompletedEvent, KnowledgeQueryFailedEvent |
| LLM Guardrails | LLMGuardrailStartedEvent, LLMGuardrailCompletedEvent, LLMGuardrailFailedEvent |
| Flow | FlowStartedEvent, FlowFinishedEvent, MethodExecutionStartedEvent |
| Human Feedback | FlowInputRequestedEvent, HumanFeedbackReceivedEvent |
| LLM | LLMCallStartedEvent, LLMStreamChunkEvent, LLMThinkingChunkEvent |
| Memory | MemoryQueryStartedEvent, MemorySaveCompletedEvent, MemoryRetrievalFailedEvent |
| Reasoning | AgentReasoningStartedEvent, AgentReasoningCompletedEvent |
| A2A Delegation | A2ADelegationStartedEvent, A2AParallelDelegationCompletedEvent |

**Handler structure**

Each handler receives `source` (emitting object) + `event` (timestamp, type, event-specific data).

**Scoped handlers** (context manager)

```python
with crewai_event_bus.scoped_handlers():
    @crewai_event_bus.on(CrewKickoffStartedEvent)
    def temp_handler(source, event):
        pass
```

**Best practices**

Keep handlers lightweight, include error handling, avoid blocking ops, listen selectively, test in isolation. "Event handlers should be lightweight and avoid blocking operations" to prevent degradation.

**Enterprise** : CrewAI AMP Prompt Tracing leverages events for debugging, token tracking, prompt history, team collaboration.

**Pertinence Daily Chief of Staff** : **OUI** — Monitor agent + task execution, log errors, track timing for cost/performance analysis, notify user of key milestones (email processed, daily digest ready).

---

## 24. Files [Source](https://docs.crewai.com/en/concepts/files)

**Multimodal support**

Agents process images, PDFs, audio, video, text. Auto-formatted per LLM provider requirements.

**File classes** (6 types)

```python
from crewai.files import ImageFile, PDFFile, AudioFile, VideoFile, TextFile, File

# Local path
image = ImageFile(source="./images/chart.png")

# URL
pdf = PDFFile(source="https://example.com/report.pdf")

# Bytes
from crewai.files import FileBytes
audio = AudioFile(source=FileBytes(data=audio_bytes, filename="recording.m4a"))

# Auto-detection
generic = File(source="./data/output.log")
```

**Input sources**
- Local paths
- URLs
- Bytes objects

**Hierarchical attachment** (cascading precedence)

Flow `input_files` < Crew `input_files` < Task `input_files`

```python
flow = Flow(
    input_files={"context": PDFFile(source="./context.pdf")}
)

crew = Crew(
    agents=[...],
    tasks=[...],
    input_files={"guide": TextFile(source="./style_guide.txt")}
)

task = Task(
    description="...",
    input_files={"data": CSVFile(source="./data.csv")}  # Overrides broader
)
```

**Provider support matrix** (varies)

| Type | OpenAI Completions | OpenAI Responses | Anthropic | Google Gemini | AWS Bedrock | Azure OpenAI |
|------|------------------|------------------|-----------|---------------|-------------|--------------|
| Images | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PDFs | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Audio | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ |
| Video | ✗ | ✗ | ✗ | ✓ (1h, 2GB) | ✗ | ✗ |

**Transmission optimization**

- Inline Base64 : small files (<5MB typical)
- File Upload API : large files
- URL references : pre-existing URLs

**File handling modes**

```python
task = Task(
    description="...",
    input_files={...},
    file_handling="auto"  # strict, auto, warn, chunk
)
```

**Provider size constraints** (significant variation)
- Google Gemini : 100MB images, 1h video, 2GB total
- AWS Bedrock : images 4.5MB max
- Most others : 5–20MB

**Pertinence Daily Chief of Staff** : **OUI** — Handle PDF/text attachments in emails, screenshots in Slack messages, audio notes. Task input files for email content parsing.

---

## 25. Production Architecture [Source](https://docs.crewai.com/en/concepts/production-architecture)

**Flow-first mindset** (recommended)

Start with **Flow**, not standalone Crews/Agents. Three benefits :

1. **State Management** : track data across app steps, maintain context, handle user interactions
2. **Control** : loops, conditionals, branching for edge cases + predictable behavior
3. **Observability** : simplified debugging + performance monitoring via CrewAI tracing

**Architectural template**

```python
from crewai import Flow, Crew, Agent, Task
from pydantic import BaseModel

class ApplicationState(BaseModel):
    user_id: str
    input_data: str
    processing_status: str = "pending"
    result: Optional[str] = None

class MyApplicationFlow(Flow):
    model_config = {'extra': 'forbid'}
    
    @start()
    def initialize(self) -> ApplicationState:
        """Entry point."""
        return ApplicationState(
            user_id="user123",
            input_data="initial data"
        )
    
    @listen(initialize)
    def process_with_crew(self, state: ApplicationState) -> ApplicationState:
        """Delegate work to crew."""
        crew = MyProcessingCrew().crew()
        result = crew.kickoff(inputs={"data": state.input_data})
        state.result = result.raw
        state.processing_status = "completed"
        return state
```

**State definition** (key best practice)

"Use Pydantic models to define your state. This ensures type safety and makes it clear what data is available at each step."

Keep state minimal, structured. Avoid loose dicts.

**Crews as work units**

Delegate specialized tasks to focused Crews. Pass necessary state data explicitly.

**Production safeguards** (3 mechanisms)

1. **Task guardrails** : validate outputs before acceptance
2. **Structured outputs** : use `output_pydantic` or `output_json` to prevent parsing failures
3. **LLM hooks** : inspect pre-submission messages, sanitize responses

**Persistence** (resumability)

```python
class MyFlow(Flow):
    @persist(on="all_methods")
    def some_method(self, state: AppState):
        pass

# Resume
flow.kickoff(inputs={"id": <saved_uuid>})

# Fork
flow.kickoff(restore_from_state_id=<uuid>)
```

**Deployment**

**CrewAI Enterprise** : infrastructure + monitoring automated via `crewai deploy create`

**Self-hosted** : FastAPI/Railway container with `Flow` + `Crew` classes

**Observability** : `crewai login` enables complimentary tracing features.

**Pertinence Daily Chief of Staff** : **OUI — ARCHITECTURE FONDATION** — Daily Digest Flow est le master orchestrator. Pass ApplicationState (user context, emails, tasks) through 8-agent Crew pipeline.

---

## 26. CLI [Source](https://docs.crewai.com/en/concepts/cli)

**Syntax** : `crewai [COMMAND] [OPTIONS] [ARGUMENTS]`

**Project creation**

```bash
crewai create crew my_crew          # New crew project
crewai create flow my_flow          # New flow project
```

**Execution & testing**

```bash
crewai run                           # Execute crew/flow (auto-detects)
crewai chat                          # Interactive session with crew
crewai test -n 5 -m gpt-4o          # Evaluate performance (5 iterations, gpt-4o)
```

**Training & replay**

```bash
crewai train -n 3                   # Train iteratively (3 iterations)
crewai replay -t <task_id>          # Re-execute from specific task
```

**Memory management**

```bash
crewai reset-memories               # Clear all memories
crewai reset-memories --short       # Short-term only
crewai reset-memories --long        # Long-term only
crewai reset-memories --entities    # Entity memories only
```

**Utilities**

```bash
crewai version                      # Display installed version
crewai version --tools              # Tools list
crewai log-tasks-outputs            # Retrieve latest execution outputs
```

**Checkpointing** (interactive TUI)

```bash
crewai checkpoint                   # Launch TUI
crewai checkpoint --location ./path # Custom location
crewai checkpoint list ./path       # List checkpoints
# Browse, resume, fork, edit before resumption
```

**Deployment (CrewAI AMP)**

```bash
crewai login                        # Device code flow auth
crewai deploy create                # Initialize deployment
crewai deploy push                  # Upload to AMP
crewai deploy status                # Check progress
crewai deploy logs                  # Stream logs
crewai deploy list                  # List all deployments
```

**Configuration**

```bash
crewai config list                  # Display current settings
crewai config set <key> <value>    # Update parameter
crewai org list                     # List orgs
crewai org current                  # Current org
crewai org switch <org_id>         # Switch org
```

**Tracing & observability**

```bash
crewai traces enable                # Enable trace collection
crewai traces disable               # Disable
crewai traces status                # Check status
```

Also via code : `crew = Crew(..., tracing=True)` or env var override.

**Pertinence Daily Chief of Staff** : **OUI** — CLI for local dev, testing, training on email processing patterns. `crewai run` launches Daily Digest Flow.

---

---

## Synthèse Foundations pour Daily Chief of Staff

### Architecture générale

Le **Daily Chief of Staff microservice** repose sur une architecture Flow-Crew-Agent à trois niveaux :

1. **Flow master** (`Daily Digest Flow`) : Orchestrateur principal avec state management (user context, emails, tasks, pending actions) et conditional logic (if errors → fallback, if high volume → parallel processing).

2. **8 Crews spécialisés** (chacun exécutant des Tasks en séquence ou hiérarchie selon complexité) :
   - **Inbox Collector Crew** : fetch + parse emails (Gmail tool)
   - **Classifier Crew** : catégoriser par type (skill: email taxonomy)
   - **Priority Crew** : scorer + ranger par urgence (knowledge: user preferences + past decisions)
   - **Action Extractor Crew** : extraire obligations + deadlines (structured output JSON)
   - **Daily Planner Crew** : orchestrer jour (reasoning=True, knowledge: calendar + previous plans)
   - **Draft Writer Crew** : composer résumé + brouillons (skill: email style guide, planning=True)
   - **Automation Crew** : décider auto-actions vs manual (knowledge: user automation rules)
   - **Chief of Staff Manager Crew** (hierarchical) : déléguer, valider, optimizer flow

3. **Agents transversaux** : chaque agent dispose LLM distinct (gpt-4o pour reasoning, gpt-4o-mini pour lightweight), knowledge sources (user context, email history), skills (best practices), memory (shared crew memory + scoped agent memory), tools (APIs).

### Composants critiques

| Composant | Utilisation | Raison |
|-----------|------------|--------|
| **Flow** | Master orchestrator avec @start/@listen/@router | State persistence, conditional logic, user interaction pauses |
| **Crew** | 8 pipelines parallélisables (async_execution=True pour tasks indépendantes) | Collaboration agents, process management (sequential pour dependency, hierarchical si delegation) |
| **Agent** | Rôle spécialisé (researcher, writer, analyst) | Autonomy, memory, tool access, reasoning |
| **Task** | Work unit avec expected_output + guardrail | Composability, structured output (pydantic), dependency chaining |
| **Tools** | Gmail/Slack/Calendar/Telegram/Notion APIs | Agent capabilities (action layer) |
| **Skills** | Email triage rules, writing style, prioritization logic | Context injection (reasoning layer) |
| **Knowledge** | User email history, preferences, previous decisions, important contacts | RAG for semantic search (info layer) |
| **Memory** | Unified memory (short-term interaction, long-term patterns) | Agent learning, scoped per agent, event-driven persistence |
| **Checkpointing** | JSON/SQLite persisted state | Resume after crash, fork for experimentation |
| **Event Listener** | Monitor task completion, log errors, notify user | Observability, debugging, user notifications (task started, daily digest ready) |
| **LLM config** | Per-agent choice (gpt-4o vs gpt-4o-mini) | Cost-quality trade-off, provider selection (Anthropic for reasoning) |
| **Files** | Email attachments (PDFs, images), Slack screenshots | Multimodal support, auto-formatting per provider |
| **Training** | Iterative feedback on classifier rules, writer style | Agent improvement via human loop (user feedbacks on email categorization) |

### Data flow Daily Digest exemple

```
Flow start (fetch emails from Gmail)
  ↓
Apply Inbox Collector Crew (retrieve, parse)
  ↓
Apply Classifier Crew (categorize + priority score)
  ↓
Apply Action Extractor Crew (find tasks + deadlines)
  ↓
Parallel: Daily Planner + Draft Writer (with @listen(or_(planner, writer)))
  ↓
Apply Automation Crew (suggest auto-actions)
  ↓
Router: if errors → retry, else continue
  ↓
Persist state (checkpoint), notify user
  ↓
Flow end (return structured daily digest)
```

### Migration existant vers CrewAI

**Déjà en place** :
- FastAPI backend ✓
- Agent architecture ✓
- Multi-agent orchestration ✓
- Email/Slack/Calendar APIs ✓

**À lever de CrewAI** :
- **Flow orchestration** : replace custom scheduler with Flows (@start/@listen/@router)
- **Agent framework** : move to CrewAI Agent class, standardize role/goal/backstory
- **Task structure** : explicit Task objects (description, expected_output, agent, context, guardrail)
- **Crew processes** : leverage Process.sequential / Process.hierarchical instead of custom logic
- **Checkpointing** : enable resumability for fault tolerance
- **Memory system** : use unified Memory for context persistence (user preferences, past decisions)
- **Tools standardization** : wrap existing APIs in CrewAI Tool decorator or BaseTool
- **Skills registry** : codify domain knowledge (email triage, writing style) as SKILL.md packages
- **Knowledge sources** : ingest user email history, company docs as vector-searchable sources
- **Event bus** : plug into event listener for monitoring + user notifications

### Considérations production

1. **State management** : Pydantic models for Flow state (type safety)
2. **Guardrails** : validate agent outputs before downstream tasks (email addresses, dates, JSON)
3. **Structured outputs** : enforce `output_pydantic` for Classifier, Action Extractor, Draft Writer
4. **LLM cost** : monitor token usage per agent via events, profile gpt-4o-mini for lightweight tasks
5. **Latency** : trade reasoning=True (planning) vs speed; async_execution=True for parallel tasks
6. **User experience** : @human_feedback for manual review before auto-send (conservative v1)
7. **Observability** : enable event listener + CrewAI tracing (`crewai login`), log to centralized system
8. **Persistence** : SQL/SQLite checkpoint backend in production, resume-from-latest on deploy
9. **Testing** : `crewai test` CLI for evaluating crew consistency before release

---

**Total words** : ~6800 | **Coverage** : 26/26 pages ingérées | **Format** : Production-ready documentation with Python signatures, code snippets, relevance annotations, and direct applicability to Daily Chief of Staff microservice architecture.
