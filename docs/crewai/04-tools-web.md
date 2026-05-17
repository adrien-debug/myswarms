# 04 — Tools (Partie B) : Web Scraping, Automation, Integration

CrewAI expose un écosystème complet d'outils pour l'automatisation, le web scraping et l'intégration avec des services tiers. Cette partie B couvre les ~27 outils organisés en trois catégories : **Automation** (agents web, orchestration), **Web Scraping** (extraction de contenu, crawling), et **Integration** (services externes, agents gérés). Pour **myswarms** ("Daily Chief of Staff AI"), **Composio** est central — il expose 250+ actions pré-construites (Gmail, Slack, Notion, Calendar) couvrant 95% des besoins du projet. Les autres outils sont complémentaires : Browserbase/Stagehand pour automatisation web interactive, Firecrawl pour scraping temps réel.

---

## Automation Tools

### Composio Tool ⭐

**Source** : https://docs.crewai.com/en/tools/automation/composiotool.md

**À quoi sert** : Composio est une plateforme d'intégration unifiée qui expose **250+ outils pré-construits** (Gmail, Slack, Notion, Salesforce, GitHub, Calendly, HubSpot, Telegram, etc.) avec gestion d'authentification flexible (OAuth, API Keys, JWT) et observation détaillée des exécutions.

**Installation + Import**

```bash
pip install composio composio-crewai
pip install crewai
```

```python
from composio_crewai import ComposioProvider
from composio import Composio
from crewai import Agent, Task, Crew
```

**Env vars requises**

```bash
COMPOSIO_API_KEY=<your-composio-api-key>  # Obtenu sur https://platform.composio.dev
```

**Signatures clés**

```python
composio = Composio(provider=ComposioProvider())

# Créer une session (optionnel : filtrer par toolkits)
session = composio.create(
    user_id="your-user-id",
    toolkits=["gmail", "slack", "notion", "google_calendar"]
)

# Récupérer les tools (150+ actions selon toolkits choisis)
tools = session.tools()

# Authentification manuelle (OAuth)
connection_request = session.authorize("github")
# -> Rediriger l'utilisateur vers connection_request.redirect_url

# Lister les toolkits disponibles
toolkits = session.get_toolkits()
```

**Mini snippet Python (Daily Chief of Staff base)**

```python
from composio_crewai import ComposioProvider
from composio import Composio
from crewai import Agent, Task, Crew

composio = Composio(provider=ComposioProvider())
session = composio.create(
    user_id="adrien-chief-of-staff",
    toolkits=["gmail", "slack", "telegram", "google_calendar", "notion"]
)
tools = session.tools()

chief = Agent(
    role="Daily Chief of Staff",
    goal="Manage Adrien's calendar, emails, and tasks",
    tools=tools,
    verbose=True
)

task = Task(
    description="Summarize my unread emails, classify by priority, draft responses for P0/P1",
    agent=chief
)

crew = Crew(agents=[chief], tasks=[task])
result = crew.kickoff()
```

**Détail Composio en profondeur** :

1. **Modes d'authentification** :
   - OAuth2 (Gmail, Slack, Google Calendar, Notion, HubSpot) — flow standard
   - API Key (Telegram, services custom)
   - JWT (services entreprise)
   - Composio gère le token refresh automatique

2. **Lister les actions disponibles par toolkit** :
   ```python
   actions = composio.actions.list(toolkits=["gmail"])
   for action in actions:
       print(action.name, action.description)
   ```

3. **Exécuter une action directement (sans agent)** :
   ```python
   result = composio.actions.execute(
       action="GMAIL_SEND_EMAIL",
       params={"to": "x@y.com", "subject": "Test", "body": "Hello"},
       entity_id="adrien-chief-of-staff"
   )
   ```

4. **Gestion des tokens** : Composio stocke les tokens chiffrés côté Composio (pas dans myswarms). Adrien autorise une fois via flow OAuth → token stocké → composio.actions.execute() utilise le token. Le `entity_id` (équivalent user_id) est la clé.

