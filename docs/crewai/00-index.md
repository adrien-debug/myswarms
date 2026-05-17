# CrewAI — Documentation interne myswarms

> Ingestion exhaustive des **256 pages** de https://docs.crewai.com/ (2026-05-17), regroupées en 8 fichiers thématiques avec annotation "Pertinence Daily Chief of Staff" page par page.
>
> **Projet** : `myswarms` = "Daily Chief of Staff AI" — voir [memory: daily_chief_of_staff_brief](../../../.claude/projects/-Users-adrienbeyondcrypto-Dev-myswarms/memory/daily_chief_of_staff_brief.md).

---

## 📚 Index des fichiers

| # | Fichier | Couverture | Lignes |
|---|---------|------------|--------|
| 01 | [01-foundations.md](01-foundations.md) | Getting Started + Core Concepts (Agents, Tasks, Crews, Flows, Tools, Processes, LLMs, Memory, Knowledge, Skills, Reasoning, Planning, Checkpointing, Collaboration, Training, Testing, Event Listeners, Files, Production Architecture, CLI) | ~1650 |
| 02 | [02-flows.md](02-flows.md) | Flows + API Reference + Process tutos (kickoff/resume/status, sequential/hierarchical/conditional/async/for_each/replay) | ~700 |
| 03 | [03-tools-data.md](03-tools-data.md) | Tools Part A : AI/ML + Cloud + Database + File + Search (~46 outils) | ~700 |
| 04 | [04-tools-web.md](04-tools-web.md) | Tools Part B : Web Scraping + Automation + Integration (~27 outils dont **Composio en profondeur**) | ~500 |
| 05 | [05-guides-learn.md](05-guides-learn.md) | Guides avancés + Learn tutoriels (crafting agents, custom tools, custom LLM, custom manager, HitL, hooks, multi-model strategy, annotations) | ~600 |
| 06 | [06-mcp-observability.md](06-mcp-observability.md) | MCP (7 pages) + Observability (Langfuse focus + 14 alternatives) + Telemetry/Skills | ~600 |
| 07 | [07-enterprise-integrations.md](07-enterprise-integrations.md) | Enterprise Features (Hallucination Guardrail, PII Redaction, Flow HITL, Webhook Streaming) + 30+ Integrations (Gmail/Slack/Outlook/Calendar/Notion/HubSpot/Salesforce/…) | ~500 |
| 08 | [08-enterprise-guides.md](08-enterprise-guides.md) | Enterprise Guides (Triggers Gmail/Slack/Calendar/Outlook/Teams/HubSpot/Salesforce/Drive/OneDrive/Zapier, Deployment, MCP custom, Vertex AI, Webhook Automation, FAQ, Cookbooks) | ~1200 |

**Total** : ~6500 lignes, ~50-70k mots de doc dense.

---

## 🧠 Glossaire 1-liner (concepts CrewAI)

| Concept | Définition |
|---------|------------|
| **Agent** | Acteur autonome avec role/goal/backstory + tools + LLM. Unité de raisonnement de base. |
| **Task** | Tâche unitaire avec description + expected_output + agent assigné. |
| **Crew** | Groupe d'agents collaborant via un `Process` (sequential/hierarchical) sur une liste de tasks. |
| **Flow** | Orchestration procédurale event-driven (@start/@listen/@router/@persist) qui peut embarquer Crews + LLM calls + code custom. |
| **Process** | Mode d'exécution d'une Crew : `Process.sequential` (linéaire), `Process.hierarchical` (manager délègue). |
| **Tool** | Capacité externe d'un agent (CRUD email, calendar, search). Subclass `BaseTool` ou via `@tool`. |
| **MCP** | Model Context Protocol — serveurs distants exposant des outils via stdio/SSE/HTTP. |
| **Memory** | Système de rétention contextuelle short-term/long-term (entity, contextual). |
| **Knowledge** | Sources de données indexées (PDF, web, DB) consultables par RAG. |
| **Hooks** | Décorateurs interceptant LLM calls (`@before_llm_call`) ou tool calls (`@before_tool_call`) pour validation/sanitization. |
| **HitL** | Human-in-the-Loop : validation humaine via `@human_feedback` Flow ou webhook async. |
| **Manager Agent** | Agent avec `allow_delegation=True` utilisé comme orchestrateur dans `Process.hierarchical`. |
| **Fingerprint** | UUID immutable auto-généré pour chaque Agent/Crew/Task pour audit. |

---

## 🎯 Architecture cible Daily Chief of Staff AI

