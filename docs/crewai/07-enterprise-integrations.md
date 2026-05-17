# 07 — Enterprise : Features + Integrations

CrewAI Enterprise propose un écosystème complet de features avancées et d'intégrations natives qui transforment les équipes en superviseurs plutôt qu'opérateurs. Ce LOT 7 couvre les garde-fous de production (Hallucination Guardrail, PII Redaction), le contrôle qualité humain (Flow HITL Management), l'observabilité (Webhook Streaming, Traces), et 30+ intégrations de communication, productivité et business — avec focus sur celles critiques pour Daily Chief of Staff.

---

## Features Enterprise

### Hallucination Guardrail

**Source** : https://docs.crewai.com/en/enterprise/features/hallucination-guardrail.md

**À quoi ça sert** : Valide les outputs d'IA contre du contexte fourni pour détecter et rejeter les hallucinations (contenu factuellement incorrect ou non supporté par les sources).

**Activation** : Importer `HallucinationGuardrail` depuis `crewai.tasks.hallucination_guardrail`, configurer avec un LLM evaluator et ajouter au paramètre `guardrail` d'une Task.

```python
from crewai.tasks.hallucination_guardrail import HallucinationGuardrail
from crewai import LLM

guardrail = HallucinationGuardrail(
    context="Référence factuelle à valider",
    llm=LLM(model="gpt-4o-mini"),
    threshold=8.0  # Score 0-10
)

task = Task(
    description="Synthesize email summaries",
    agent=agent,
    guardrail=guardrail
)
```

**Configuration** : Contexte de référence (obligatoire), seuil de confiance (0-10), contexte des réponses d'outils (optionnel). Retourne `{valid: bool, feedback: str}`.

**Pertinence Daily Chief of Staff** : **OUI CRITIQUE**. Traitement d'emails réels d'Adrien, synthèses de calendrier, propositions d'actions. Sans guardrail, hallucinations sur les faits client/projet → décisions fausses. Utiliser threshold 7-8 pour contenu user-facing.

**Prix** : Inclus plan Enterprise.

---

### PII Redaction for Traces

**Source** : https://docs.crewai.com/en/enterprise/features/pii-trace-redactions.md

**À quoi ça sert** : Détecte et masque automatiquement les données PII (emails, SSN, CC, addresses, noms) dans les traces d'exécution pour compliance GDPR/HIPAA/PCI-DSS.

**Activation** : Dashboard CrewAI AMP → Deployment Settings → PII Protection → Toggle on. Configurer entity types (PERSON, EMAIL_ADDRESS, CREDIT_CARD, PHONE_NUMBER, US_SSN, IP_ADDRESS, etc.) + custom recognizers (regex ou deny-list).

**Configuration** : 
- Entités globales : CREDIT_CARD, CRYPTO, DATE_TIME, EMAIL_ADDRESS, IBAN_CODE, IP_ADDRESS, LOCATION, PERSON, PHONE_NUMBER, URL
- Entités US : US_SSN, US_DRIVER_LICENSE, US_PASSPORT
- Actions : `mask` (remplace par `<ENTITY_TYPE>`) ou `redact` (supprime)
- Custom recognizers : Regex patterns ou deny-lists avec confiance threshold

**Pertinence Daily Chief of Staff** : **OUI CRITIQUE**. Adrien gère emails personnels/professionnels, identifiants slack de collègues, URLs sensibles, infos de réunion. PII Redaction = compliance automatique + audit trail clean. Enable by default en production.

**Prix** : Plan Enterprise, version 1.8.0+.

---

### Flow HITL Management

**Source** : https://docs.crewai.com/en/enterprise/features/flow-hitl-management.md

**À quoi ça sert** : Human-in-the-Loop natif pour Flows (pas Crews) — pause exécution à checkpoint, notifie par email, attend réponse humaine, reprend. Email-first : responders cliquent boutons ou répondent par email — zéro account management.

**Activation** : Décorateur `@human_feedback` sur méthode Flow.

```python
from crewai.flow.human_feedback import human_feedback, HumanFeedbackResult

@human_feedback(
    message="Approuver l'envoi de ce mail ?",
    emit=["approved", "rejected", "needs_revision"],
)
@listen("generate_email_draft")
def review_email(self):
    return self.state.draft_email
```

