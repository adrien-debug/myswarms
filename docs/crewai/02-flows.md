# 02 — Flows, API Reference et Process tutos

Ingestion exhaustive du LOT 2 de la documentation CrewAI : 14 pages couvrant l'API REST (kickoff/resume/status), les Flows (orchestration procédurale + AI), et les patterns de process (séquentiel, hiérarchique, conditionnel, async, for-each, replay). **Critique pour Daily Chief of Staff** : ces composants décrivent l'intégralité du cycle execution que notre microservice Python exposera via REST vers Next.js.

---

## API Reference

### 1. API Reference — Introduction

**Source** : https://docs.crewai.com/en/api-reference/introduction

CrewAI AMP (Agent Management Platform) expose trois endpoints primaires pour orchestrer crews :
- `GET /inputs` : découvrir les paramètres requis avant exécution
- `POST /kickoff` : démarrer une exécution, retourne `kickoff_id` unique
- `GET /status/{kickoff_id}` : monitorer progression et récupérer résultats

Chaque crew dispose d'une URL endpoint propre : `https://your-crew-name.crewai.com`. L'authentification se fait via Bearer token organisationnel ou user-scoped. Workflow standard : GET /inputs → POST /kickoff → GET /status → extraction output.

**HTTP Status Codes** :
| 200 | 400 | 401 | 404 | 422 | 500 |
| Success | Bad Request | Unauthorized | Not Found | Validation Error | Server Error |

**Pertinence Daily Chief of Staff** : **OUI**. Ces trois endpoints forment la base de notre wrapper REST microservice. On va les miroir en `POST /v1/crews/{crew_name}/kickoff`, `GET /v1/crews/{crew_name}/status/{kickoff_id}`, `GET /v1/crews/{crew_name}/inputs`.

---

### 2. API Reference — GET /inputs

**Source** : https://docs.crewai.com/en/api-reference/inputs

**Signature** :
```python
GET /inputs
Headers: Authorization: Bearer {token}
```

**Response (200)** :
```json
{
  "inputs": [
    "parameter_name_1",
    "parameter_name_2"
  ]
}
```

**Exemples réels** :
- Travel Planning Crew : `["budget", "interests", "duration", "age"]`
- Outreach Crew : `["name", "title", "company", "industry", "our_product", "linkedin_url"]`

**Erreurs** :
- 401 Unauthorized : token invalide/manquant
- 404 Not Found : ressource inexistante
- 500 Server Error

Permet au client (Next.js frontend) de découvrir dynamiquement quels inputs une crew nécessite avant lancement.

**Pertinence Daily Chief of Staff** : **OUI**. Endpoint découverte pour initialiser formulaires frontend ou préfiller inputs depuis config. Pour nos 8 crews (Chief of Staff, PM Summary, Research, etc.), exposer GET /v1/crews/{name}/inputs.

---

### 3. API Reference — POST /kickoff

**Source** : https://docs.crewai.com/en/api-reference/kickoff

**Signature** :
```python
POST /kickoff
Headers: Authorization: Bearer {token}
Content-Type: application/json

{
  "inputs": {                              # Requis
    "key1": "value1",
    "key2": "value2"
  },
  "meta": { ... },                         # Optionnel
  "taskWebhookUrl": "https://...",         # Optionnel
  "stepWebhookUrl": "https://...",         # Optionnel
  "crewWebhookUrl": "https://..."          # Optionnel
}
```

**Response (200)** :
```json
{
  "kickoff_id": "abcd1234-5678-90ef-ghij-klmnopqrstuv"
}
```

**Exemple complet** :
```json
{
  "inputs": {
    "budget": "1000 USD",
    "interests": "games, tech, ai, relaxing hikes",
    "duration": "7 days",
    "age": "35"
  },
  "meta": {
    "requestId": "travel-req-123",
    "source": "web-app"
  }
}
```