5. **Multi-tenant** : Si on veut isoler par user dans myswarms (multi-utilisateurs futurs), chaque user = entity_id différent. Pour MVP V1 mono-user Adrien, un seul entity_id suffit.

6. **Actions critiques Daily Chief of Staff via Composio** :
   - **Gmail** : `GMAIL_FETCH_EMAILS`, `GMAIL_SEND_EMAIL`, `GMAIL_CREATE_DRAFT`, `GMAIL_ADD_LABEL`, `GMAIL_ARCHIVE_EMAIL`, `GMAIL_MARK_AS_READ`
   - **Slack** : `SLACK_SEND_MESSAGE`, `SLACK_LIST_CHANNELS`, `SLACK_FETCH_MESSAGES`, `SLACK_SEARCH_MESSAGES`, `SLACK_CREATE_DM`
   - **Telegram Bot** : `TELEGRAM_SEND_MESSAGE`, `TELEGRAM_GET_UPDATES` (pour bot Adrien)
   - **Google Calendar** : `GOOGLECALENDAR_LIST_EVENTS`, `GOOGLECALENDAR_CREATE_EVENT`, `GOOGLECALENDAR_FIND_FREE_SLOTS`, `GOOGLECALENDAR_UPDATE_EVENT`
   - **Notion** : `NOTION_QUERY_DATABASE`, `NOTION_CREATE_PAGE`, `NOTION_UPDATE_PAGE`

**Pertinence Daily Chief of Staff** : **OUI — CRITIQUE ABSOLU**.

Composio remplace Zapier pour MVP car : (1) 250+ actions OOB couvrant Gmail/Slack/Telegram/Calendar/Notion (le scope V1 complet), (2) OAuth + token refresh automatique, (3) retry logique intégrée, (4) entity_id permet multi-tenant si projet évolue, (5) actions sont des **objets Python avec types** consommables direct par CrewAI.

Composio = la **pierre angulaire** du microservice Python. Le Inbox Collector Agent + Automation Agent du brief utilisent quasi-exclusivement Composio tools.

---

### Apify Actors Tool

**Source** : https://docs.crewai.com/en/tools/automation/apifyactorstool.md

**À quoi sert** : Lance des **Apify Actors** (programmes cloud réutilisables) pour web scraping, crawling, extraction de données. Accès aux 4000+ Actors du Apify Store.

**Installation + Import**

```bash
pip install 'crewai[tools]' langchain-apify
```

```python
from crewai_tools import ApifyActorsTool
```

**Env vars** : `APIFY_API_TOKEN`

**Signatures** :
```python
tool = ApifyActorsTool(actor_name="apify/rag-web-browser")
tool.run(run_input={"query": "...", "maxResults": 5})
```

**Pertinence Daily Chief of Staff** : **À évaluer (V2+)**. Utile pour scraping LinkedIn (contacts, opportunités). Non critique pour MVP : Composio + Firecrawl couvrent cas d'usage.

---

### MultiOn Tool

**Source** : https://docs.crewai.com/en/tools/automation/multiontool.md

**À quoi sert** : Donne aux agents la capacité de naviguer et interagir avec le web via instructions NLP.

**Installation** : `uv add multion`

**Env vars** : `MULTION_API_KEY`

**Signatures** :
```python
MultiOnTool(api_key="...", local=False, max_steps=3)
```

**Pertinence Daily Chief of Staff** : **NON** pour MVP. Overlap avec Stagehand/Browserbase (plus matures). Trop lent pour daily flow.

---

### Zapier Actions Tool

**Source** : https://docs.crewai.com/en/tools/automation/zapieractionstool.md

**À quoi sert** : Expose les Zapier Actions comme outils CrewAI (5000+ apps).

**Import** :
```python
from crewai_tools.adapters.zapier_adapter import ZapierActionsAdapter
```