**Configuration** :
- Email Notifications (enabled par défaut)
- SLA Target (minutes) pour tracking
- Routing Rules : matcher patterns (`approve_*`, `review_?`) → assigner à email ou variable flow (`assign_from_input`)
- Auto-Response : timeout + default outcome
- Webhooks : POST à URL avec payload HITL + callback signing HMAC-SHA256

**Dashboard** : Markdown rendering, context panel, feedback input, quick action buttons. Audit Trail complet — who, when, how, response time vs SLA.

**Pertinence Daily Chief of Staff** : **OUI CENTRAL**. Brouillons emails → validation Adrien avant action (N4 sécurité). Flow HITL = email-first review → no friction. Routing dynamic : `adrien_telegram` du context. Auto-response timeout : 2h → continue avec default outcome (queue pour le soir). Webhooks → integration Telegram bot perso.

**Prix** : Plan Enterprise, version 1.8.0+.

---

### Webhook Streaming

**Source** : https://docs.crewai.com/en/enterprise/features/webhook-streaming.md

**À quoi ça sert** : Real-time event streaming à webhook custom pendant exécution crew/flow. Chaque event (llm_call_started, tool_usage_finished, agent_execution_completed, flow_started, etc.) = POST au endpoint.

**Activation** : Via Kickoff API, inclure `webhooks` object avec events array, URL, et authentication.

**Événements supportés** : Flow (started, finished, method execution), Agent (started/completed/error), Crew (kickoff, train, test), Task, Tool, LLM (call, stream, guardrail), Memory, Knowledge, Reasoning.

**Format webhook** : Payload `{events: [{id, execution_id, timestamp, type, data}]}`. Order not guaranteed → use timestamp.

**Pertinence Daily Chief of Staff** : OUI — Observabilité temps-réel. Webhook → logs Supabase (`crew_run_steps`), monitorer llm_call_started pour coûts real-time, agent_execution_error pour alertes Telegram.

**Prix** : Plan Enterprise.

---

### Autres Features Enterprise (Notes courtes)

- **A2A (Agent-to-Agent)** : agents communiquant entre crews. Daily Chief of Staff V2+ (multi-agent specialized).
- **Agent Repositories** : templates réutilisables. À évaluer pour partager les 8 agents Chief.
- **Automations** : pas seulement Flow trigger, mais workflow CrewAI AMP. À évaluer.
- **Crew Studio** : no-code Flow builder. NON pour MVP (dev = code).
- **Marketplace** : partage crews communautaire. NON pour MVP.
- **RBAC** : multi-user. NON pour MVP solo Adrien.
- **SSO** : single sign-on. NON pour MVP.
- **Tools & Integrations Console** : UI pour gérer Composio-like depuis CrewAI AMP.
- **Traces** : tracing UI CrewAI AMP. Alternative à Langfuse (mais on garde Langfuse).

---

## Integrations Enterprise — Communication

### Gmail Integration

**Source** : https://docs.crewai.com/en/enterprise/integrations/gmail.md

**Auth** : OAuth2 Gmail (mail.read, mail.send, contacts.read). Token via CrewAI AMP Integrations console.

**Actions** : `fetch_emails` (q, maxResults, labelIds), `send_email` (to, subject, body, cc, bcc, replyTo, threadId), `delete_email`, `create_draft`, `get_message`, `get_attachment`, `fetch_thread`, `modify_thread` (add/removeLabelIds), `trash_thread`, `untrash_thread`.

**Setup** :
```python
gmail_agent = Agent(
    role="Email Manager",
    apps=['gmail']  # or ['gmail/fetch_emails', 'gmail/send_email']
)
```

**Limites** : Standard Gmail API (15M requests/day/user). Max 100 emails fetch défaut, 500 max.

**Pertinence Daily Chief of Staff** : **CRITIQUE**. Core use case : parse unread emails, summarize, create draft responses. Foundation MVP V1.

---

### Slack Integration

**Source** : https://docs.crewai.com/en/enterprise/integrations/slack.md

**Auth** : OAuth2 Slack (channels:read, chat:write, users:read, search:read).

**Actions** : `list_members`, `get_user_by_email`, `get_users_by_name`, `list_channels`, `send_message` (channel, message, botName, botIcon, blocks), `send_direct_message`, `search_messages`.

**Block Kit support** : Rich JSON formatting — sections, dividers, buttons, attachments.

**Pertinence Daily Chief of Staff** : **CRITIQUE**. Read team channels, send DMs. Block Kit utile pour notification riche.