**Parameters** :
- `inputs` (dict, required) : key-value string pairs, tous inputs crew
- `meta` (dict, optional) : métadonnées forwarded à crew
- `taskWebhookUrl` (URI, optional) : POST callback après chaque task
- `stepWebhookUrl` (URI, optional) : POST callback après thought/action agent
- `crewWebhookUrl` (URI, optional) : POST callback crew completion

**HTTP Codes** :
- 200 : kickoff_id retourné
- 400 : invalid request / missing inputs
- 401 : authentication failure
- 422 : validation error
- 500 : internal server error

**Pertinence Daily Chief of Staff** : **OUI CRITIQUE**. C'est le point d'entrée principal. On va wrapper en POST /v1/crews/{name}/kickoff (proxying bearer token, webhooks internes). Utiliser pour déclenchements matin 08:00, soir 18:30, et runs ponctuels intraday.

---

### 4. API Reference — POST /resume

**Source** : https://docs.crewai.com/en/api-reference/resume

Resume exécution paused pour workflows Human-in-the-Loop quand tâche avec `human_input=True` se termine.

**Signature** :
```python
POST /resume
Headers: Authorization: Bearer {token}
Content-Type: application/json

{
  "execution_id": "abcd1234-...",          # Requis (UUID from kickoff)
  "task_id": "task-xyz",                   # Requis
  "human_feedback": "Feedback text",       # Requis
  "is_approve": true,                      # Requis (bool)
  "taskWebhookUrl": "https://...",         # Optionnel
  "stepWebhookUrl": "https://...",         # Optionnel
  "crewWebhookUrl": "https://..."          # Optionnel
}
```

**Parameters** :
- `execution_id` (UUID) : kickoff_id from original POST /kickoff
- `task_id` (string) : ID tâche requirant feedback
- `human_feedback` (string) : feedback à incorporer
- `is_approve` (bool) : `true` continue exécution ; `false` retry task

**Response (200)** :
```json
{
  "status": "resumed|retrying|completed",
  "message": "Human-readable confirmation"
}
```

**Erreurs** :
- 400 : invalid request or execution not pending
- 401 : authentication failed
- 404 : execution or task ID not found
- 500 : server error

**Patterns** :
1. Approve & continue : `is_approve: true` + positive feedback
2. Request revision : `is_approve: false` requesting changes

**Important** : "You must provide the same webhook URLs that were used in the original kickoff call"

**Pertinence Daily Chief of Staff** : **OUI** — Central pour validation humaine des brouillons avant envoi (Niveau 4 sécurité). Wrapper en POST /v1/crews/{name}/resume.

---

### 5. API Reference — GET /status/{kickoff_id}

**Source** : https://docs.crewai.com/en/api-reference/status

**Signature** :
```python
GET /status/{kickoff_id}
Headers: Authorization: Bearer {token}

Path Parameter: kickoff_id (UUID string, required)
```

**Response schemas** varient par state :

**Running (200)** :
```json
{
  "status": "running",
  "current_task": "research_task",
  "progress": {
    "completed_tasks": 1,
    "total_tasks": 3
  }
}
```

**Completed (200)** :
```json
{
  "status": "completed",
  "result": {
    "output": "Final output string",
    "tasks": [
      {
        "task_id": "string",
        "output": "Task output",
        "agent": "Agent name",
        "execution_time": 45.2
      }
    ]
  },
  "execution_time": 108.5
}
```

**Error (200)** :
```json
{
  "status": "error",
  "error": "Error description",
  "execution_time": 23.1
}
```

**HTTP Codes** :
- 200 : success (3 response formats possible)
- 401 : auth failed
- 404 : kickoff_id not found
- 500 : server error

Polling pattern : appel répété GET /status/{kickoff_id} jusqu'à status !== "running".