```
┌───────────────────────────────────────────────────────────┐
│ Next.js (myswarms) — Frontend + API routes (Vercel)       │
│   /crews  /api/crews  /api/runs  /api/webhooks/telegram   │
└───────────────────┬───────────────────────────────────────┘
                    │ HTTPS REST + SSE + Bearer auth
                    ▼
┌───────────────────────────────────────────────────────────┐
│ services/crewai-engine/ — FastAPI Python (Railway, Docker)│
│                                                            │
│   ChiefOfStaffFlow (Flow[ChiefOfStaffState])              │
│     @start  → discover_inbox()                            │
│     @listen → collect_and_classify()                      │
│     @listen → extract_actions_and_plan()                  │
│     @persist@listen → draft_responses()                   │
│                                                            │
│   Crews déléguées (Process.hierarchical) :                │
│     manager_agent: ChiefOfStaffAgent (Sonnet 4.6)         │
│     ├── Inbox Collector       (Haiku 4.5)                 │
│     ├── Classifier            (Haiku 4.5)                 │
│     ├── Priority              (Haiku 4.5)                 │
│     ├── Action Extractor      (Sonnet 4.6)                │
│     ├── Daily Planner         (Sonnet 4.6)                │
│     ├── Draft Writer          (Sonnet 4.6)                │
│     ├── Automation            (Haiku 4.5)                 │
│     └── Memory                (Sonnet 4.6)                │
│                                                            │
│   Tools : Composio (Gmail/Slack/Telegram/Calendar/Notion) │
│         + Tavily/Exa (search)                              │
│         + customs (digest_formatter, vip_matcher, …)       │
│                                                            │
│   Observability : Langfuse (auto-trace via openlit.init())│
│   Telemetry CrewAI : disabled                              │
└─────┬─────────────────────────────────────────────────────┘
      │
      ├── Supabase Postgres (crews, crew_runs, crew_run_steps, ChiefOfStaffState snapshots)
      ├── Upstash Redis (cache, scheduling locks)
      ├── Langfuse Cloud (LLM traces, costs, latency)
      ├── APScheduler in-process (cron 08:00 + 18:30)
      └── Composio (OAuth tokens chiffrés, action execution)
```

**Stack runtime** :
- Python 3.12 + uv + FastAPI + uvicorn[standard]
- crewai (latest, latest features 1.14+)
- composio + composio-crewai
- langfuse + openlit
- supabase-py
- pydantic 2.x

---

## 🔐 5 Niveaux de sécurité (rappel brief)

| Niveau | Permission | Implémentation CrewAI |
|--------|------------|-----------------------|
| **N1** | Lecture/résumé seulement | Pas de tool d'écriture chargé |
| **N2** | Brouillons préparés (non envoyés) | `GMAIL_CREATE_DRAFT` autorisé, `GMAIL_SEND_EMAIL` bloqué par tool hook |
| **N3** | Archivage / classement / labels | `GMAIL_ARCHIVE`, `GMAIL_ADD_LABEL` autorisés via whitelist hook |
| **N4** | Envoi avec validation explicite | `GMAIL_SEND_EMAIL` autorisé seulement après HitL approved (Telegram bot) |
| **N5** | Auto-send sur whitelist stricte | Custom tool hook compare contenu à whitelist regex ("Merci, bien reçu", "Confirmé") |

---

## 📅 Daily Flow (rappel brief)

- **08:00** — `ChiefOfStaffFlow.kickoff(trigger="morning")` → résumé Telegram (urgent + important + plan + brouillons prêts)
- **toutes les 30-60 min** (cron Railway) — check P0/P1 nouveaux messages, notif si urgent
- **18:30** — `ChiefOfStaffFlow.kickoff(trigger="evening")` → résumé soir (terminé + reste + prép demain)
- **intraday on-demand** — Adrien envoie message Telegram → webhook Next.js → POST /v1/crews/chief-of-staff/kickoff

---

## 🚀 Roadmap MVP

### V1 — Gmail + Slack + Telegram
- Inbox Collector / Classifier / Priority / Action Extractor / Daily Planner / Draft Writer / Memory + Chief manager
- Telegram bot pour résumés + brouillons (lecture, HitL)
- PAS d'envoi auto (N1-N2 seulement)
- PAS de WhatsApp

### V2 — + Google Calendar + Notion
- Daily Planner enrichi du calendrier
- Notion sync (notes + tâches + projets actifs)
- Automation Agent activé (N3 : archive newsletters, labels Gmail)
- Conditional tasks (skip Draft Writer si rien à répondre)
- @persist() state snapshots

### V3 — + WhatsApp Business + N4-N5
- WhatsApp Business Cloud API officielle (pas non-officielle)
- N4 : envoi avec validation explicite Telegram bot
- N5 : auto-send whitelist stricte ("Merci, bien reçu", "Confirmé")

---

## 📝 Pour démarrer (TL;DR)

1. **Lire en ordre** : 01 → 02 → 06 (MCP/Langfuse) → 05 (Guides/Learn) → 04 (Composio) → 07 (Enterprise features) → 03 (tools data) → 08 (triggers + cookbooks)
2. **Référentiels code** : signatures et snippets Python sont préservés verbatim depuis docs CrewAI
3. **Annotations "Pertinence Daily Chief of Staff"** : page par page, OUI/NON/À évaluer + raison
4. **Memory entries** : voir [`../../../.claude/projects/-Users-adrienbeyondcrypto-Dev-myswarms/memory/MEMORY.md`](../../../.claude/projects/-Users-adrienbeyondcrypto-Dev-myswarms/memory/MEMORY.md) pour le cheatsheet rapide

---

**Source** : https://docs.crewai.com/llms.txt (snapshot 2026-05-17)
**Ingestion** : 8 Explore agents parallèles via `/setup-adrien` orchestration
**Format** : Markdown dense, signatures Python verbatim, code snippets pertinents, sans fluff