**Env vars** : `ZAPIER_API_KEY`

**Signatures** :
```python
adapter = ZapierActionsAdapter(api_key="...")
tools = adapter.tools()
```

**Pertinence Daily Chief of Staff** : **NON** pour MVP. Redondant avec Composio.

---

## Web Scraping Tools

### Browserbase Web Loader

**Source** : https://docs.crewai.com/en/tools/web-scraping/browserbaseloadtool.md

**À quoi sert** : Headless browsers fiables en cloud avec Stealth Mode (bypass anti-bots), CAPTCHA solving auto, debugging visuel.

**Installation** : `pip install browserbase 'crewai[tools]'`

**Import** :
```python
from crewai_tools import BrowserbaseLoadTool
```

**Env vars** : `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`

**Signatures** :
```python
BrowserbaseLoadTool(
    api_key="...", project_id="...",
    text_content=False, session_id=None, proxy=False
)
tool.run(url="https://example.com")
```

**Pertinence Daily Chief of Staff** : **OUI** (complémentaire Composio). Browserbase déjà câblé dans .env.local. Cas d'usage : monitoring LinkedIn, dashboards internes sans API.

---

### Bright Data Tools

**Source** : https://docs.crewai.com/en/tools/web-scraping/brightdata-tools.md

**À quoi sert** : Trois outils — SERP Search (Google/Bing/Yandex), Web Unlocker (scraping anti-bot), Dataset API.

**Imports** :
```python
from crewai_tools import (
    BrightDataSearchTool,
    BrightDataWebUnlockerTool,
    BrightDataDatasetTool
)
```

**Env vars** : `BRIGHT_DATA_API_KEY`, `BRIGHT_DATA_ZONE`

**Pertinence Daily Chief of Staff** : **À évaluer (V2+)**. SERP Search intéressant pour veille.

---

### Firecrawl Scrape Website

**Source** : https://docs.crewai.com/en/tools/web-scraping/firecrawlscrapewebsitetool.md

**À quoi sert** : Scrape une page unique → Markdown propre ou données structurées via LLM. Léger, rapide.

**Installation** : `pip install firecrawl-py 'crewai[tools]'`

**Import** :
```python
from crewai_tools import FirecrawlScrapeWebsiteTool
```

**Env vars** : `FIRECRAWL_API_KEY`

**Signatures** :
```python
tool = FirecrawlScrapeWebsiteTool(url='https://example.com')
tool.run(
    url="...",
    page_options={"onlyMainContent": True},
    extractor_options={"mode": "llm-extraction", "extractionPrompt": "..."}
)
```

**Pertinence Daily Chief of Staff** : **OUI** (léger + rapide). Coût ~$20-50/mois pour 10k scrapes/mois. Veille quotidienne news/articles.

---

### Firecrawl Crawl Website

**Source** : https://docs.crewai.com/en/tools/web-scraping/firecrawlcrawlwebsitetool.md

**À quoi sert** : Crawl complet d'un site multi-pages.

**Import** :
```python
from crewai_tools import FirecrawlCrawlWebsiteTool
```

**Signatures** :
```python
FirecrawlCrawlWebsiteTool(url='https://example.com')
tool.run(url="...", crawler_options={"maxDepth": 3, "limit": 50, "mode": "fast"})
```

**Pertinence Daily Chief of Staff** : **OUI** (indexation documentation interne pour knowledge base).

---

### HyperBrowser Load Tool

**Source** : https://docs.crewai.com/en/tools/web-scraping/hyperbrowserloadtool.md

**Pertinence Daily Chief of Staff** : **À évaluer** — compétiteur Browserbase, choisir l'un OU l'autre. Préférer Browserbase (mature + déjà câblé).

---

### Oxylabs Scrapers (Amazon, Google, Universal)

**Source** : https://docs.crewai.com/en/tools/web-scraping/oxylabsscraperstool.md

**Pertinence Daily Chief of Staff** : **NON** pour MVP — Spécialisé ecommerce.