**Pertinence Daily Chief of Staff** : **OUI CRITIQUE**. Endpoint polling pour Next.js frontend. Wrapper en GET /v1/crews/{name}/status/{kickoff_id}, retourner status + progress + results quand completed.

---

## Flows

### 6. Flows — First Flow

**Source** : https://docs.crewai.com/en/guides/flows/first-flow

Flows combinent contrôle procédural + orchestration AI, intégrant crews, LLM calls directs, et code régulier. Architecture basée décorateurs.

**Pydantic Models (State)** :
```python
class GuideOutline(BaseModel):
    title: str
    introduction: str
    target_audience: str
    sections: List[Section]
    conclusion: str

class Section(BaseModel):
    title: str
    description: str

class GuideCreatorState(BaseModel):
    topic: str
    audience_level: str
    guide_outline: GuideOutline
    sections_content: Dict[str, str]
```

**Flow Class & Decorators** :
```python
class GuideCreatorFlow(Flow[GuideCreatorState]):
    @start()
    def get_user_input(self):
        """Entry point"""
        return GuideCreatorState(topic="...", audience_level="...")
    
    @listen(get_user_input)
    def create_guide_outline(self, state):
        """Executes when get_user_input completes"""
        ...
```

**LLM Direct Call** :
```python
from crewai.llm import LLM

llm = LLM(
    model="openai/gpt-4o-mini",
    response_format=GuideOutline
)
response = llm.call(messages=[
    {"role": "user", "content": "..."}
])
```

**Crew Integration** :
```python
result = ContentCrew().crew().kickoff(inputs={
    "section_title": "...",
    "section_description": "...",
    "audience_level": "..."
})
output_text = result.raw  # Extract output
```

**CLI Commands** :
```bash
crewai create flow <name>           # Initialize
crewai flow add-crew <name>         # Add specialized crew
crewai flow kickoff                 # Execute
crewai flow plot                    # Visualize DAG
```

**Pertinence Daily Chief of Staff** : **OUI PROBABLE**. Flows idéales pour orchestrer le Chief of Staff : découvrir input utilisateur → créer outline daily schedule → deleguer à crews spécialisées (PM, Research, etc.) → agréger outputs → retourner summary. State = GuideCreatorState analogue à ChiefOfStaffState(daily_priorities, context, delegations, summaries).

---

### 7. Flows — Mastering Flow State

**Source** : https://docs.crewai.com/en/guides/flows/mastering-flow-state

State lifecycle : Initialization → Modification → Transmission → Persistence → Completion.

**Deux approches** :
1. **Unstructured State** : flexible dict-like via `self.state`
2. **Structured State** : type-safe Pydantic models via `Flow[StateModel]`

**Decorators** :
```python
@start()                  # Marks flow entry point
@listen(method_name)      # Executes after referenced method
@persist()                # Enables state persistence
@router(method_name)      # Routes to conditional branches
```

**Flow Base Class** :
```python
class MyFlow(Flow[Optional[StateModel]]):
    @start()
    def method_name(self):
        return self.state  # or new StateModel(...)
    
    @listen(method_name)
    def next_method(self, previous_result):
        # previous_result = output of method_name
        self.state["key"] = value  # unstructured
        # OR
        self.state.field = value   # structured (Pydantic)
```

**State Access** :
| Unstructured | `self.state["key"]` |
| Structured | `self.state.field_name` |
| Auto ID | `self.state["id"]` or `self.state.id` |

**Persistence Methods** :
```python
# Class-level: saves after every method
@persist()
class MyFlow(Flow[StateModel]): ...

# Method-level: save specific methods only
@persist()
@listen(previous_step)
def persistent_step(self, state):
    ...

# Resume from saved state
flow = MyFlow()
flow.kickoff(inputs={"id": previous_state_id})

# Fork (new execution, hydrate old state)
flow = MyFlow()
flow.kickoff(restore_from_state_id=source_id)  # v1.14.5+
```

