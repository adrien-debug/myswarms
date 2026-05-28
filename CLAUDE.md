# MySwarms — hive-engine standalone

> Stack : **backend Python multi-services** (FastAPI + CrewAI + HEDGE trading). Front Next.js archivé le 27 mai 2026 (commit `75f747f chore(decommission): archive front Next.js → hive-engine standalone`). Le front vit désormais dans `~/Dev/Hearst Corporation/hive-front-swarms`.

## Langue & mode
- Toutes les réponses en **français**.
- Mode **autonomie totale** : tu exécutes, tu ne demandes pas confirmation pour chaque étape.

## Stack

- **Backend** : Python 3.12 + uv · FastAPI + uvicorn · crewai >= 1.14.4 · langfuse v3 · supabase-py
- **DB** : Supabase Postgres 17 — projet ref `fxeibmjebvxtoazuyyvz` · 38 tables · RLS ON partout
- **Cache/Queue** : Upstash Redis REST (Railway Redis non provisionné)
- **Hosting** : Railway (`693c476c-3d0c-4213-8088-63018863fa5d`) + GPU2 (docker-compose.gpu2.yml port 8010)

## Microservices Python (6 services + 1 module config)

| Service | Port local | Rôle |
|---|---|---|
| `crewai-engine` | 8000 (local) / 8010 (GPU2) | Orchestration CrewAI — Chief of Staff + swarms dynamiques |
| `risk-engine` | 8001 | Décisions risk HEDGE déterministes (aucun LLM) |
| `execution-engine` | 8002 | Dispatcher d'ordres HEDGE (dry_run par défaut) |
| `strategy-builder` | 8003 | Construction stratégies HEDGE via LLM fusion (Kimi K2.6) |
| `market-data-service` | 8004 | Ingestion market data (snapshots, orderbook, events) |
| `swarm-orchestrator` | 8005 | Routage swarms — 4 agents parallèles (technical, sentiment, macro, onchain) |

`services/observability/` : config Prometheus/alerting HEDGE (`hedge_rules.yml`, `prometheus.yml`) — **pas un service Python runnable**.

## Communication front ↔ backend

Le front `hive-front-swarms` (port 3333, hors ce repo) appelle ce backend via HTTP/Bearer :

- URL dev : `CREWAI_ENGINE_URL=http://localhost:8000`
- URL prod : `CREWAI_ENGINE_URL_PROD=https://crewai-engine-myswarms.up.railway.app`
- Auth : bearer token `CREWAI_ENGINE_AUTH_TOKEN` (même valeur des deux côtés, généré via `openssl rand -hex 32`)
- Endpoints : `POST /v1/crews/chief-of-staff/kickoff`, `GET /v1/crews/chief-of-staff/status/{uuid}`, `GET /health`
- Résolution slug→UUID : le status endpoint accepte aussi bien un UUID qu'un slug (résout en interne avant scoping).

## ⚡ MCP Supabase — règle absolue

Tu as accès au **MCP Supabase** dans cette session. Pour TOUTE opération DB, tu utilises le MCP **sans jamais demander confirmation à Adrien** :

| Opération | Tool MCP | Quand |
|---|---|---|
| Lister projets / orgs | `mcp__supabase__list_projects` / `list_organizations` | Au début si tu doutes |
| Lister tables | `mcp__supabase__list_tables` | Avant tout schema change |
| **Appliquer migration SQL** | `mcp__supabase__apply_migration` | À chaque DDL (create table, alter, etc.) |
| Exécuter une query | `mcp__supabase__execute_sql` | Lectures / data fixes |
| Générer types TS | `mcp__supabase__generate_typescript_types` | Après chaque migration |
| Logs en cas de bug | `mcp__supabase__get_logs` | Debug |
| Advisors (sécurité/perf) | `mcp__supabase__get_advisors` | Avant prod |