---

### Scrape Element From Website Tool

**Source** : https://docs.crewai.com/en/tools/web-scraping/scrapeelementfromwebsitetool.md

**À quoi sert** : Scrape éléments spécifiques via CSS selectors. Local, léger.

**Installation** : `uv add requests beautifulsoup4`

**Pertinence Daily Chief of Staff** : **OUI** (léger). Extraction simples.

---

### ScrapegraphScrape Tool

**Source** : https://docs.crewai.com/en/tools/web-scraping/scrapegraphscrapetool.md

**Env vars** : `SCRAPEGRAPH_API_KEY`

**Pertinence Daily Chief of Staff** : **À évaluer** (V2+). Extraction structurée AI-powered.

---

### Scrape Website Tool (basique)

**Source** : https://docs.crewai.com/en/tools/web-scraping/scrapewebsitetool.md

**Pertinence Daily Chief of Staff** : **NON** pour production — Trop basique. Firecrawl/Browserbase préférés.

---

### Scrapfly Scrape Website Tool

**Source** : https://docs.crewai.com/en/tools/web-scraping/scrapflyscrapetool.md

**Pertinence Daily Chief of Staff** : **À évaluer** — Alternative Browserbase.

---

### Selenium Scraper

**Source** : https://docs.crewai.com/en/tools/web-scraping/seleniumscrapingtool.md

**Pertinence Daily Chief of Staff** : **NON** — Lent (2-5s/page). Browserbase/Stagehand préférés.

---

### Spider Scraper

**Source** : https://docs.crewai.com/en/tools/web-scraping/spidertool.md

**Env vars** : `SPIDER_API_KEY`

**Pertinence Daily Chief of Staff** : **OUI** alternative pour crawl ultra-rapide.

---

### Stagehand Tool

**Source** : https://docs.crewai.com/en/tools/web-scraping/stagehandtool.md

**À quoi sert** : Web automation intelligente (Browserbase + AI) — Act/Extract/Observe via instructions NLP.

**Installation** : `pip install stagehand-py`

**Imports** :
```python
from crewai_tools import StagehandTool
from stagehand.schemas import AvailableModel
```

**Env vars** : `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` + LLM API key

**Signatures** :
```python
with StagehandTool(
    api_key="browserbase-key",
    project_id="proj-id",
    model_api_key="llm-key",
    model_name=AvailableModel.CLAUDE_3_7_SONNET_LATEST
) as tool:
    tool.run(instruction="Click login button", url="...", command_type="act")
    tool.run(instruction="Extract all titles", url="...", command_type="extract")
    tool.run(instruction="Find interactive buttons", url="...", command_type="observe")
```

**Pertinence Daily Chief of Staff** : **OUI** (V2+, haute valeur automation). Remplit formulaires, navigation complexe (expensing, CRM web sans API).

---

### You.com Content Extraction Tool

**Source** : https://docs.crewai.com/en/tools/web-scraping/youai-contents.md

**Installation** : `pip install "crewai-tools[mcp]>=0.1"`

**Env vars** : `YDC_API_KEY`

**Pertinence Daily Chief of Staff** : **À évaluer** — Alternative Firecrawl.

---

## Integration Tools

### Bedrock Invoke Agent Tool

**Source** : https://docs.crewai.com/en/tools/integration/bedrockinvokeagenttool.md

**Pertinence Daily Chief of Staff** : **NON** pour MVP — AWS-specific.

---

### CrewAI Run Automation Tool

**Source** : https://docs.crewai.com/en/tools/integration/crewaiautomationtool.md

**À quoi sert** : Invoque les CrewAI Platform automations depuis agents locaux.

**Import** :
```python
from crewai_tools import InvokeCrewAIAutomationTool
```

**Env vars** : `CREWAI_API_URL`, `CREWAI_BEARER_TOKEN`

