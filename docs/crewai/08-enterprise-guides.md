# 08 — Enterprise Guides + Resources + Examples

La documentation CrewAI Enterprise (LOT 8) couvre trois domaines essentiels pour le déploiement en production d'agencements IA : **(1) les triggers événementiels** sur 10 intégrations majeures (Gmail, Slack, Calendar, Teams, Drive, OneDrive, Outlook, HubSpot, Salesforce, Zapier), **(2) les opérations déploiement/orchestration** (AMP deployment, HITL workflows, équipe management, telemetry), et **(3) les patterns réutilisables** via examples/cookbooks. Cet ingestion exhaustive établit les fondations pour l'architecture trigger-driven de Daily Chief of Staff.

## Triggers — Framework Événementiel

### 1. Automation Triggers (Framework Core)

**Source:** https://docs.crewai.com/en/enterprise/guides/automation-triggers.md

CrewAI AMP Triggers est un **framework événementiel décentralisé** permettant aux crews de réagir en temps réel à des changements sur 10 intégrations majeures (Communication: Gmail/Outlook/Teams/Slack; Calendar: Google Calendar; Storage: Drive/OneDrive; CRM: HubSpot/Salesforce; Connector: Zapier). Chaque trigger écoute des changements spécifiques et lance immédiatement le crew configuré, sans nécessiter activation manuelle ou polling continu.

**Processus setup:**
1. Connecter l'intégration sous Tools & Integrations (OAuth/API)
2. Activer les toggles trigger sur deployments cibles
3. Configurer env variables et secrets
4. Définir tasks pour parser `crewai_trigger_payload`
5. Décider si auto-inject du contexte trigger via `allow_crewai_trigger_context`
6. Établir monitoring infra

**Testing local:** `crewai triggers list` + `crewai triggers run <trigger_name>` (pas `crewai run`—cette commande ne passe jamais la payload trigger).

**Reception données:** Les crews reçoivent la payload trigger via `crewai_trigger_payload` en context. Dans Flows, les méthodes `@start()` acceptent automatiquement ce paramètre pour conditional processing. Filtrage custom/transformation occur dans task definitions parsing la payload.

**Pertinence Daily Chief of Staff:** CRITIQUE. Framework umbrella pour les 10 triggers spécialisés ci-dessous. Pour myswarms : intégrer Gmail → classification email + extraction task, Slack → priorité message + brouillon réponse, Calendar → re-planification agenda, Outlook → sync inbox + escalation, Teams → routing urgent messages. Tous les triggers peuvent être chainés en parallel via Webhook Automation (voir section ci-dessous).

---

### 2. Gmail Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/gmail-trigger.md

**Événement déclencheur:** Nouveaux emails reçus + labels appliqués.

**Payload reçu:** Structure `crewai_trigger_payload` contenant : sender, subject, body/content, labels appliqués, timestamps. Data complète passée via contexte standard.

**Filtrage:** Non détaillé dans la doc; relies sur parsing logic dans tasks pour filtrer par expéditeur, sujet, labels, priorité Gmail.

**Code/config snippet:**
```python
from calendar_event_crew import GoogleCalendarEventTrigger

crew = GoogleCalendarEventTrigger().crew()
result = crew.kickoff({
    "crewai_trigger_payload": gmail_payload,
})
```

**Testing local:** `crewai triggers run gmail/new_email_received` — révèle exact payload format pour dev.

**Pertinence Daily Chief of Staff:** EXTRÊMEMENT CRITIQUE. Agent `email_classifier` réagit à chaque nouvel email :
- Extrait sujet, sender, body
- Classifie par urgence (CRITICAL/HIGH/MEDIUM/LOW)
- Détecte action items → crée task draft
- Consulte HITL pour validation avant send du brouillon à l'user
- Peut marquer email comme "processed" via label Gmail API

Pattern: Email in → Classifier Agent → Task/Brouillon out → Human-in-the-Loop (approval) → Send draft ou archive.

---

### 3. Slack Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/slack-trigger.md

**Événement déclencheur:** `/kickoff` slash command exécuté dans un channel Slack (user interaction-based, non event-driven webhook).

**Payload reçu:** Documentation ne détaille pas les champs techniques. Flow utilisateur :
1. User invoque `/kickoff` dans channel
2. Dialog "Kickoff an AI Crew" apparaît
3. User sélectionne crew depuis dropdown "Select of the crews online"
4. Optional: Click "Add Inputs" pour passer params
5. Click "Kickoff" → execution launch

**Filtrage:** Crew selection dropdown comme mécanisme filtering. User choisit quel crew exécuter parmi les online.

**Configuration:** CrewAI Slack trigger installé + connecté workspace, >= 1 crew configuré, vérifier status dans dashboard Triggers, users avec permissions pour `/kickoff` command, crews online visible en dropdown.