**Règles** :
- Tu N'utilises JAMAIS `supabase db push` (interactif, risque de prompt).
- Tu utilises **toujours** `mcp__supabase__apply_migration` avec le nom de migration en `snake_case`.
- Tu versionnes en parallèle dans [supabase/migrations/NNNN_nom.sql](supabase/migrations/) pour le repo.
- Si une migration a échoué, tu lis `mcp__supabase__get_logs(service="postgres")` et tu corriges, **sans demander**.

`project_id = fxeibmjebvxtoazuyyvz` — passe-le systématiquement aux tools MCP.

Dashboard : https://app.supabase.com/project/fxeibmjebvxtoazuyyvz

## 🖥️ Infra GPU (gpu1 + gpu2)

Adrien dispose de 2 serveurs GPU + 1 Windows farm accessibles via Tailscale et LAN.

| Serveur | LAN | Tailscale | Aliases SSH | Services exposés |
|---|---|---|---|---|
| **GPU1** | `192.168.1.200` | `100.88.191.49` | `gpu1`, `gpu1-ts`, `ubuntu-comput3` | (workhorse secondaire) |
| **GPU2** | `192.168.1.150` | `100.110.74.114` | `gpu2`, `gpu2-remote` | ComfyUI :8188 · InvokeAI :9090 · crewai-engine :8010 |
| **Windows farm** | `192.168.1.14` | — | `windows-farm`, `farm-pc` | Windows-only tasks |

### Pattern de connexion pour ce projet

```bash
ssh -L 8188:localhost:8188 gpu2-remote -N &  # ComfyUI
ssh -L 9090:localhost:9090 gpu2-remote -N &  # InvokeAI
```

Variables d'env attendues (déjà dans `.env.local`) :
```
COMFY_BASE=http://127.0.0.1:8188
STUDIO_INVOKE_BACKEND=http://127.0.0.1:9090
STUDIO_SSH_HOST=gpu2-remote
```

**Note GPU2** : le `crewai-engine` est déployable sur GPU2 via `services/crewai-engine/docker-compose.gpu2.yml` (port 8010, `network_mode: host`).

Doc complète : [docs/api-config/SERVICES.md](docs/api-config/SERVICES.md) section 11b.

## 🤖 Stack LLM — règle absolue

MySwarms utilise **Hypercli (Kimi K2.6) comme unique provider LLM** pour le chat, l'orchestration et les agents. Tout agent LLM DOIT utiliser ces credentials.

| Provider | Variable env | Usage | SDK |
|---|---|---|---|
| **Hypercli (Kimi K2.6)** | `HYPERCLI_API_KEY` + `HYPERCLI_BASE_URL` + `HYPERCLI_DEFAULT_MODEL` | **Unique provider LLM** — chat, orchestration, agents, embeddings | `openai` (endpoint OpenAI-compatible) |

> `ANTHROPIC_API_KEY` et `OPENAI_API_KEY` peuvent rester vides. Les SDK Anthropic et OpenAI ne sont **pas utilisés** pour le chat ou les agents dans ce projet.

### Variables d'environnement

```
HYPERCLI_API_KEY=<secret>
HYPERCLI_BASE_URL=https://api.hypercli.com/v1
HYPERCLI_DEFAULT_MODEL=kimi-k2.6
```

### Côté moteur CrewAI Python — litellm via crewai.LLM

```python
# services/crewai-engine/src/
import os
from crewai import LLM

llm = LLM(
    model="openai/kimi-k2.6",          # préfixe openai/ car endpoint OpenAI-compatible (litellm)
    base_url=os.getenv("HYPERCLI_BASE_URL"),
    api_key=os.getenv("HYPERCLI_API_KEY"),
)
```

### Embeddings

Embeddings via Hypercli modèle `qwen3-embedding-4b` (endpoint OpenAI-compatible, champ `model`). Ne pas réintroduire OpenAI par défaut.

### Modèles Hypercli disponibles