**Signatures** :
```python
InvokeCrewAIAutomationTool(
    crew_api_url, crew_bearer_token, crew_name, crew_description,
    max_polling_time=600
)
```

**Pertinence Daily Chief of Staff** : **À évaluer (V2+)**. Si on veut déployer des sous-crews sur CrewAI AMP plus tard.

---

### Merge Agent Handler Tool

**Source** : https://docs.crewai.com/en/tools/integration/mergeagenthandlertool.md

**À quoi sert** : Accès unifié et sécurisé à 300+ intégrations (Linear, GitHub, Slack, Notion, Jira). Alternative entreprise à Composio.

**Import** :
```python
from crewai_tools import MergeAgentHandlerTool
```

**Env vars** : `AGENT_HANDLER_API_KEY`

**Signatures** :
```python
MergeAgentHandlerTool.from_tool_name(tool_name, tool_pack_id, registered_user_id)
MergeAgentHandlerTool.from_tool_pack(tool_pack_id, registered_user_id, tool_names=None)
```

**Pertinence Daily Chief of Staff** : **À évaluer** vs Composio. Composio retenu pour MVP (plus simple, moins cher, entity-based multi-tenant clean).

---

## Synthèse tools sélectionnés pour Daily Chief of Staff (Part B)

### Core Stack MVP

1. **Composio Tool** — **CRITIQUE**. Backbone du projet. 250+ actions Gmail/Slack/Telegram/Calendar/Notion. Déjà câblé (`COMPOSIO_API_KEY`).

2. **Firecrawl Scrape + Crawl** — Léger, rapide. Veille news + indexation docs.

3. **Browserbase Load Tool** — Pour scraping sites JS-heavy / anti-bots. Déjà câblé.

4. **Scrape Element From Website Tool** — Extraction CSS simple, local, gratuit.

### V2+ Stack

5. **Stagehand** — Automation web intelligente (formulaires, CRM web).
6. **Firecrawl Crawl** — Indexation docs perso/team.
7. **Apify Actors** — Si scraping LinkedIn requis.
8. **CrewAI Run Automation** — Si on déploie sous-crews sur CrewAI AMP.

### Estimation coût MVP

- **Composio** : ~$50/mois (executive tier)
- **Firecrawl** : ~$20-30/mois (10k scrapes)
- **Browserbase** : déjà payé (~$100/mois usage modéré)

**Total** : ~$170-180/mois pour les tools externes (LLM costs en sus).

### NON retenu

- **Zapier** (redondant Composio)
- **MultiOn** (trop lent)
- **Selenium** (lent)
- **Scrape Website basique** (HTTP brut)
- **Merge Agent Handler** (overkill enterprise)
- **Bedrock Invoke Agent** (AWS-specific)
- **Oxylabs** (ecommerce niche)

### Pattern d'intégration de base

```python
from composio_crewai import ComposioProvider
from composio import Composio
from crewai_tools import FirecrawlScrapeWebsiteTool, BrowserbaseLoadTool
from crewai import Agent, Task, Crew

# Composio = backbone
composio = Composio(provider=ComposioProvider())
session = composio.create(
    user_id="adrien",
    toolkits=["gmail", "slack", "telegram", "google_calendar", "notion"]
)
composio_tools = session.tools()

# Compléments
firecrawl = FirecrawlScrapeWebsiteTool()
browserbase = BrowserbaseLoadTool()

# Inbox Collector Agent (Daily Chief of Staff)
collector = Agent(
    role="Inbox Collector",
    goal="Capture all unread messages across Gmail, Slack, Telegram",
    backstory="Hyper-organized assistant aggregating all comms",
    tools=composio_tools,  # GMAIL_FETCH_EMAILS, SLACK_FETCH_MESSAGES, TELEGRAM_GET_UPDATES
    verbose=True
)
```

**Conclusion** : Composio = épine dorsale 100% obligatoire. Firecrawl/Browserbase = extensions optionnelles selon besoin scraping. Pas de redondance Zapier/Merge nécessaire.
