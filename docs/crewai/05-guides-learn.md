# 05 — Guides avancés et Learn tutoriels

La documentation CrewAI propose une progression pédagogique massive du niveau intermédiaire au niveau expert. Ce lot couvre les patterns de production essentiels (customisation de prompts, fingerprinting, design d'agents), les outils propriétaires et custom, la migration depuis LangGraph, et 18+ tutoriels appliqués couvrant la codification, l'intégration LLM, la validation humaine, et les hooks d'exécution. Pour **Daily Chief of Staff**, ces ressources sont critiques : elles fondent l'architecture d'orchestration multi-agent (Chief as manager), la chaîne de validation humaine (HitL), et les custom tools (Gmail, Slack, Telegram, Notion, Calendar).

---

## Guides avancés

### Customizing Prompts — Optimisation bas-niveau de comportement

**Lien** : https://docs.crewai.com/en/guides/advanced/customizing-prompts.md

Le guide expose la customisation fine des prompts système et utilisateur à travers une architecture modulaire. CrewAI injecte automatiquement des instructions structurées (`Thought/Action/Action Input`) pour les agents tools-enabled, et propose des surcharges granulaires : `system_template`, `prompt_template`, ou fichiers JSON externes. Points critiques : (1) la désactivation complète de system prompt (`use_system_prompt=False`) pour modèles o1, (2) l'isolation des slices spécifiques plutôt que refonte complète, (3) l'observabilité via la classe `Prompts()` révélant le texte exact envoyé à l'LLM.

**Signatures clés** :
```python
Agent(
    role="...",
    system_template="custom_system.txt",
    prompt_template="custom_user.txt",
    use_system_prompt=True
)
Crew(prompt_file="custom_prompts.json")
```

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Le Chief manager doit bénéficier de prompts spécialisés orchestrant la délégation entre 8 agents ; la validation humaine impose des structures de feedback claires ; les tools customs (Gmail, Slack) nécessitent des instructions spécifiques de non-hallucination des tokens API.

---

### Fingerprinting — Traçabilité et identité composants

**Lien** : https://docs.crewai.com/en/guides/advanced/fingerprinting.md

Chaque Agent, Crew, et Task reçoit automatiquement un fingerprint immutable contenant UUID, timestamp de création, et métadonnées optionnelles. Cas d'usage : auditing, vérification identité, attachement métadonnées (version, client, session). Le fingerprint persiste inchangé lors des modifications composant.

**Signatures clés** :
```python
agent.fingerprint.uuid_str         # UUID unique auto-généré
agent.fingerprint.created_at       # datetime objet
agent.fingerprint.metadata         # dict mutable personnalisé
Fingerprint.generate(seed="id", metadata={...})
```

**Pertinence Daily Chief of Staff** : OUI (audit/compliance). Pour un Chief of Staff, le fingerprinting assure la traçabilité d'exécution multi-jour (rétention de contexte, identification des agents-versions en production).

---

## Guides agents, crews, et concepts

### Crafting Effective Agents — Principes de design spécialisé

**Lien** : https://docs.crewai.com/en/guides/agents/crafting-effective-agents.md

Socle pédagogique : règle **80/20** (80 % effort design tâche, 20 % définition agent). Les trois piliers role/goal/backstory créent persona cohérent. Recommandations majeures : (1) rôles spécialisés étroits ("Senior UX Researcher specializing in interview analysis" vs. "Writer"), (2) goals outcome-oriented mesurables, (3) backstories établissant expertise et valeurs, (4) tâches atomiques single-purpose. Anti-patterns : instructions floues, tâches "dieu", désalignement description/output.

**Snippets clés** :
```yaml
role: "Senior UX Researcher specializing in user interview analysis"
goal: "Uncover actionable insights by analyzing interview data"
backstory: "15 years conducting research for tech companies..."
```

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Le Chief manager : role "Chief of Staff orchestrating daily executive workflow", goal "Deliver morning + evening briefings with actionable items", backstory "Veteran executive assistant with 20 years experience". Les 8 agents métiers (Inbox Collector, Classifier, Priority, Action Extractor, Daily Planner, Draft Writer, Automation, Memory) doivent être **ultra-spécialisés** et atomiques.

---

### Build Your First Crew — Orchestration multi-agent séquentielle

**Lien** : https://docs.crewai.com/en/guides/crews/first-crew.md

Tutoriel mains libres : créer une crew de 2-3 agents collaborant séquentiellement via le pattern `@CrewBase`, configuration YAML agents/tâches, exécution via `kickoff()`. Démonstration claire du workflow : agent1 → task1 → output1 (contexte) → agent2 → task2 → résultat final.

**Signatures clés** :
```python
@CrewBase
class ResearchCrew():
    @agent
    def researcher(self) -> Agent: ...
    @task
    def research_task(self) -> Task: ...
    @crew
    def crew(self) -> Crew:
        return Crew(agents=self.agents, tasks=self.tasks, 
                    process=Process.sequential)

result = ResearchCrew().crew().kickoff(inputs={'topic': 'Your Topic'})
```

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Le Chief of Staff nécessite une architecture multi-agent orchestrée ; ce guide fonde l'implémentation microservice V1.

---

### Evaluating Use Cases for CrewAI — Sélection Crew vs. Flow

**Lien** : https://docs.crewai.com/en/guides/concepts/evaluating-use-cases.md

Matrice décision 2D (complexité × précision). **Bas-bas** → Crew exploratoire simple. **Bas-haut** → Flow précis structuré. **Haut-bas** → Crew multi-agent complexe. **Haut-haut** → Flow orchestrant Crews (mission-critique). Daily Chief of Staff = scenario **haut-haut** : Flow orchestrating the Chief Crew + 7 métier-crews.

**Pertinence Daily Chief of Staff** : **OUI**. Détermine architecture cible = Flow + Hierarchical Crew (option recommandée par la matrice).

---

## Guides tools et coding

### Publish Custom Tools — Packaging et distribution PyPI

**Lien** : https://docs.crewai.com/en/guides/tools/publish-custom-tools.md

Pattern `BaseTool` subclassing ou `@tool` decorator. Éléments obligatoires : name, description, `args_schema` (Pydantic), `_run()`. Async optionnel : `_arun()`. Env vars déclarées via `EnvVar` objects. Packaging : `crewai-toolname/` sur PyPI, préfixe `crewai-` pour discoverabilité.

**Snippets clés** :
```python
class CustomTool(BaseTool):
    name: str = "ToolName"
    description: str = "What it does"
    args_schema: type[BaseModel] = InputSchema
    def _run(self, param: str) -> str:
        return result

# Décorateur
@tool("ToolName")
def tool_function(param: str) -> str:
    """Description..."""
    return result
```

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Pour V1 on utilise Composio (qui expose déjà Gmail/Slack/Telegram/Calendar/Notion). Mais si Composio n'a pas un truc précis, on écrit un custom tool selon ce pattern. Exemple typique : un tool `digest_formatter` qui prend les outputs de Priority Agent + Action Extractor + Daily Planner et formate le résumé Telegram.

---

### Coding Tools — AGENTS.md Configuration

**Lien** : https://docs.crewai.com/en/guides/coding-tools/agents-md.md

Fichier repo-local `AGENTS.md` (ou `CLAUDE.md`, `GEMINI.md` selon IDE) contenant conventions, commandes, notes architecture. Support : Claude Code, Cursor, Windsurf, Codex, Gemini CLI. Import dans `CLAUDE.md` : `@AGENTS.md` pour réutilisation.

**Pertinence Daily Chief of Staff** : OUI (mineures). Le projet a déjà CLAUDE.md ; on peut ajouter un AGENTS.md décrivant les 8 agents Chief of Staff.

---

### Build with AI — Framework AI-natif pour CrewAI

**Lien** : https://docs.crewai.com/en/guides/coding-tools/build-with-ai.md

Positionne CrewAI comme framework spécifiquement conçu pour agents coding. Quatre composantes : (1) Skills System (`npx skills add crewaiinc/skills`), (2) llms.txt documentation, (3) Deployment pipeline, (4) Enterprise features. Skills auto-triggering : getting-started, design-agent, design-task, ask-docs.

**Pertinence Daily Chief of Staff** : OUI. Installer la skill `crewaiinc/skills` dans le projet pour bénéficier d'auto-scaffolding.

---

## Guides migration

### Upgrading CrewAI — Gestion des versions

**Lien** : https://docs.crewai.com/en/guides/migration/upgrading-crewai.md

CLI et venv upgrade indépendamment. Commande : `uv add "crewai[tools]>=1.14.4" && crewai install`. Breaking changes majeurs : `verbose` boolean, `llm` accepte string OU object, `output_pydantic` prend classe non instance, `Process.hierarchical` requires `manager_llm` OU `manager_agent`. Python : `>=3.10, <3.14`. Embedder configs non-OpenAI changer dimensions.

**Pertinence Daily Chief of Staff** : OUI (maintenance). Assure compatibilité venv initial.

---

### Migrating from LangGraph — Comparaison et transition

**Lien** : https://docs.crewai.com/en/guides/migration/migrating-from-langgraph.md

LangGraph = construction graphe explicite (nodes, edges, state dicts). CrewAI Flows = décorateurs event-driven. Avantages Flows : (1) état persistence via LanceDB, (2) Pydantic state models type-safe, (3) orchestration multi-agent native, (4) mental model déclaratif intent-driven. Patterns : séquential pipeline, conditional routing, agent crew integration, parallel avec `and_()`.

**Snippets clés** :
```python
class MyFlow(Flow[StateModel]):
    @start()
    def entry_point(self): ...
    
    @listen(entry_point)
    def next_step(self, _): ...
    
    @router(entry_point)
    def route_logic(self): ...
    
    @listen(and_(method1, method2))
    def sync_point(self): ...
```

**Pertinence Daily Chief of Staff** : **OUI référence**. Si évolution vers architecture Flow hybride, ce guide détermine la transition.

---

## Learn — Tutoriels appliqués

### Overview — Index pédagogique

**Lien** : https://docs.crewai.com/en/learn/overview.md

Organise ressources en 4 catégories : Core Concepts (sequential, hierarchical, conditional, async), Agent Development, Workflow Control (HitL, replay, batch), Customization & Integration. Cheminement recommandé : sequential → customizing-agents → custom-tools → hierarchical → async.

**Pertinence Daily Chief of Staff** : OUI. Fonde la learning path.

---

### Coding Agents — Agents avec exécution code

**Lien** : https://docs.crewai.com/en/learn/coding-agents.md

Activation : `allow_code_execution=True` (défaut False). Models recommandés : Claude 3.5 Sonnet, GPT-4. Gestion erreurs : retry limit configurable (défaut 2). Dépendance : `crewai_tools` requise.

**Pertinence Daily Chief of Staff** : OUI. Chief manager et agents analytiques (Action Extractor, Daily Planner) bénéficient de code execution pour calculs, formatting.

---

### Create Custom Tools — Guide exhaustif custom tools

**Lien** : https://docs.crewai.com/en/learn/create-custom-tools.md

Synthèse complète : `BaseTool` subclassing, `@tool` decorator, `args_schema` Pydantic, `_run()`/`_arun()` sync/async, caching custom, delegation, dynamic calling. Input validation critique. Async leverage `aiohttp`; sync utilise `requests`.

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Custom tools utiles : `digest_formatter`, `priority_scorer` (algorithme custom), `vip_matcher`, `telegram_bot_replier`.

---

### Custom LLM — Intégration providers non-natifs

**Lien** : https://docs.crewai.com/en/learn/custom-llm.md

Subclass `BaseLLM`, implémenter `call()` (core), optionnel `supports_function_calling()`, `supports_stop_words()`, `get_context_window_size()`. Constructor passe `model`, `temperature` à parent. Function calling : check `tool_calls`, execute available functions, append results, appel récursif.

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Custom LLM bridge pour Hypercli/Kimi K2.6 fallback (CLAUDE.md règle). Anthropic Claude = primary, Hypercli/Kimi K2.6 = fallback via `BaseLLM` subclass.

---

### Custom Manager Agent — Agent spécialisé comme manager

**Lien** : https://docs.crewai.com/en/learn/custom-manager-agent.md

Attribuer `manager_agent` OU `manager_llm` (mutually exclusive). Manager agent = Agent normal avec `allow_delegation=True`. Utilisé uniquement pour `Process.hierarchical`.

**Snippets clés** :
```python
manager = Agent(
    role="Chief of Staff",
    goal="Orchestrate daily coordination of inbox triage, prioritization, drafting, scheduling",
    backstory="20 years experience as executive assistant for C-suite leaders...",
    allow_delegation=True
)

crew = Crew(
    agents=[inbox_collector, classifier, priority, action_extractor, 
            daily_planner, draft_writer, automation, memory_agent],
    tasks=[...],
    manager_agent=manager,
    process=Process.hierarchical
)
```

**Pertinence Daily Chief of Staff** : **OUI CRITIQUE**. Détermine **l'architecture cible** : Chief of Staff = manager_agent central, orchestrant les 7 autres agents spécialisés.

---

### Customize Agents — Paramétrisation agent

**Lien** : https://docs.crewai.com/en/learn/customizing-agents.md

Attributs : role, goal, backstory, tools, memory, verbose. Performance controls : `max_rpm` (None = illimité), `max_iter` (défaut 25), `max_execution_time`, `max_retry_limit`. Advanced : llm override, function_calling_llm, use_system_prompt, allow_delegation (défaut False), sliding context window.

**Pertinence Daily Chief of Staff** : **OUI**. Chaque agent customisé : Chief manager avec `allow_delegation=True`, agents métiers avec tools spécifiques, `max_rpm=20` pour rate limit Composio/Claude.

---

### DALL-E Image Generation — Intégration générateur images

**Lien** : https://docs.crewai.com/en/learn/dalle-image-generation.md

**Pertinence Daily Chief of Staff** : **NON prioritaire V1**.

---

### Execution Hooks — Interception runtime agent

**Lien** : https://docs.crewai.com/en/learn/execution-hooks.md

Deux catégories hook : LLM Call Hooks (avant/après LLM call), Tool Call Hooks (avant/après tool exécution). Décorateurs : `@before_llm_call`, `@after_llm_call`, `@before_tool_call`, `@after_tool_call`. Context objects : `LLMCallHookContext`, `ToolCallHookContext`. Retour False bloque execution.

**Snippets clés** :
```python
@before_llm_call
def limit_iterations(context: LLMCallHookContext) -> bool | None:
    if context.iterations > 10:
        return False
    return None

@after_llm_call
def sanitize_response(context: LLMCallHookContext) -> str | None:
    if "API_KEY" in context.response:
        return context.response.replace("API_KEY", "[REDACTED]")
    return None
```

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Hooks essentiels pour : (1) sécurité (bloquer hallucinations tokens API), (2) validation (custom rules), (3) observabilité (logging décisions Chief), (4) HitL gating.

---

### Force Tool Output as Result — Préserver output tool brut

**Lien** : https://docs.crewai.com/en/learn/force-tool-output-as-result.md

Paramètre tool : `result_as_answer=True` force retour output tool brut sans post-processing agent. Use case : garantir preservation données non-altérées.

**Pertinence Daily Chief of Staff** : OUI. Pour Composio Gmail/Slack/Calendar tools retournant structured data, `result_as_answer=True` prévient l'agent de "halluciner" ou reformuler données critiques (recipients, dates).

---

### Human Feedback in Flows — HITL dans Flows

**Lien** : https://docs.crewai.com/en/learn/human-feedback-in-flows.md

Décorateur `@human_feedback` (CrewAI 1.8.0+) pause execution Flows. Routing intelligent : LLM collapse free-form feedback vers outcomes spécifiés. Async provider support (webhooks, systèmes externes). Learning capability : extract lessons from feedback.

**Snippets clés** :
```python
@human_feedback(
    message="Approve for sending?",
    emit=["approved", "rejected", "needs_revision"],
    llm="gpt-4o-mini",
    default_outcome="needs_revision",
    learn=True
)
@listen(or_("generate_draft", "needs_revision"))
def review_draft(self):
    return self.state.draft
```

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Architecture : Flow orchestrates Chief Crew, `human_feedback` checkpoints gating critical decisions (avant envoi email/Slack/Telegram). Async webhook patterns enable async review.

---

### Human-in-the-Loop (HITL) Workflows — Fondational HITL patterns

**Lien** : https://docs.crewai.com/en/learn/human-in-the-loop.md

Deux approches : (1) Flow-based `@human_feedback` decorator (local dev + sync), (2) Webhook-based systems (production async). Webhook workflow : task `human_input=True` → pause → notification webhook → human review via API → resume endpoint avec feedback. Webhook URLs must re-provide in resume calls.

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Le N4 (validation explicite Adrien avant envoi) du brief sécurité = HitL en production via webhook. Telegram bot peut être le frontend HitL — Adrien reçoit brouillon + bouton Approve, click déclenche resume.

---

### Human Input on Execution — Input utilisateur dans task

**Lien** : https://docs.crewai.com/en/learn/human-input-on-execution.md

Flag `human_input=True` dans Task pause execution agent avant finalisation answer, prompting utilisateur clarification.

**Pertinence Daily Chief of Staff** : OUI. Pour tâches Chief requérant inputs contextuels dynamiques (ex. "Confirmer priorité haute pour cet email").

---

### LiteLLM Removal Guide — Migration vers providers natifs

**Lien** : https://docs.crewai.com/en/learn/litellm-removal-guide.md

LiteLLM quarantined PyPI. CrewAI supporte 5 providers natifs : OpenAI, Anthropic, Google Gemini, Azure OpenAI, AWS Bedrock. Avantages : reduced dependency surface, direct API perf, simplified debugging. Providers LiteLLM-dependent (Groq, Together AI, Mistral, Cohere, HuggingFace) requièrent toujours LiteLLM. Model string prefixes : `openai/`, `anthropic/`, `gemini/` = native; `groq/`, `together_ai/`, `ollama/` = LiteLLM.

**Pertinence Daily Chief of Staff** : OUI. Primary LLM = Anthropic Claude (native direct), fallback Hypercli/Kimi K2.6 via custom `BaseLLM` bridge (non-LiteLLM, custom HTTP client). Architecture évite dépendance LiteLLM.

---

### LLM Connections — Intégration multi-providers

**Lien** : https://docs.crewai.com/en/learn/llm-connections.md

CrewAI intègre 50+ providers. Défaut : `gpt-4o-mini` (overridable `OPENAI_MODEL_NAME`). Native SDKs : OpenAI, Anthropic, Gemini, Azure, Bedrock. Configuration : string identifier (`llm="gpt-4"`) OU LLM object avec params (temperature, max_tokens, top_p, base_url, api_key).

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Détermine la stratégie multi-LLM : Claude (Anthropic native) primary, fallback Hypercli/Kimi K2.6 via custom bridge, embeddings OpenAI (CLAUDE.md).

---

### LLM Call Hooks — Interception appels LLM

**Lien** : https://docs.crewai.com/en/learn/llm-hooks.md

Before hook modifie messages, retour False bloque. After hook transforme response. Context : executor, messages, agent, task, crew, llm, iterations, response. Cas d'usage : prompt injection prevention, response sanitization, cost tracking, approval gates.

**Snippets clés** :
```python
@before_llm_call
def sanitize_sensitive_data(context: LLMCallHookContext) -> bool | None:
    import re
    for msg in context.messages:
        if isinstance(msg, dict) and "content" in msg:
            msg["content"] = re.sub(r'\b\d{3}-\d{2}-\d{4}\b', '[SSN]', msg["content"])
    return None
```

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Sanitize tokens sensibles (API keys, addresses), prevent prompt injection.

---

### LLM Selection Guide — Stratégie sélection modèles

**Lien** : https://docs.crewai.com/en/learn/llm-selection-guide.md

Framework 4-step : analyser requirements tâche, mapper capabilities modèles, considérer contraintes opérationnelles, tester empiriquement. Multi-model strategy : différents agents = différents modèles optimisés. Temperature : 0.1 (analytical), 0.7 (creative). Landscape : o3 (reasoning premier), Claude 4 Sonnet (coding), Llama 4 Scout (vitesse), Gemini 2.5 Flash (équilibré).

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Multi-model crew setup :
- Chief manager : Claude Opus / Sonnet 4.6 (orchestration reasoning)
- Inbox Collector / Classifier / Priority : Claude Haiku 4.5 (speed)
- Action Extractor / Daily Planner : Claude Sonnet 4.6 (structured output)
- Draft Writer : Claude Sonnet 4.6 (style natural)
- Automation : Claude Haiku 4.5 (cheap, fast)
- Memory : Claude Sonnet 4.6 (retrieval reasoning)

---

### Multimodal Agents — Agents processing images + text

**Lien** : https://docs.crewai.com/en/learn/multimodal-agents.md

Activation : `multimodal=True` agent parameter. Auto-included tool : `AddImageTool`.

**Pertinence Daily Chief of Staff** : **NON prioritaire V1**. Futur : processing email attachments images, Slack images.

---

### Tool Call Hooks — Interception appels tool

**Lien** : https://docs.crewai.com/en/learn/tool-hooks.md

Before hook valide inputs, retour False bloque. After hook transforme results. Context : tool_name, tool_input, tool, agent, task, crew, tool_result. Cas d'usage : input validation/sanitization, result sanitization, approval gates, rate limiting, caching.

**Snippets clés** :
```python
@before_tool_call
def validate_gmail_inputs(context: ToolCallHookContext) -> bool | None:
    if context.tool_name.startswith("GMAIL_SEND") and context.tool_input.get("body"):
        if "contract" in context.tool_input["body"].lower():
            return False  # Require HitL approval
    return None

@after_tool_call
def sanitize_sensitive_results(context: ToolCallHookContext) -> str | None:
    if context.tool_name.startswith("GMAIL_"):
        result = context.tool_result
        import re
        result = re.sub(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[EMAIL]', result)
        return result
    return None
```

**Pertinence Daily Chief of Staff** : **OUI prioritaire**. Tool hooks garantissent : (1) validation avant Composio Gmail/Slack/Telegram sending, (2) result sanitization PII, (3) HitL approval gates pour ops haut-risque (mass email, suppression Slack), (4) implémentation effective des 5 niveaux de sécurité du brief.

---

### Using Annotations — Décorateurs @CrewBase, @agent, @task, @llm

**Lien** : https://docs.crewai.com/en/learn/using-annotations.md

Dix annotations : `@CrewBase` (classe principale), `@agent` (agent method), `@task` (task method), `@tool` (tool method), `@llm` (LLM object), `@before_kickoff`, `@after_kickoff`, `@start`, `@listen` (Flow). @CrewBase bootstraps config YAML (agents_config, tasks_config), exécute decorators une fois, wires hooks, MCP support. YAML key names match python method names.

**Snippets clés** :
```python
@CrewBase
class DailyChiefOfStaffCrew():
    agents_config = 'config/agents.yaml'
    tasks_config = 'config/tasks.yaml'

    @agent
    def inbox_collector(self) -> Agent:
        return Agent(config=self.agents_config['inbox_collector'])

    @agent
    def classifier(self) -> Agent:
        return Agent(config=self.agents_config['classifier'])

    @task
    def collect_task(self) -> Task:
        return Task(
            config=self.tasks_config['collect'],
            agent=self.inbox_collector()
        )

    @crew
    def crew(self) -> Crew:
        return Crew(agents=self.agents, tasks=self.tasks)
```

**Pertinence Daily Chief of Staff** : OUI. Structure `@CrewBase` + YAML config = architecture microservice propre, agents + tasks décrits déclarativement.

---

## Synthèse Guides/Learn pour Daily Chief of Staff

### Top 10 pratiques à appliquer dès microservice V1

1. **Role-Goal-Backstory spécialisés** : Chief manager backstory = "20 years executive assistant for C-suite leaders, expert in orchestrating multi-channel inbox triage, prioritization, drafting, scheduling"; 7 agents métiers (Inbox Collector, Classifier, Priority, Action Extractor, Daily Planner, Draft Writer, Automation) ultra-étroits, atomiques (règle 80/20).

2. **Custom Manager Agent comme kernel central** : Chief of Staff = `manager_agent` avec `allow_delegation=True`, `process=Process.hierarchical`, orchestrates 7 métier-agents.

3. **Custom LLM bridge pour fallback Hypercli/Kimi K2.6** : Subclass `BaseLLM`, implémenter `call()` récursive, supports function_calling; primary Claude Anthropic (native), fallback Hypercli/Kimi via custom bridge (CLAUDE.md compliance).

4. **HitL gating critical ops** : `@human_feedback` (Flows) ou webhook-based pour human review avant envoi email/Slack/Telegram; Telegram bot = frontend HitL (Adrien reçoit brouillon + boutons Approve/Reject/Edit).

5. **Custom tools complémentaires Composio** : Pour besoins non couverts par Composio (digest_formatter, priority_scorer custom, vip_matcher), pattern `BaseTool` + Pydantic args_schema + `_run()`; `result_as_answer=True` pour préserver outputs Gmail/Calendar bruts.

6. **Execution hooks pour sécurité + observabilité** : Before/after LLM call hooks sanitize sensitive data; before/after tool call hooks valident inputs (gate envoi email selon whitelist N5), sanitize résultats; implémentation effective des 5 niveaux de sécurité.

7. **Multi-model crew strategy** : Chief manager = Claude Sonnet 4.6 (orchestration), Inbox Collector/Classifier/Priority = Claude Haiku 4.5 (speed cheap), Action Extractor/Daily Planner = Claude Sonnet 4.6 (structured), Draft Writer = Claude Sonnet 4.6 (style), Automation = Claude Haiku 4.5 (cheap+fast).

8. **Prompts customization** : System template spécialise Chief role ("You orchestrate daily coordination of Adrien's executive workflow..."), tool prompts précision (Composio Gmail: "Never hallucinate recipient addresses, always confirm before send").

9. **Fingerprinting audit trail** : Chaque crew execution = fingerprint UUID + metadata (date_run, trigger, version); persiste pour audit, replay, debugging multi-day.

10. **@CrewBase + YAML config** : Architecture déclarative avec `agents.yaml` + `tasks.yaml`; faciles à itérer sans recompiler Python, support MCP servers via `mcps` field, bootstrap automatique.