**State ID Auto-Generation** : CrewAI génère `state.id` automatiquement si absent. On peut aussi fournir custom ID via inputs.

**Pertinence Daily Chief of Staff** : **OUI CRITIQUE**. Flow persistence = sauvegarder ChiefOfStaffState après chaque étape (discovery → outline → delegation → execution → aggregation). Permet resume à tout point, fork pour variants (AM vs PM runs), et audit trail. Utiliser `@persist()` + `restore_from_state_id` pour reprendre runs interruptibles.

---

### 8. Flows — Inputs ID Deprecation

**Source** : https://docs.crewai.com/en/guides/flows/inputs-id-deprecation

CrewAI déprécie `inputs.id` (v < 1.14.5) au profit de `restore_from_state_id` (v 1.14.5+) pour hydrater `@persist` flows.

**Deprecated (inputs.id)** :
```python
flow = CounterFlow()
flow.kickoff(inputs={"id": "abcd1234-..."})  # Resumes, extends same flow_uuid
```

**Supported (restore_from_state_id)** :
```python
flow = CounterFlow()
flow.kickoff(restore_from_state_id="abcd1234-...")  # Forks, new state.id, preserves source history
```

**REST API Migration** :

Deprecated :
```bash
curl -X POST https://crew.crewai.com/kickoff \
  -H "Authorization: Bearer TOKEN" \
  -d '{"inputs": {"id": "abcd1234-...", "topic": "..."}}'
```

Supported :
```bash
curl -X POST https://crew.crewai.com/kickoff \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "inputs": {"topic": "..."},
    "restoreFromStateId": "abcd1234-..."
  }'
```

**Pourquoi le changement** : `inputs.id` servait dual purpose (hydration + execution identity), source d'ambiguïté. `restore_from_state_id` sépare concerns : fork state → fresh execution.id.

**Pertinence Daily Chief of Staff** : **OUI**. Notre microservice doit utiliser `restore_from_state_id` (not `inputs.id`). Permet relancer un Chief of Staff run partiellement complété (e.g., Inbox Collector failed, retry depuis Classifier).

---

## Process Tutorials (Learn)

### 9. Learn — Sequential Process

**Source** : https://docs.crewai.com/en/learn/sequential-process

Sequential = tâches exécutées linéairement, une après l'autre.

**Signatures** :
```python
from crewai import Crew, Process, Agent, Task

# Crew definition
crew = Crew(
    agents=[agent1, agent2, agent3],
    tasks=[task1, task2, task3],
    process=Process.sequential
)

# Agent definition
agent = Agent(
    role='Analyst',
    goal='Deliver detailed analysis',
    backstory='You are an expert analyst...'
)

# Task definition
task = Task(
    description='Analyze market trends',
    agent=agent,
    expected_output='Market report',
    async_execution=False,
    callback=my_callback_func
)

# Execution
result = crew.kickoff(inputs={"topic": "AI trends"})
output = result.output
task_outputs = result.tasks[0].output  # TaskOutput
```

**Task Parameters** :
- `description` (str) : task instructions
- `agent` (Agent) : assigned agent (required)
- `expected_output` (str) : desired result format
- `async_execution` (bool, default False) : if True, task runs parallel to others
- `task_callback` (callable, optional) : function(TaskOutput)
- `step_callback` (callable, optional) : function(StepOutput)

**Crew Parameters** :
- `agents` (list) : all agents
- `tasks` (list) : all tasks
- `process` (Process enum) : Process.sequential
- `memory` (bool, default True) : enable memory
- `cache` (bool, default True) : enable cache
- `allow_delegation` (Agent level, default False)

**Critical** : "Each task in a sequential process **must** have an agent assigned."

**Workflow** :
1. Task 1 (agent1) completes
2. Task 2 (agent2) receives context from task1 output
3. Task 3 (agent3) receives context from task1+task2
4. Crew completes, returns CrewOutput