**Pertinence Daily Chief of Staff:** MODÉRÉ. Pour myswarms : intégrer `/kickoff` Slack comme *manual trigger pour plannings exceptionnels* (réunion non-planifiée détectée, user demande au Chief of Staff de réagir immédiatement). Plutôt que trigger Slack passif (pas d'event-driven message listener documenté), c'est un point d'entrée **manual kickoff** depuis Slack. Peut enchaîner avec email_classifier output pour notifier user via Slack plutôt que email brouillon.

---

### 4. Google Calendar Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/google-calendar-trigger.md

**Événement déclencheur:** Créé, modifié ou annulé sur la calendar.

**Payload reçu:** `crewai_trigger_payload` contenant :
- Event metadata (start/end times comme timestamps, ou `start.date`/`end.date` pour all-day events)
- Attendee info
- Event details + changes

**Important:** All-day events utilise `start.date`/`end.date` au lieu de timestamps; calendar permissions peuvent limiter fields disponibles.

**Code snippet:**
```python
from calendar_event_crew import GoogleCalendarEventTrigger

crew = GoogleCalendarEventTrigger().crew()
result = crew.kickoff({
    "crewai_trigger_payload": calendar_payload,
})
```

**Testing local:** `crewai triggers run google_calendar/event_changed` — simule avec realistic calendar data.

**Setup/Monitoring:** Enable trigger dans Triggers tab, verify Google Calendar integration dans Tools & Integrations, monitor via Executions dashboard (payload metadata, summaries, errors).

**Pertinence Daily Chief of Staff:** CRITIQUE. Agent `calendar_monitor` réagit sur chaque event changed :
- Event créé → Extraire durée, participants, contexte → Alerte Chief: "new 2h meeting detected, blocks focus time"
- Event modifié → Compare before/after → Notify stakeholders de changement
- Event annulé → Libère slots → Suggest reprogramming urgent tasks
- Pattern: Calendar event → Trigger → Analyzer Agent → Notify Chief via draft message/email → HITL validation → Send ou dismiss.

---

### 5. Outlook Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/outlook-trigger.md

**Événements déclencheurs:** 
- Email reçu
- Calendar event removed

**Payload reçu:** Sender details, subject, body preview, attachments metadata. **Important:** Calendar cancellation payloads intentionally omit attendee lists—crews doivent handle gracefully (pas de lista attendees pour notifier).

**Code snippet:**
```python
from outlook_message_crew import OutlookMessageTrigger

crew = OutlookMessageTrigger().crew()
crew.kickoff({
    "crewai_trigger_payload": outlook_payload,
})
```

**Testing local:** `crewai triggers run microsoft_outlook/email_received` — ne pas utiliser `crewai run`.

**Pertinence Daily Chief of Staff:** MODÉRÉ-ÉLEVÉ. Pour myswarms (si user est sur Outlook au lieu de Gmail) :
- Email reçu → similar flow à Gmail Trigger (classify, extract, propose action)
- Calendar event removed → Libère créneau → Alert Chief of Staff + suggest rescheduling
- Dual mail sync: Gmail + Outlook si user a deux comptes pro/perso

---

### 6. Microsoft Teams Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/microsoft-teams-trigger.md

**Événement déclencheur:** Nouveau chat créé dans Teams.

**Payload reçu:** Thread metadata : subject line, creation timestamp, participant roster.

**Important:** Graph notifications peuvent omit fields si chat privé/restricted → handle incomplete payloads gracefully.

**Code snippet:**
```python
from teams_chat_created_crew import MicrosoftTeamsChatTrigger

crew = MicrosoftTeamsChatTrigger().crew()
result = crew.kickoff({
    "crewai_trigger_payload": teams_payload,
})
```

**Testing local:** `crewai triggers run microsoft_teams/teams_message_created`.

**Pertinence Daily Chief of Staff:** MODÉRÉ. Pour myswarms : 
- Nouveau chat créé → Extract sujet, participants → Determine si urgent/escalation needed
- Route vers Slack notification ou email draft summary pour Chief
- Pas de message-level trigger documenté (seulement chat creation), donc plutôt utilisé pour détecter *new conversation threads* (réunions de crise, standups nouveaux) que pour monitor tous messages.

---

### 7. Google Drive Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/google-drive-trigger.md

**Événement déclencheur:** Fichiers créés, modifiés ou supprimés dans Google Drive.

**Payload reçu:** Trigger envoie **file IDs seulement**—pas de contenu binaire. Additional metadata nécessite séparate Drive API calls.

**Code snippet:**
```python
from drive_file_crew import GoogleDriveFileTrigger

crew = GoogleDriveFileTrigger().crew()
crew.kickoff({
    "crewai_trigger_payload": drive_payload,
})
```

**Testing local:** `crewai triggers run google_drive/file_changed`.

**Pertinence Daily Chief of Staff:** MODÉRÉ. Pour myswarms :
- Document créé/modifié → Extract file ID, name, creator → Alerte Chief: "new proposal doc uploaded, needs review"
- File removed → Alerte: "document deleted by [user]"
- Moins prioritaire que email/calendar pour un Chief of Staff, mais utile pour détecter *when team members add new agendas, notes, or proposals* qui nécessitent Chief review.

---

### 8. OneDrive Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/onedrive-trigger.md

**Événement déclencheur:** Changements fichiers dans OneDrive.

**Payload reçu:** `crewai_trigger_payload` contenant file metadata, user activity details, permission changes.

**Code snippet:**
```python
from onedrive_file_crew import OneDriveFileTrigger

crew = OneDriveFileTrigger().crew()
crew.kickoff({
    "crewai_trigger_payload": onedrive_payload,
})
```

**Testing local:** `crewai triggers run microsoft_onedrive/file_changed`.

**Pertinence Daily Chief of Staff:** MODÉRÉ. Equivalent Google Drive pour Microsoft ecosystem. Si user stocke documents professionnels en OneDrive, intégrer pour detecting new files/changes qui nécessitent Chief attention.

---

### 9. HubSpot Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/hubspot-trigger.md

**Événement déclencheur:** Workflows HubSpot peuvent inclure action "Kickoff a Crew".

**Payload reçu:** Non documenté explicitement. System retourne crew execution data comme "Action outputs > Crew Result" dans workflow steps.

**Code/config:** Pas fourni; setup via UI HubSpot Workflows :
1. Connect HubSpot account → Triggers menu
2. Create workflow → Add action "Kickoff a Crew"
3. Chain additional actions (email notifications) using crew results
4. Insert data via workflow builder: `View properties or action outputs > Action outputs > Crew Result`

**Pertinence Daily Chief of Staff:** FAIBLE-MODÉRÉ. Pour myswarms :
- Trigger HubSpot workflows qui incluent Crew kickoff (ex: "contact reaches top of sales pipeline" → Kickoff crew pour analyze deal)
- Less relevant for *personal Chief of Staff*; plus valuable si user gère sales team et veut auto-analyze deals.
- Peut combiner avec email/Slack notify pour Chief review du deal analysis.

---

### 10. Salesforce Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/salesforce-trigger.md

**Status:** Documentation introductory only; n'inclut pas trigger event specs, payload structure, ou code examples. Requires contacting CrewAI Support.

**Use cases mentionnés:**
- Automatically analyze & score incoming leads
- Proposal generation from opportunity data
- Customer interaction analysis
- Personalized follow-up creation

**Setup:** Contact Support → Review Requirements → Configure Connection → Test Triggers.

**Pertinence Daily Chief of Staff:** TRÈS FAIBLE. Sans documentation complète, integration difficile. Pas essentiel pour myswarms à moins que user manage Salesforce directly.

---

### 11. Zapier Trigger

**Source:** https://docs.crewai.com/en/enterprise/guides/zapier-trigger.md

**Événements supportés:**
- Trigger: "New Pushed Message" from Slack channels
- Action: "Kickoff" pour CrewAI crews via CrewAI+ app en Zapier

**Setup workflow (7 steps):**

1. **Initial config:** Create new Zap → Slack as trigger app → Connect workspace
2. **Crew execution:** Add CrewAI+ action → Select "Kickoff" action → Authenticate CrewAI AMP account → Select crew → Map Slack message data to crew inputs
3. **Output processing:** Format CrewAI Markdown output to HTML (Zapier tools) → Configure email service (Gmail/Outlook) → Insert processed output in email body avec recipient, subject, message customizable
4. **Activation:** Post message in Slack → Three-dot menu → "Push to Zapier" → Confirm crew selection → Execute kickoff

**Key:** Test workflows before activation; implement error-handling steps.

**Pertinence Daily Chief of Staff:** MODÉRÉ. For myswarms :
- **Slack → Zapier → CrewAI Crew → Email Chief** pipeline. User posts message en Slack (via 3-dot "Push to Zapier") → Zapier kickoff crew → Crew génère analysis/response → Zapier formats output as HTML → Email sent to Chief
- Allows one-click *manual triggers* from Slack without relying on webhook or cron. Good for "when something happens in Slack, I want my Chief AI to analyze and email me the result".
- Pattern: Manual Slack trigger + Async crew processing + Formatted email delivery.

---

### 12. Webhook Automation

**Source:** https://docs.crewai.com/en/enterprise/guides/webhook-automation.md

**Overview:** CrewAI AMP webhooks enable workflow automation avec ActivePieces, Zapier, Make.com. **3 webhook types:**

1. **Step Webhook** (`stepWebhookUrl`): Post-execution de chaque agent's inner thought → prompt, reasoning, tool usage, results
2. **Task Webhook** (`taskWebhookUrl`): Upon task completion → description, summary, output, structured JSON
3. **Crew Webhook** (`crewWebhookUrl`): À workflow conclusion → final results, scoring, talking points, token usage metrics

**Kickoff Endpoint Setup:**
- Method: POST
- Required headers: Bearer Token (auth)
- JSON body: `{ "inputs": { company, product_name, form_response, descriptions }, "stepWebhookUrl": "...", "taskWebhookUrl": "...", "crewWebhookUrl": "..." }`

**Payload responses include:**
- `kickoff_id`: Unique execution identifier
- `meta` object: Custom metadata from initial request (tracking context)
- Response-specific data (thought process, task output, final results)
- Token usage metrics (total, prompt, completion)

**Security:** Bearer token auth documenté; TLS/rate limiting/signature verification not detailed.

**Example via ActivePieces:**
1. Create flow avec scheduled trigger (daily)
2. Add HTTP action → POST method
3. Configure auth headers
4. Include JSON payload avec crew params + webhook URLs

**Pertinence Daily Chief of Staff:** CRITIQUE. Pour myswarms :
- **Webhook in:** External scheduler (n8n, Inngest, Vercel cron) peut POST à crew endpoint avec `inputs` + `crewWebhookUrl`
- **Webhook out:** Crew retourne results via `crewWebhookUrl` callback → Webhook handler peut:
  - Format output + email to Chief (alternative à direct response)
  - Log results en DB/observability backend
  - Trigger downstream actions (Slack notify, Calendar update, etc.)
- Enables **fully async pattern:** Cron trigger 06:00 AM + 05:00 PM → Webhook kickoff → Crew runs → Webhook callback notifies Chief → HITL review → Send output
- Critical for decoupling crew execution from Chief notification.

---

## Deployment & Operations

### 1. Prepare for Deployment (Checklist)

**Source:** https://docs.crewai.com/en/enterprise/guides/prepare-for-deployment.md

**Pre-deployment verification checklist:**

| Item | Check |
|------|-------|
| `[tool.crewai]` in pyproject.toml | type: "crew" or "flow" ✓ |
| `uv.lock` file | **REQUIRED** for reproducible builds; run `uv lock` + commit ✓ |
| `@CrewBase` decorator | Present on every crew class ✓ |
| Entry points | Crews: `run()` in `main.py`; Flows: `kickoff()` + Flow class def ✓ |
| Project structure | Crews: `src/project_name/crew.py` with agents/tasks; Flows: `src/project_name/crews/` ✓ |
| Environment variables | LLM API keys, tool-specific keys, private PyPI registry creds ✓ |
| Local testing | Verify with production env vars before deployment ✓ |

**Common pitfalls:**

| Issue | Resolution |
|------|-----------|
| Missing `uv.lock` | `uv lock` + commit |
| Incorrect project type | Verify matches structure |
| Missing `@CrewBase` | Add to all crew classes |
| File location errors | Ensure `src/` compliance |

**Next:** If all checks pass → ready for AMP deployment.

**Pertinence Daily Chief of Staff:** CRITIQUE. Before any deployment to Railway/Vercel/n8n, must validate:
- myswarms crew has `@CrewBase` decorator
- `uv.lock` exists (reproducibility)
- `src/myswarms/crew.py` structure correct
- All env vars for Gmail/Slack/Calendar triggers are set locally
- HITL callback webhook URL configurable
- Run locally with production env before deploying

---

### 2. Deploy to AMP

**Source:** https://docs.crewai.com/en/enterprise/guides/deploy-to-amp.md

**3 deployment methods:**

#### Option 1: CrewAI CLI (Fastest)
```bash
pip install crewai[tools]
crewai login  # Opens browser for device confirm
crewai deploy create  # From project directory
crewai deploy status
crewai deploy logs
crewai deploy push  # After code changes
crewai deploy remove  # Delete deployment
```
- Auto-detects GitHub info + env vars
- First deploy: ~1 min
- Receive unique ID + bearer token

#### Option 2: Web Interface (app.crewai.com)
1. Push code to GitHub
2. Log in → "Connect GitHub" → Select repo
3. Configure env vars (KEY=VALUE; bulk entry supported)
4. Click "Deploy"
5. Get unique URL + Bearer token

#### Option 3: API-Triggered Redeployment (CI/CD)
- Generate Personal Access Token en account settings
- Get automation UUID from Automations dashboard
```
POST https://app.crewai.com/crewai_plus/api/v1/crews/[UUID]/deploy
Authorization: Bearer [YOUR_TOKEN]
```
- GitHub Actions example: Trigger on main push, PRs with "deploy" label, releases

**Post-deployment dashboard:**
- **Status tab:** Endpoint details, auth info
- **Run tab:** Visual crew structure
- **Executions tab:** History + timeline
- **Metrics tab:** Token usage, costs
- **Traces tab:** Detailed execution breakdowns

**API endpoints:** `/inputs`, `/kickoff`, `/status/{kickoff_id}`, plus all trigger webhooks.

**Pertinence Daily Chief of Staff:** TRÈS IMPORTANT. For myswarms deployment:
- **Option 1 (CLI):** Use for local development → test triggers locally → `crewai deploy create` to AMP
- **Option 3 (CI/CD):** Railway/Vercel can trigger redeployment via GitHub Actions webhook when main branch updates
- AMP **NOT recommended** for myswarms since project deploys to Railway (not AMP directly), but patterns are portable:
  - Bearer token auth → apply to Railway deployment auth
  - Webhook input/output → use Vercel Edge Functions or Railway internal webhooks
  - Metrics/traces dashboard → replicate with Supabase analytics + OpenTelemetry (see Capture Telemetry)

---

### 3. Human-in-the-Loop (HITL)

**Source:** https://docs.crewai.com/en/enterprise/guides/human-in-the-loop.md

**2 HITL patterns:**

#### Pattern 1: Flow-Based (1.8.0+; Enterprise)
- Uses `@human_feedback` decorator
- Email-first design: responders reçoivent notifications + répondent directly (no platform login needed)
- Dashboard access as alternative review method
- Dynamic routing via flow state variables (ex: `account_owner_email`)
- Automatic fallback responses on timeout

#### Pattern 2: Webhook-Based (All versions)
1. Configure tasks avec human input enabled
2. Supply `webhook_url` during crew kickoff
3. Receive notification: execution ID, task ID, output
4. Execute **resume API call** avec human feedback + webhook URLs (must resubmit!)
5. Handle negative feedback: allow task retry avec added context
6. Continue execution on approval

**Webhook resume flow:**
```
Crew runs → Human input required → POST to webhook_url
Webhook receiver notifies human (email/Slack/Teams)
Human reviews output + decides: approve / reject+retry
Resume API call: POST /resume with { feedback, webhook_urls }
Crew resumes with feedback injected
```

**Critical:** Webhook URLs **don't carry over**—must resubmit in resume calls.

**Best practices:**
- Provide specific, actionable guidance
- Include only relevant info (avoid negative influence)
- Respond promptly
- Thoroughly review before submit

**Optimal use cases:** QA, high-stakes decisions, sensitive ops, creative tasks, compliance.

**Pertinence Daily Chief of Staff:** EXTRÊMEMENT CRITIQUE. For myswarms core loop:

1. **Email Classification HITL:**
   - Email received → email_classifier agent → proposes task extraction + priority
   - Task output webhook → notify Chief via email: "New task: [X]. Approve? Y/N"
   - Chief replies `Y` → resume crew with approval → send confirmation to calendar/Slack
   - Chief replies `N` → resume crew with rejection + optional feedback → archive email

2. **Daily Planning HITL:**
   - Morning: Cron trigger → planner agent → analyzes calendar + tasks → generates daily agenda
   - Webhook → email Chief the agenda + block calendar time
   - Chief approves → calendar blocks confirmed
   - Chief modifies → resume with new ordering

3. **Slack Draft HITL:**
   - Slack message detected → responder agent → draft reply
   - Webhook → Slack message with draft + "Send / Edit / Dismiss" buttons
   - Chief clicks "Send" → resume + post to Slack
   - Chief clicks "Edit" → manual edit + resume

**Implementation for myswarms:**
- Railway webhook endpoint (Vercel Edge Function) receives crew notifications
- Parse execution ID, task ID, output
- Format email/Slack notification with "Approve" link
- Link = `https://myswarms.app/api/resume-crew?execution_id=X&feedback=approve&webhook_urls=[...]`
- API handler calls CrewAI resume endpoint avec approval
- Crew continues

---

### 4. Kickoff Crew (Manual Trigger)

**Source:** https://docs.crewai.com/en/enterprise/guides/kickoff-crew.md

**Web interface method:**
- Navigate to crew detail page
- Use "Test Endpoints" (JSON input) or "Run" tab (form fields)
- Execution returns `kickoff_id`
- Monitor via Status endpoint or Executions tab

**API method (HTTPS):**

Health check:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-crew-url.crewai.com
```

Get inputs spec:
```bash
curl -X GET -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-crew-url.crewai.com/inputs
# Response: { "inputs": ["topic", "current_year"] }
```

Kickoff:
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"inputs": {"topic": "value", "current_year": "value"}}' \
  https://your-crew-url.crewai.com/kickoff
# Response: { "kickoff_id": "abc123..." }
```

Check status:
```bash
curl -X GET -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-crew-url.crewai.com/status/abc123
# Response: { "status": "completed", "result": { ... } }
```

**Pertinence Daily Chief of Staff:** MOYEN. For myswarms:
- Use API kickoff to trigger crews from Railway backend
- GET `/inputs` → determine required fields for crew
- POST `/kickoff` → start crew with daily context (current_date, user_email, calendar_url, etc.)
- Poll `/status/{id}` → monitor execution in background
- On completion → webhook callback notify Chief

---

### 5. Update Crew

**Source:** https://docs.crewai.com/en/enterprise/guides/update-crew.md

**3 update mechanisms:**

1. **Code updates:** Navigate to crew → "Re-deploy" → Pulls latest from repo + rebuilds
2. **Bearer token rotation:** Status tab → "Reset" → Invalidates old token immediately (update scripts)
3. **Environment variable modification:** Settings tab → Edit vars → "Update Deployment" (config-only, no code)

**Auto-update:** Only applies if enabled during initial deployment; otherwise manual re-deploy required.

**Limitations:** No versioning, rollback, or hot-update documented.

**Pertinence Daily Chief of Staff:** MOYEN. For myswarms on Railway:
- Code updates: Git push to main → Railway auto-rebuild (if configured)
- Env var updates: Railway dashboard → set new OPENAI_API_KEY → restart container
- No direct AMP re-deploy needed; Railway handles CI/CD
- If integrating with AMP crews later: use "Re-deploy" button for code updates

---

### 6. Build Crew (Crew Studio UI)

**Source:** https://docs.crewai.com/en/enterprise/guides/build-crew.md

**Crew Studio:** No-code/low-code tool for describing problems conversationally → auto-generate crews.

**Key capabilities:**
- Chat interface to describe problem
- System generates agents + tasks + tool selection
- Set inputs + parameters
- Export code for customization
- Deploy directly to AMP

**Setup requirements:**
1. **Create LLM Connection:** LLM Connections → Configure provider (OpenAI/Azure) → Add API credentials as env vars → Select models (gpt-4o, gpt-4o-mini)
2. **Set Defaults:** Settings → Defaults → Establish default models + crew configs
3. **Verify setup:** Connection appears in available list

**Workflow:** User describes problem → Answer clarifying Qs → Review generated config (agents, tasks, tools) → Download code or deploy directly.

**Pertinence Daily Chief of Staff:** FAIBLE-MOYEN. For myswarms:
- Could use Crew Studio to **prototype new agents** (email classifier, calendar analyzer, etc.) conversationally
- Export generated code → refine in IDE (add HITL, webhooks, trigger integration)
- NOT recommended for production build (prefer code-first for full control of triggers, webhooks, HITL)

---

### 7. Enable Crew Studio

**Source:** https://docs.crewai.com/en/enterprise/guides/enable-crew-studio.md

**Simple prerequisite:** Must establish LLM connections before using Crew Studio (same as "Build Crew" section above).

**Pertinence Daily Chief of Staff:** TRÈS FAIBLE. Informational only; covered under "Build Crew".

---

### 8. Team Management

**Source:** https://docs.crewai.com/en/enterprise/guides/team-management.md

**Member invitation:** Settings > Members tab → Enter email → Send invitation → Invitee accepts via email → Assign role

**Role-based access control:** Create custom roles → Assign to members → Control access to platform parts (specific permission details not elaborated)

**Critical:** Admin-only action; email verification required; members must accept before role assignment.

**Limitations:** Specific permissions not documented; collaboration features beyond member management not detailed.

**Pertinence Daily Chief of Staff:** TRÈS FAIBLE. For myswarms (single-user app):
- If expanding to multi-user later: implement role management (Chief, Delegate, Viewer)
- Chief: full access to crew configs, HITL approvals, settings
- Delegate: read-only access to executions, propose edits
- Viewer: read-only access to results

---

### 9. Tool Repository

**Source:** https://docs.crewai.com/en/enterprise/guides/tool-repository.md

**Overview:** Package management for CrewAI tools; enables distribution (private or public).

**Prerequisites:** CrewAI AMP account, CrewAI CLI, uv 0.5.0+, Git, org permissions.

**Install & use:**
```bash
crewai tool install <tool-name>
```

```python
from your_tool.tool import YourTool
custom_tool = YourTool()
researcher = Agent(role='...', tools=[custom_tool], verbose=True)
```

**Publish:**
```bash
crewai tool create <tool-name>
crewai tool publish  # Private by default
crewai tool publish --public  # Public
```
Requires Git version control; automated security checks before availability.

**Version management:** Update code → increment version in pyproject.toml → commit → republish.

**Delete:** AMP dashboard (Tools > Select > Delete); permanent + irreversible.

**Important:** Use `crewai uv` for dependency mgmt (maintains auth with registry), not raw `uv`.

**Pertinence Daily Chief of Staff:** FAIBLE-MOYEN. For myswarms:
- Could package Gmail trigger logic as `email-classifier-tool` → share across projects
- Could publish `calendar-analyzer-tool` → reuse in other Daily AI apps
- Less relevant for v1 myswarms; more valuable if building tool ecosystem across multiple crews

---

### 10. Private Package Registry

**Source:** https://docs.crewai.com/en/enterprise/guides/private-package-registry.md

**Setup (3 steps):**

1. **Update pyproject.toml:**
   ```toml
   [project.dependencies]
   dependencies = ["crewai[tools]>=0.100.1,<1.0.0", "my-private-package>=1.2.0"]
   
   [[tool.uv.index]]
   name = "my-private-registry"
   url = "https://pkgs.dev.azure.com/my-org/_packaging/my-feed/pypi/simple/"
   explicit = true  # Prevents EVERY package query; security
   
   [tool.uv.sources]
   my-private-package = { index = "my-private-registry" }
   ```
   Then: `uv lock` + commit both files.

2. **Set auth credentials (env vars):**
   ```
   UV_INDEX_{UPPER_NAME}_USERNAME
   UV_INDEX_{UPPER_NAME}_PASSWORD
   ```
   Example for `my-private-registry`:
   - `UV_INDEX_MY_PRIVATE_REGISTRY_USERNAME`
   - `UV_INDEX_MY_PRIVATE_REGISTRY_PASSWORD`

3. **Provider-specific credentials:**
   | Provider | Username | Password |
   |----------|----------|----------|
   | Azure DevOps | Any string | Personal Access Token |
   | GitHub Packages | GitHub username | PAT with `read:packages` |
   | GitLab | `__token__` | Access Token |
   | AWS CodeArtifact | `aws` | CLI token |
   | Google Artifact Registry | `_json_key_base64` | Base64-encoded service key |
   | JFrog Artifactory | Username/email | API key |

4. **Configure in AMP:** Web interface → Environment Variables → Add credentials (never commit to VCS).

**Deployment:** AMP reads pyproject.toml + uv.lock → determines sources → retrieves env vars → downloads dependencies.

**Troubleshooting:** Check env var names match exactly (uppercase + underscore); verify credentials in AMP (not local .env); ensure tokens not expired; confirm index URL ends with `/simple/`; verify package exists in registry.

**Pertinence Daily Chief of Staff:** MOYEN. For myswarms:
- If storing custom utilities (email parser, calendar analyzer) en private GitHub Packages
- Set up UV_INDEX_GITHUB_PACKAGES_USERNAME/PASSWORD in Railway env vars
- Can share agents/tools across myswarms instances without publishing publicly

---

### 11. React Component Export

**Source:** https://docs.crewai.com/en/enterprise/guides/react-component-export.md

**Export process:** AMP crew detail → Ellipsis menu → Select export → Save .jsx locally.

**Setup:**
1. Install Node.js (LTS recommended)
2. Create React app: `npx create-react-app my-crew-app`
3. `npm install react-dom`
4. Add exported component (e.g., CrewLead.jsx) to src/

**Integration (App.js):**
```jsx
import React from 'react';
import CrewLead from './CrewLead';

function App() {
    return (
        <div className="App">
            <CrewLead baseUrl="YOUR_API_BASE_URL" bearerToken="YOUR_BEARER_TOKEN" />
        </div>
    );
}
```

**Customization:** Colors, titles, styling; consider state management, error handling, loading states for production.

**Pertinence Daily Chief of Staff:** FAIBLE. For myswarms:
- If adding web UI dashboard to visualize crew executions (executions table, results viewer)
- Export daily_planner crew as React component → embed in admin dashboard
- Useful for MVP v2 if expanding myswarms to web interface (currently CLI + email/Slack only)

---

### 12. Custom MCP Server

**Source:** https://docs.crewai.com/en/enterprise/guides/custom-mcp-server.md

**Overview:** Integrate any MCP (Model Context Protocol) server with CrewAI AMP; supports 3 auth methods.

**Prerequisites:** CrewAI AMP account + internet-accessible MCP server (Streamable HTTP transport).

**Setup (Tools & Integrations > Connections):**
1. "Add Custom MCP Server"
2. Provide: server name, optional description, complete endpoint URL
3. Choose auth method (see below)
4. Optional: add custom headers (tenant ID, routing)
5. Create connection

**Auth methods:**

**Public (no auth):**
- Select "No Authentication"

**Token-based:**
- HTTP header name (e.g., `X-API-Key`)
- Token value
- Placement (header or query param)
- For Bearer tokens: `Authorization: Bearer <token>`

**OAuth 2.0:**
- Register redirect URI with OAuth provider
- Supply authorization + token endpoints
- Client ID (+ secret if required)
- Optional scopes + token exchange method
- Enable PKCE if available

Supports OpenID Connect Discovery (auto-populate endpoints).

**Post-connection:** Tools available to crews based on visibility permissions. Remains editable/removable anytime.

**Pertinence Daily Chief of Staff:** MOYEN. For myswarms:
- Could create custom MCP server for:
  - **Internal CRM connector** (fetch user's deal pipeline from HubSpot/Salesforce via MCP)
  - **Project management bridge** (Jira/Asana task sync)
  - **Custom calendar analytics** (private calendar API)
- Token-based auth (Bearer token) simplest for Railway deployment
- Example: `CustomMCPServer` → OAuth to Google Workspace APIs → Chief's email + calendar + Drive accessible to all agents

---

### 13. Azure OpenAI Setup

**Source:** https://docs.crewai.com/en/enterprise/guides/azure-openai-setup.md

**Configuration (5 steps):**

1. **Azure AI Foundry prep:** Access Azure OpenAI deployment → Note "Target URI" + "Key"

2. **Env vars:**
   ```
   AZURE_DEPLOYMENT_TARGET_URL=https://your-deployment.openai.azure.com/openai/deployments/[model]/chat/completions?api-version=2024-08-01-preview
   AZURE_API_KEY=your_key_here
   ```

3. **AMP LLM Connection:** LLM Connections → New → Azure provider → Input vars → Save

4. **Set defaults:** Settings > Defaults > Crew Studio LLM Settings → Select Azure

5. **Network:** Azure OpenAI > Networking → "Allow access from all networks" (prevent blocks)

**Verification:** Create sample crew; if issues → verify URI format, API key, network permissions.

**Pertinence Daily Chief of Staff:** MODÉRÉ. For myswarms:
- If user's org standardizes on Azure OpenAI (HIPAA compliance, EU data residency, etc.)
- Configure AZURE_DEPLOYMENT_TARGET_URL + AZURE_API_KEY in Railway env vars
- All agents use Azure instead of OpenAI (Haiku 4.5 → Azure equivalent)
- Maintains compatibility with trigger workflows

---

### 14. Capture Telemetry & Logs

**Source:** https://docs.crewai.com/en/enterprise/guides/capture_telemetry_logs.md

**Overview:** Export traces + logs to own observability backend; OpenTelemetry-compatible collectors.

**Prerequisites:** CrewAI AMP account + OTLP-compatible collector (OTel Collector, Datadog, Grafana, OTLP backend).

**Setup (Settings > OpenTelemetry Collectors):**
1. "Add Collector"
2. Choose type: Traces or Logs
3. Configure:
   - **Endpoint:** OTLP collector URL
   - **Service Name:** Identifier for backend
   - **Custom Headers:** Auth/routing (optional)
   - **Certificate:** TLS cert for secured collectors (optional)
4. Save

**Data exported:** OpenTelemetry GenAI semantic conventions + CrewAI-specific attrs:
- Agent performance metrics
- LLM call tracking
- Debug info

**Capabilities:** Multiple collectors (separate traces/logs or different backends); flexible routing.

**Pertinence Daily Chief of Staff:** TRÈS IMPORTANT. For myswarms observability:
- Deploy OpenTelemetry Collector sidecar on Railway
- Configure `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in crew env
- Export traces → Datadog / Grafana / Honeycomb
- Monitor:
  - Crew execution duration (daily planner should complete < 2 sec)
  - Token usage per run (cost tracking)
  - Agent error rates (email classifier failing to parse?)
  - Webhook latency (HITL approval time)
- Set alerts: If morning planning crew takes > 5 sec, notify Chief

---

### 15. Vertex AI Workload Identity

**Source:** https://docs.crewai.com/en/enterprise/guides/vertex-ai-workload-identity-setup.md

**Overview:** GCP Workload Identity Federation for secure Vertex AI auth (no stored service account keys).

**Architecture:** At kickoff, crew fetches short-lived OIDC token scoped to org → exchanges for Google ADC credentials → runs within execution environment (credentials never persist in AMP control plane).

**Security:**
- Organization UUID restricts which CrewAI orgs access GCP workload pool
- Service account impersonation adds 2nd verification
- Credentials live only in execution environment
- Issuer URL: `https://app.crewai.com`

**Part 1: GCP setup (~6 steps):**

1. **Enable APIs:** `iam.googleapis.com`, `iamcredentials.googleapis.com`, `sts.googleapis.com`, `aiplatform.googleapis.com`

2. **Create Workload Identity Pool:** Global location, name `crewai-amp`

3. **Create OIDC Provider:** 
   ```
   attribute-condition: assertion.organization_id == 'YOUR_ORG_UUID'
   issuer: https://app.crewai.com
   ```

4. **Create Service Account:** `crewai-vertex` with role `roles/aiplatform.user`

5. **Configure impersonation binding:** Allow pool to impersonate service account; scope by org UUID via `principalSet`

6. **Required IAM roles (user executing gcloud):**
   - `roles/iam.workloadIdentityPoolAdmin`
   - `roles/iam.serviceAccountAdmin`
   - `roles/resourcemanager.projectIamAdmin`
   - `roles/serviceusage.serviceUsageAdmin`

**Part 2: CrewAI AMP config:**

1. **Create Workload Identity Config:** AMP Settings → Register GCP workload identity provider resource name + label (e.g., `vertex-ai-prod`)

2. **Attach to LLM Connection:** Vertex provider → attach config → specify service account email → set `GOOGLE_CLOUD_LOCATION=global`

3. **Bind to crew/deployment:** Attach LLM connection to crew

**Runtime:** System fetches OIDC token → writes temporary JWT + ADC config → sets `GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_CLOUD_PROJECT` → enables transparent STS exchange + service account impersonation.

**Critical:** Use `google/` model prefix (e.g., `google/gemini-2.5-pro`), NOT `vertex_ai/`; LiteLLM provider doesn't consume ADC workload identity requires.

**Token refresh:** Auto-refresh; long-running crews (< 1 hour kickoff refresh) supported. Exception: single Vertex API call > 1 hour may fail.

**Troubleshooting:**
| Issue | Solution |
|-------|----------|
| Missing Workload Identity UI | Contact CrewAI support |
| `PERMISSION_DENIED` from STS | Verify org UUID in attribute condition |
| Invalid JWT | Confirm issuer = `https://app.crewai.com` |
| `generateAccessToken` fails | Service account needs `roles/iam.workloadIdentityUser` |
| Vertex `PERMISSION_DENIED` | Service account needs `roles/aiplatform.user` |
| `DefaultCredentialsError` | Upgrade to `crewai>=1.14.3` |

**Pertinence Daily Chief of Staff:** TRÈS FAIBLE pour myswarms. Only relevant si:
- User's org deploys on GCP exclusively
- Vertex AI preferred over OpenAI/Anthropic
- Requires keyless workload identity (strict security)
- For most cases: OpenAI API key or Anthropic API key sufficient

---

## FAQ + Examples / Cookbooks

### Enterprise Resources: FAQ

**Source:** https://docs.crewai.com/en/enterprise/resources/frequently-asked-questions.md

**Process Management:**

**Q: Hierarchical vs sequential processes?**
- Hierarchical: Manager agent coordinates → dynamic task allocation per agent capabilities → better for complex projects
- Sequential: Predefined order → simpler workflows

**Q: How do manager agents work in hierarchical processes?**
- Automatically created + configures itself correctly
- Must configure manager LLM properly

**Configuration & Customization:**

**Q: Agent behavior customization options?**
- LLM selection, verbose logging, RPM rate limits, max iteration counts, delegation, human input integration

**Q: RPM rate limits?**
- Prevent too many external service requests → avoid rate limit breaches

**Memory:**

**Q: Memory benefits?**
- Adaptive learning, enhanced personalization (retain preferences), improved problem-solving (access past learnings + context)

**Q: Memory types?**
- Short-term (immediate context), Long-term (persistent patterns), Entity (specific attributes), Contextual (cross-interaction)

**Human Integration:**

**Q: When is human input valuable?**
- Ambiguous scenarios, complex decisions, output validation, behavior customization, resolving capability gaps

**Structured Outputs:**

**Q: Output Pydantic implementation?**
- Define Pydantic model → assign to task's `expected_output` → optionally set agent's `output_pydantic`

**Pertinence Daily Chief of Staff:** MOYEN. Key FAQs applicable:
- Memory: Crew remembers previous emails/tasks → improves email classification over time
- Human integration: HITL for approvals essential
- Output Pydantic: Task outputs should be structured (JSON task objects) for HITL serialization

---

### Examples & Cookbooks

**Source:** https://docs.crewai.com/en/examples/cookbooks.md

**Featured Quickstarts:**

1. **Collaboration** — Multi-agent coordination on shared tasks
   - Notebook: https://github.com/crewAIInc/crewAI-quickstarts/blob/main/Collaboration/crewai_collaboration.ipynb
   - Pattern: Email classifier + task creator + planner agents collaborate

2. **Planning** — Multi-step reasoning before execution (planning toolkit)
   - Notebook: https://github.com/crewAIInc/crewAI-quickstarts/blob/main/Planning/crewai_planning.ipynb
   - Pattern: Crew plans daily agenda → validates calendar conflicts → breaks down into sub-tasks

3. **Reasoning** — Self-reflection loops, critique prompts, structured thinking
   - Notebook: https://github.com/crewAIInc/crewAI-quickstarts/blob/main/Reasoning/crewai_reasoning.ipynb
   - Pattern: Agent drafts response → self-critique → refine → submit to HITL

4. **Structured Guardrails** — Task-level guardrails, retries, validation, safe fallbacks
   - Notebook: https://github.com/crewAIInc/crewAI-quickstarts/blob/main/Guardrails/task_guardrails.ipynb
   - Pattern: Email parser must validate sender domain; if invalid → retry or fallback to manual review

5. **Gemini Search & Grounding** — Gemini + search grounding for fact-rich outputs
   - Notebook: https://github.com/crewAIInc/crewAI-quickstarts/blob/main/Custom%20LLM/gemini_search_grounding_crewai.ipynb
   - Pattern: Research agent uses Gemini + search → cites sources in daily briefing

6. **Gemini Video Summaries** — Multimodal LLM + video processing
   - Notebook: https://github.com/crewAIInc/crewAI-quickstarts/blob/main/Custom%20LLM/summarize_video_gemini_crewai.ipynb
   - Pattern: Team uploads meeting recording → crew summarizes + extracts action items

All: https://github.com/crewAIInc/crewAI-quickstarts

---

### Examples: Full Projects

**Source:** https://docs.crewai.com/en/examples/example.md

**Crews (Multi-agent Systems):**

| Project | Demonstrates |
|---------|--------------|
| **Marketing Strategy** | Collaborative agent workflows for business strategy |
| **Surprise Trip** | Agent coordination for personalized recommendations |
| **Match Profile to Positions** | Vector DB integration + agent workflows |
| **Job Posting** | Automated content generation via agents |
| **Game Builder Crew** | Complex agent collaboration for software development |
| **Recruitment** | Multi-stage evaluation with agents |

**Flows (Sequential/Parallel Workflows):**

| Project | Demonstrates |
|---------|--------------|
| **Content Creator Flow** | Multi-crew routing + dynamic crew selection |
| **Email Auto Responder** | Real-time automation + decision-making |
| **Lead Score Flow** | Human-in-the-loop qualification |
| **Meeting Assistant Flow** | Third-party service integration |
| **Self Evaluation Loop** | Recursive refinement + QA |
| **Write a Book (Flows)** | Parallel chapter generation |

**Integrations:**
- CrewAI ↔ LangGraph
- Azure OpenAI
- NVIDIA Models

**All:** https://github.com/crewAIInc/crewAI-examples

**Pertinence Daily Chief of Staff:** ÉLEVÉ. Particularly applicable:
- **Email Auto Responder Flow:** Direct analogue to myswarms email classifier + draft responder
- **Lead Score Flow:** HITL qualification pattern (human review before send)
- **Meeting Assistant Flow:** Calendar event analysis + note extraction
- **Content Creator Flow:** Multi-crew routing (morning planning crew vs evening summary crew)

---

## Synthèse : Enterprise Guides pour Daily Chief of Staff

### Architecture Trigger Précise pour myswarms

**Déclenchements:**

1. **Morning (06:00 UTC):** Webhook cron → Kickoff `daily_planner` crew
   - Input: current_date, user_email, past_tasks (from Supabase)
   - Actions: Fetch calendar events (Google Calendar API) → List pending emails (Gmail API) → Analyze priority → Generate daily agenda
   - Output: 3-5 key focus areas, calendar blocks, email batches
   - Webhook callback → Email Chief the daily plan
   - HITL: Chief approves agenda → crew blocks calendar + sends confirmation

2. **On Email Received (Gmail Trigger):** Immediately
   - Trigger payload: sender, subject, body, labels
   - Crew: `email_classifier` agent
   - Actions: Parse email → Extract action items → Classify urgency (CRITICAL/HIGH/MEDIUM/LOW) → Propose task
   - Output: JSON task object (title, deadline, assigned_to, notes)
   - Webhook callback → Notify Chief via email with task summary
   - HITL: Chief approves/modifies/rejects → Store in Supabase task table

3. **On Calendar Event Changed (Google Calendar Trigger):** Immediately
   - Trigger payload: event start/end, attendees, title, changes
   - Crew: `calendar_monitor` agent
   - Actions: Detect blocked focus time → Analyze attendee conflicts → Suggest reschedules
   - Output: Alerts (if 2+ conflicts or < 30 min buffer) + proposed solutions
   - Webhook callback → Slack message to Chief: "Meeting overlap detected; suggest reschedule [link]"
   - HITL: Chief clicks resolve → crew updates calendar

4. **Evening (17:00 UTC):** Webhook cron → Kickoff `daily_summary` crew
   - Input: current_date, completed_tasks, unfinished_tasks, new_emails_count
   - Actions: Summarize completed work → List unfinished items → Extract patterns (what took longer than expected?)
   - Output: Evening report (accomplishments, next-day carry-overs, insights)
   - Webhook callback → Email summary to Chief
   - No HITL (informational only)

5. **Slack Manual Trigger:** `/kickoff` command
   - User posts in Slack → 3-dot menu → "Push to Zapier"
   - Zapier kickoffs `slack_responder` crew
   - Actions: Parse message → Generate response draft
   - Output: HTML-formatted reply
   - Zapier sends email to Chief with draft
   - HITL: Chief approves → Zapier posts to Slack

### 5 Actions Concrètes à Réutiliser des Cookbooks

1. **Collaboration Pattern (Cookbook #1):** 
   - Implement `email_classifier` (role: classify) → `task_creator` (role: extract actionable items) → `planner` (role: prioritize) agents working together on email payload. They debate urgency + routing.

2. **Planning Pattern (Cookbook #2):**
   - Daily planner crew uses planning toolkit to reason about calendar constraints before committing blocks. Outputs structured daily plan (time blocks, focus areas, buffer).

3. **Reasoning Pattern (Cookbook #3):**
   - Email responder drafts Slack reply → self-critique agent evaluates tone + accuracy → refine loop before HITL.

4. **Structured Guardrails (Cookbook #4):**
   - Email classifier must parse sender + subject; if parser fails → retry with fallback (mark as "needs manual review" instead of crashing).

5. **Lead Score Flow Pattern (Cookbook → HITL analogue):**
   - Directly reuse HITL webhook pattern: crew generates output → webhook notifies human → human submits approval → crew resumes with feedback injected into context.

### Intégration Webhook Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Scheduler (Railway Cron)                │
│   06:00 daily_planner  |  17:00 daily_summary                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│                  Crew Kickoff (Railway API)                  │
│  POST /crew/kickoff { inputs, crewWebhookUrl, ... }         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│              CrewAI Crew Execution (AMP or Local)            │
│  - Agent execution  - Tool calls  - LLM reasoning            │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│              Webhook Callback (Railway Handler)              │
│  POST /api/crew-result { kickoff_id, output, ... }          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│   HITL Decision (Email / Slack / UI Dashboard)               │
│   Chief reviews crew output → approve / reject / modify      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│            Resume API Call (Resume Crew Execution)           │
│  POST /crew/resume { execution_id, feedback, ... }          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────┐
│   Crew Resumes → Action Execution (Calendar, Email, Slack)  │
│   - Send calendar invites  - Post Slack message  - etc.      │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Strategy (Railway)

**Environment Variables (Railway Secrets):**
```
CREWAI_API_KEY=<CrewAI AMP or local auth>
GMAIL_CREDENTIALS_JSON=<base64 OAuth2 creds>
GOOGLE_CALENDAR_CREDENTIALS_JSON=<>
SLACK_BOT_TOKEN=<>
OPENAI_API_KEY=<> or ANTHROPIC_API_KEY=<>
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
DATABASE_URL=<Supabase PostgreSQL>
WEBHOOK_BASE_URL=https://myswarms.railway.app
```

**Triggers Enabled:**
- Gmail: `gmail/new_email_received` → crew kickoff automatic
- Google Calendar: `google_calendar/event_changed` → crew kickoff automatic
- Webhook: Manual POST from Slack via Zapier / external schedulers
- Cron: Railway internal scheduler for 06:00 + 17:00 triggers (or n8n/Inngest external)

**HITL Webhook Endpoints:**
- `POST /api/crew-result` — Receive crew output, store in Supabase, send email/Slack notification, generate approval link
- `GET /api/resume-crew?execution_id=X&feedback=approve` — Resume crew with approval, execute final actions

**Monitoring:**
- OpenTelemetry traces → Datadog/Grafana
- Alerts: crew execution > 10 sec, HITL approval timeout > 1 hour, email classifier error rate > 5%

### Next Steps

1. **Fetch CrewAI cookbook notebooks** (Planning, Reasoning, Collaboration patterns)
2. **Implement crew.py** with email_classifier, calendar_monitor, daily_planner agents
3. **Deploy webhook handlers** (Railway Edge Functions receiving crew results + HITL decisions)
4. **Configure triggers** (Gmail + Google Calendar in myswarms crew config)
5. **Set up telemetry** (OTEL traces to Datadog for performance monitoring)
6. **Test HITL flow** locally with `crewai triggers run gmail/new_email_received`
7. **Deploy to Railway** with CI/CD (GitHub Actions → push to main → Railway rebuild)

---

**Fin du LOT 8 Ingestion. Prêt pour implémentation architecture complète Daily Chief of Staff.**