---

### Microsoft Outlook Integration

**Source** : https://docs.crewai.com/en/enterprise/integrations/microsoft_outlook.md

**Auth** : OAuth2 Microsoft Graph (Mail.Read, Mail.Send, Calendars.ReadWrite, Contacts.ReadWrite).

**Actions** : `get_messages`, `send_email`, `get_calendar_events`, `create_calendar_event`, `get_contacts`, `create_contact`, `reply_to_email`, `forward_email`, `mark_message_read`, `update_event`, `delete_event`.

**Pertinence Daily Chief of Staff (Outlook V2)** : **CRITIQUE pour users Microsoft 365**. Alternative à Gmail. Si Adrien utilise Outlook → switch ici.

---

### Google Calendar Integration

**Source** : https://docs.crewai.com/en/enterprise/integrations/google_calendar.md

**Auth** : OAuth2 Google Calendar.

**Actions** : `get_availability` (timeMin, timeMax, items), `create_event` (summary, start_dateTime, end_dateTime, attendees, conferenceData), `view_events`, `update_event`, `delete_event`, `view_calendar_list`.

**Format RFC3339** : ISO 8601 avec timezone.

**Pertinence Daily Chief of Staff** : **CRITIQUE**. Scheduler AI = check availability, create meetings.

---

### Microsoft Teams Integration

**Source** : https://docs.crewai.com/en/enterprise/integrations/microsoft_teams.md

**Pertinence Daily Chief of Staff** : OUI si Adrien uses Teams. Backup notification channel.

---

## Integrations Enterprise — Productivity

### Google Workspace (Docs, Sheets, Drive, Contacts, Slides)

**Sources** :
- /enterprise/integrations/google_docs
- /enterprise/integrations/google_sheets
- /enterprise/integrations/google_drive
- /enterprise/integrations/google_contacts
- /enterprise/integrations/google_slides

**Pertinence Daily Chief of Staff** : OUI. Write daily summaries → Docs. Log meetings → Sheets. Drive = file organization. Contacts = VIP enrichment.

---

### Notion Integration

**Source** : https://docs.crewai.com/en/enterprise/integrations/notion.md

**Auth** : OAuth2 Notion.

**Actions** : `list_users` (pagination), `get_user`, `create_comment` (parent page/discussion, rich_text).

**Limitations** : Only user listing + comments. No DB queries, no page creation. Lightweight integration.

**Pertinence Daily Chief of Staff** : MÉDIA. Si Adrien utilise Notion, peut lister users + créer comments. **Pour CRUD pages complet : Composio Notion préférable** (richer support).

---

### ClickUp, Linear, Asana, Jira

**Sources** : `/enterprise/integrations/clickup`, `linear`, `asana`, `jira`

**Pertinence Daily Chief of Staff** : MÉDIA. Si team tracking dans ces outils, AI peut sync actions (créer tickets, update statuses). Optional MVP.

---

## Integrations Enterprise — Business

### HubSpot Integration

**Source** : https://docs.crewai.com/en/enterprise/integrations/hubspot.md

**Auth** : OAuth2 HubSpot.

**Actions** : `create_company` (60+ fields), `create_contact` (email required + 50+ fields), `create_deal`, `create_record_engagements` (NOTE, EMAIL, CALL, MEETING, TASK).

**Pertinence Daily Chief of Staff** : OUI si Adrien manages CRM. Auto-log interactions post-meeting.

---

### Salesforce Integration

**Source** : https://docs.crewai.com/en/enterprise/integrations/salesforce.md

**Auth** : OAuth2 Salesforce.

**Actions** : Create/update Contact, Lead, Opportunity, Account, Task. SOQL queries for data search.

**Pertinence Daily Chief of Staff** : OUI si Adrien uses Salesforce.

---

### Stripe Integration

**Source** : https://docs.crewai.com/en/enterprise/integrations/stripe.md

**Actions** : Customer management, Subscriptions, Products, Balance transactions, Plans.

**Pertinence Daily Chief of Staff** : OUI si Adrien manages billing.

---

### Shopify, Zendesk, GitHub, Box, OneDrive, SharePoint, Microsoft Word, Microsoft Excel

**Quick notes** : E-commerce, Support tickets, Repo + PRs, File storage, Document editing.