**Pertinence Daily Chief of Staff** : **OUI**. Chief of Staff likely uses Process.sequential : Inbox Collector → Classifier → Priority → Action Extractor → Daily Planner → Draft Writer → Reporting. Chaque tâche enchaînée, chacun utilisant context précédent. Tasks doivent avoir agent assigné.

---

### 10. Learn — Hierarchical Process

**Source** : https://docs.crewai.com/en/learn/hierarchical-process

Hierarchical = manager agent coordonne, délègue tasks, valide résultats. Émule structures corporate.

**Basic Setup** :
```python
from crewai import Crew, Process, Agent

researcher = Agent(
    role='Researcher',
    goal='Conduct in-depth analysis',
    backstory='Experienced data analyst...'
)

writer = Agent(
    role='Writer',
    goal='Create compelling content',
    backstory='Expert writer...'
)

crew = Crew(
    agents=[researcher, writer],
    tasks=[task1, task2, ...],
    process=Process.hierarchical,
    manager_llm="gpt-4o",
    planning=True
)
```

**Custom Manager Agent** :
```python
manager = Agent(
    role="Chief of Staff",
    goal="Efficiently manage crew and ensure high-quality completion",
    backstory="Experienced executive assistant...",
    allow_delegation=True
)

crew = Crew(
    agents=[...],
    tasks=[...],
    manager_agent=manager,
    process=Process.hierarchical,
    planning=True
)
```

**Key Features** :
- **Task Delegation** : Manager alloue tasks aux agents basé rôles/capabilities
- **Result Validation** : Manager évalue outcomes QA
- **System Prompt Control** : Optional custom manager system prompt
- **Stop Words** : Support models including o1 variants
- **Context Window** : Défaut prioritize important context
- **Delegation Control** : Disabled par défaut
- **Rate Limiting** : Configurable max requests/minute
- **Iteration Limits** : Constrain max iterations

**Workflow** :
1. Manager reçoit tasks + agents + goal
2. Manager assigne tasks basé capabilities
3. Agents exécutent (async options + callbacks)
4. Manager valide results, iterate si besoin
5. Crew retourne output final

**Pertinence Daily Chief of Staff** : **OUI CENTRAL**. Le **Chief of Staff Agent** est l'archétype même du manager agent — il délègue aux 7 autres agents spécialisés (Inbox Collector, Classifier, Priority, Action Extractor, Daily Planner, Draft Writer, Automation, Memory). Process.hierarchical + manager_agent=ChiefOfStaff = architecture cible.

---

### 11. Learn — Conditional Tasks

**Source** : https://docs.crewai.com/en/learn/conditional-tasks

Conditional Tasks permettent branchement dynamique basé outcomes tâches précédentes.

**Condition Function** :
```python
def is_data_missing(output: TaskOutput) -> bool:
    """Evaluate if data is insufficient"""
    return len(output.pydantic.events) < 10

# Parameters:
#   output: TaskOutput from previous task
# Return: bool (True = execute task; False = skip)
```

**ConditionalTask Class** :
```python
from crewai.tasks.conditional_task import ConditionalTask
from crewai.tasks.task_output import TaskOutput
from crewai import Task, Agent

conditional_task = ConditionalTask(
    description="Fetch additional data if missing",
    expected_output="Complete dataset",
    condition=is_data_missing,
    agent=data_agent
)
```

**Parameters** :
- `description` (str) : task instructions
- `expected_output` (str) : desired result specification
- `condition` (callable) : function(TaskOutput) → bool
- `agent` (Agent) : assigned agent

**Usage** :
Intégrer ConditionalTask entre standard Tasks dans crew workflow. Logique branching sans explicit if/else.

**Pertinence Daily Chief of Staff** : **OUI**. Utile pour : "Draft Writer only needed si message classified 'à répondre'" ou "Automation Agent only fires si toutes les actions sont whitelistées N5". Pour MVP V1, toutes crews exécutées; mais MVP V2+ peut utiliser conditional.