`kimi-k2.6` · `kimi-k2.6-anthropic` · `kimi-k2.5` · `kimi-k2.5-anthropic` · `glm-5` · `minimax-m2.5` · `qwen3-embedding-4b`

### Règles strictes

- **JAMAIS** hardcoder une clé API dans le code — toujours `pydantic_settings` BaseSettings + `os.getenv()`.
- **JAMAIS** appeler un provider non listé sans validation explicite d'Adrien.
- Tracer chaque run LLM (model, tokens, latency, cost) dans Langfuse via les vars `LANGFUSE_*`.

## HEDGE — trading append-only

Périmètre HEDGE ajouté pour le trading algorithmique. Règles non négociables :

- **Append-only** : les tables `hedge_*` ne sont jamais UPDATE/DELETE — insert seul autorisé (RLS enforced).
- **No-trade-by-default** : `execution-engine` démarre en `dry_run=true` ; le mode live requiert flag explicite + HMAC validé.
- **Kill switches** : `risk-engine` expose `/kill` (arrêt immédiat) et `/pause` (gel des ordres) sans auth pour réactivité maximale en local.
- **17 tables `hedge_*`** dans Supabase (liste dans `README-HEDGE.md`). Toute nouvelle table DOIT respecter la convention append-only et avoir une RLS policy.
- Fichiers clés : `.env.hedge`, `docker-compose.hedge.yml`, `README-HEDGE.md`.

Boot HEDGE local :
```bash
docker compose -f docker-compose.hedge.yml up
```

## Webhooks Cortex

Le dispatcher de webhooks Helm→Cortex est implémenté côté `hive-front-swarms` (TS, hors ce repo). La validation inbound côté Python (HMAC + idempotency key) n'est **pas encore implémentée** — TODO prioritaire avant prod Cortex.

## Commandes

Boot créwAI local :
```bash
cd services/crewai-engine
uv sync
uv run uvicorn src.main:app --reload --port 8000
```

Boot HEDGE local :
```bash
docker compose -f docker-compose.hedge.yml up
```

Déploiement GPU2 (crewai-engine) :
```bash
docker compose -f services/crewai-engine/docker-compose.gpu2.yml up -d
```

Doc CrewAI : `docs/crewai/` (00-index + 8 sections, ~6600 lignes) — à lire avant tout choix d'API.

## Déploiement

| Target | Config | Port | Notes |
|---|---|---|---|
| Railway | auto (nixpacks) | 8000 | `crewai-engine` — cold start 30s, `AbortSignal.timeout(30s)` côté front |
| GPU2 | `docker-compose.gpu2.yml` | 8010 | `network_mode: host`, restart unless-stopped |

## Conventions

- Pas de magic numbers. Tout via `.env.local` / `.env.hedge` ou `config/`.
- **RLS Supabase activée par défaut** sur toutes les tables — toute nouvelle table DOIT avoir une policy (voir [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) pour le pattern).
- Tables HEDGE : **append-only** — aucun UPDATE/DELETE permis, enforced par RLS.
- Tokens OAuth chiffrés avec `TOKEN_ENCRYPTION_KEY` avant insertion DB.
- Tous les secrets dans `.env.local` / `.env.hedge` (gitignored) et `docs/api-config/SERVICES.md` (gitignored).

## Référentiels

- Services & API keys : [docs/api-config/SERVICES.md](docs/api-config/SERVICES.md) *(gitignored)*
- Variables locales : [.env.local](.env.local) *(gitignored)*
- Agent de référence : `~/.claude/agents/agent-swarms.md` (452 lignes, source de vérité étendue)

## URL & dashboards

- Supabase : https://app.supabase.com/project/fxeibmjebvxtoazuyyvz
- Railway : https://railway.app/project/693c476c-3d0c-4213-8088-63018863fa5d
- Vercel `hearst-corporation/myswarms` : déploiement historique du front archivé — référence uniquement