**Pertinence Daily Chief of Staff** : Conditional. Integrate only if workflow touches these tools.

---

## Synthèse Enterprise pour Daily Chief of Staff

### Décision : Composio vs. CrewAI Natives

| Intégration | CrewAI Native | Composio | Daily Chief of Staff |
|---|---|---|---|
| **Gmail** | ✓ (11 actions) | ✓ (richer) | CRITICAL |
| **Slack** | ✓ (6 actions) | ✓ | CRITICAL |
| **Google Calendar** | ✓ (7 actions) | ✓ | CRITICAL |
| **Microsoft Outlook** | ✓ (13 actions) | ✓ | CRITICAL if Outlook |
| **Telegram Bot** | ✗ (pas listé) | ✓ | CRITICAL (notifications matin/soir) |
| **Google Workspace** | ✓ | ✓ | MEDIA |
| **Notion** | ✓ (lightweight) | ✓ (rich) | MEDIA |
| **HubSpot** | ✓ (CRUD) | ✓ | MEDIA |
| **Salesforce** | ✓ (CRUD+SOQL) | ✓ | LOW |

### Recommandation MVP

**Composio** = backbone car :
- Couvre Telegram (CrewAI native ne mentionne pas dans la liste — ou intégration limitée)
- 1 seule auth (`COMPOSIO_API_KEY`) vs OAuth multiple
- Actions plus riches pour Notion (DB queries, page CRUD)
- Multi-tenant ready (entity_id)

**CrewAI Enterprise Integrations** = à utiliser si on opte pour le déploiement sur CrewAI AMP (Phase 2). Sinon, redondant avec Composio.

### Enterprise Features à activer EN PRODUCTION

- ✓ **Hallucination Guardrail** (threshold 7-8) : Must-have pour summaries emails
- ✓ **PII Redaction** : Compliance automatique
- ✓ **Flow HITL Management** : Central pour validation brouillons (N4 sécurité)
- ✓ **Webhook Streaming** : Real-time observability

### À déférer (V2+)

- RBAC / SSO : Solo Adrien donc pas urgent
- Crew Studio, Marketplace, Agent Repositories : Outils orga
- A2A : Multi-agent complex inter-crew

### Architecture deployment : Single Microservice ou CrewAI AMP ?

**Option A (recommandée pour MVP) — Microservice Python autohébergé sur Railway**
- Pas de dépendance CrewAI AMP (libre, contrôle total)
- Composio pour intégrations (Gmail/Slack/Telegram/Calendar/Notion)
- Langfuse pour observability
- Coût : ~$50 Railway + ~$50 Composio + ~$30 Langfuse = ~$130/mois + LLM
- Limitation : pas de Flow HITL natif → on l'implémente custom via Telegram bot

**Option B — CrewAI AMP**
- Plan ~$500-2000/mois (teams, features, webhooks included)
- Hallucination Guardrail + PII Redaction + Flow HITL natifs
- Intégrations CrewAI Enterprise (mais qui dupliquent Composio)
- Uptime SLA 99.9%
- Vendor lock-in

**Décision retenue** : Option A pour MVP. Considérer migration partielle vers Option B si Flow HITL devient bloquant (V2 maybe).

### Setup Checklist Option A (Microservice perso)

- [ ] Composio session : Gmail + Slack + Telegram + Calendar + Notion (entity_id "adrien")
- [ ] Langfuse keys dans .env.local
- [ ] `CREWAI_DISABLE_TELEMETRY=true`
- [ ] Implement custom Hallucination Guardrail via Task `guardrail` param
- [ ] Implement custom PII Redaction via tool hooks (`@before_tool_call` / `@after_tool_call`)
- [ ] Implement HitL custom via Telegram bot : draft → Telegram message avec buttons → webhook → resume
- [ ] APScheduler AM 08:00 + PM 18:30 + intraday triggers

### Coût estimé MVP

- Composio executive tier : ~$50/mois
- Langfuse cloud : ~$0 (free tier 100k events/mois)
- Railway microservice : ~$20-50/mois
- LLM Anthropic (Claude) : ~$30-100/mois selon volume
- **Total** : ~$100-200/mois pour le moteur complet

### ROI

Heures sauvées par semaine pour Adrien sur email triage / calendrier / synthèses → "Chief of Staff in pocket" value justifies investment. Estimation : 5-15h/semaine = $1000-3000/mois équivalent → ROI 10-30x.