---

### 12. Learn — Kickoff Async

**Source** : https://docs.crewai.com/en/learn/kickoff-async

Deux méthodes async : native async (`akickoff()`) + thread-based (`kickoff_async()`).

**Native Async (akickoff)** :
```python
async def execute_crew():
    result = await crew.akickoff(inputs={"topic": "AI trends"})
    return result

# Signature
# async def akickoff(self, inputs: dict) -> CrewOutput

# Features:
# - True async/await throughout
# - Recommended for high-concurrency
# - Streaming support if stream=True
```

**Thread-Based Async (kickoff_async)** :
```python
async def execute_crew():
    result = await crew.kickoff_async(inputs={"topic": "AI trends"})
    return result

# Signature
# async def kickoff_async(self, inputs: dict) -> CrewOutput

# Features:
# - Wraps sync execution in asyncio.to_thread
# - Simpler integration
# - Better for low-concurrency
```

**Concurrent Execution** :
```python
import asyncio

results = await asyncio.gather(
    crew1.akickoff(inputs=inputs1),
    crew2.akickoff(inputs=inputs2),
    crew3.akickoff(inputs=inputs3)
)
```

**Streaming** :
```python
async for chunk in crew.akickoff(inputs=inputs, stream=True):
    print(chunk)
```

**Use Cases** : Parallel content generation, concurrent market research, high-concurrency API workloads.

**Pertinence Daily Chief of Staff** : **OUI PROBABLE**. Si microservice Python reçoit N simultaneous requests (matin/soir/intraday), `akickoff()` idéale pour scalability. Utiliser `akickoff()` dans FastAPI endpoints.

---

### 13. Learn — Kickoff for Each

**Source** : https://docs.crewai.com/en/learn/kickoff-for-each

`kickoff_for_each()` exécute crew pour chaque item dans liste, batch processing natif.

**Signature** :
```python
def kickoff_for_each(inputs: list) -> list:
    """
    Execute crew for each item in list
    inputs: List[dict] - each dict contains inputs for one iteration
    Returns: List[CrewOutput]
    """
    return crew.kickoff_for_each(inputs=inputs)

# Example
datasets = [
    {"age": 25},
    {"age": 35},
    {"age": 45}
]

results = crew.kickoff_for_each(inputs=datasets)
```

**Parameters** :
- `inputs` (list) : list of dicts, each dict = one crew execution

**Use Case** : "Perform the same set of tasks for multiple items" — batch processing same workflow.

**Pertinence Daily Chief of Staff** : **OUI**. Cas idéal : "Classifier Agent runs once per email" via `classifier_crew.kickoff_for_each(inputs=[{email: e1}, {email: e2}, ...])`. Pour traiter en batch tous les nouveaux emails d'un trigger.

---

### 14. Learn — Replay Tasks from Latest Crew Kickoff

**Source** : https://docs.crewai.com/en/learn/replay-tasks-from-latest-crew-kickoff

Replay tasks from latest kickoff sans re-fetching data (agents conservent context de kickoff initial).

**Key Constraint** : "You must run `crew.kickoff()` before you can replay a task." Uniquement latest kickoff supporté ; `kickoff_for_each` replays from most recent run only.

**CLI Method** :
```bash
# List task IDs from latest kickoff
crewai log-tasks-outputs

# Replay specific task
crewai replay -t <task_id>
```

**Programmatic Method** :
```python
def replay_task():
    task_id = 'research_task'
    inputs = {"topic": "CrewAI Training"}  # Optional
    
    try:
        YourCrewName_Crew().crew().replay(
            task_id=task_id,
            inputs=inputs  # Defaults to previous kickoff inputs if omitted
        )
    except subprocess.CalledProcessError as e:
        print(f"Replay failed: {e}")
```

**Parameters** :
- `task_id` (str) : ID of task to replay
- `inputs` (dict, optional) : new inputs

**Use Cases** : Retry failed task, test revised prompt, iterate on results without full re-execution.

**Pertinence Daily Chief of Staff** : **OUI pour V2+**. Utile pour debugging : "Daily Planner failed, replay sans re-Collecter inbox". Exposer endpoint POST /v1/runs/{run_id}/tasks/{task_id}/replay.

---

## Synthèse Flows/API pour Daily Chief of Staff

### Architecture décision : Flow + Hierarchical Crew (recommandée)

```python
class ChiefOfStaffFlow(Flow[ChiefOfStaffState]):
    @start()
    def discover_inputs(self):
        """Fetch Gmail/Slack/Telegram/Calendar"""
        self.state = ChiefOfStaffState(
            date=today,
            inbox_items=[],
            calendar_events=[],
            urgent_keywords=[...],
            vip_contacts=[...]
        )
    
    @listen(discover_inputs)
    def collect_and_classify(self, state):
        # Inbox Collector + Classifier + Priority crew
        result = ClassifierCrew().crew().kickoff(inputs={
            "raw_items": state.inbox_items
        })
        self.state.classified_items = result.pydantic
    
    @listen(collect_and_classify)
    def extract_actions_and_plan(self, state):
        # Action Extractor + Daily Planner (parallel)
        actions, plan = await asyncio.gather(
            ActionExtractorCrew().crew().akickoff(...),
            DailyPlannerCrew().crew().akickoff(...)
        )
        self.state.actions = actions
        self.state.plan = plan
    
    @persist()
    @listen(extract_actions_and_plan)
    def draft_responses(self, state):
        # Draft Writer crew — produit brouillons (no auto-send)
        drafts = DraftWriterCrew().crew().kickoff(...)
        self.state.drafts = drafts
        # Send via Telegram for human approval
        return self.state.daily_summary
```

### REST API Endpoints à exposer

```
POST   /v1/crews/chief-of-staff/kickoff
       Body: { inputs: {trigger: "morning"|"evening"|"intraday"} }
       Response: { kickoff_id, state_id }

GET    /v1/crews/chief-of-staff/status/{kickoff_id}
       Response: { status, progress, result, execution_time }

POST   /v1/crews/chief-of-staff/resume
       Body: { execution_id, task_id, human_feedback, is_approve }

GET    /v1/runs/{run_id}/state/{state_id}
       Response: { state: {...} }

POST   /v1/runs/{run_id}/schedule
       Body: { crew_name, cron: "0 8,18 * * *" }
       (APScheduler for AM 08:00 + PM 18:30)

GET    /v1/runs
       Response: [{ run_id, status, created_at }]
```

### Scheduling Strategy (08:00 + 18:30)

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler.add_job(
    lambda: ChiefOfStaffFlow().kickoff(inputs={"trigger": "morning"}),
    "cron", hour=8, minute=0,
    id="chief-of-staff-morning"
)
scheduler.add_job(
    lambda: ChiefOfStaffFlow().kickoff(inputs={"trigger": "evening"}),
    "cron", hour=18, minute=30,
    id="chief-of-staff-evening"
)
```

### MVP V1 Minimum

1. Endpoints : POST /kickoff, GET /status/{id}, GET /inputs
2. Process : ChiefOfStaffFlow + Sequential sub-crews
3. Scheduling : APScheduler AM/PM
4. State : basic persistence (Supabase row crew_run_states)
5. Pas de : Resume HitL (V2), conditional tasks, async optimisation

### MVP V2+ Enhancements

- `@persist()` snapshots
- `restore_from_state_id` resume
- `ConditionalTask` branching (skip Draft Writer si pas d'emails à répondre)
- `akickoff()` parallel sub-crews
- `kickoff_for_each()` batch classification per email
- `/resume` endpoint + HitL validation Telegram
- Replay debugging
