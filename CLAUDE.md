# MySwarms

> Projet créé via `/setup-adrien`. Stack : Next.js 16 (App Router) + TypeScript + Tailwind 4. Région Supabase : `eu-west-1`.

## Langue & mode
- Toutes les réponses en **français**.
- Mode **autonomie totale** : tu exécutes, tu ne demandes pas confirmation pour chaque étape.

## Stack
- **Web** : Next.js 16 (App Router, src/) + React 19 + Tailwind 4 — port `3333` (script `next dev -p 3333`)
- **API/Backend** : routes Next.js (`src/app/api/...`) — fallback port `3001` si extraction
- **DB** : Supabase Postgres 17 — projet ref `fxeibmjebvxtoazuyyvz`
- **Cache/Queue** : Upstash Redis REST (fallback — Railway Redis non provisionné, CLI v4.36 bug)
- **Hosting** : Vercel (`hearst-corporation/myswarms`, projet `prj_D7svFbXovy2hni4hAPyN2AJI5Lnq`) + Railway (`693c476c-3d0c-4213-8088-63018863fa5d`)

## 🐍 Microservice CrewAI Python — `services/crewai-engine/`

Moteur d'orchestration multi-agents pour le Daily Chief of Staff AI. **Python-only** (FastAPI + crewai + langfuse + uv). Déployé séparément sur Railway, appelé en HTTP/Bearer depuis Next.js.

### Stack microservice

- Python 3.12 + uv (lockfile `uv.lock`)
- FastAPI + uvicorn[standard]
- crewai >= 1.14.4 (orchestration Flows + Crews)
- langfuse v3 (observabilité)
- supabase-py (persistence runs / steps)

### Communication Next.js ↔ Python

- URL dev : `CREWAI_ENGINE_URL=http://localhost:8000`
- URL prod : `CREWAI_ENGINE_URL_PROD=https://crewai-engine-myswarms.up.railway.app`
- Auth : bearer token partagé `CREWAI_ENGINE_AUTH_TOKEN` (même valeur des deux côtés, généré via `openssl rand -hex 32`)
- Endpoints : `POST /v1/crews/chief-of-staff/kickoff`, `GET /v1/crews/chief-of-staff/status/{uuid}`, `GET /health`
- Wrapper TS : `src/lib/crewai/client.ts` (avec `AbortSignal.timeout(30s)` pour Railway cold starts)
- Routes API Next.js (proxy) : `src/app/api/crews/chief-of-staff/{kickoff,status/[runId]}/route.ts`

### Boot local

```bash
cd services/crewai-engine
uv sync
uv run uvicorn src.main:app --reload --port 8000
```

Le frontend Next.js (port 3333) appelle automatiquement le microservice si `CREWAI_ENGINE_URL=http://localhost:8000` dans `.env.local`.

### Doc CrewAI

Tout `docs/crewai/` (00-index + 8 sections, ~6600 lignes) contient la doc CrewAI ingérée exhaustivement avec annotation "Pertinence Daily Chief of Staff" page par page. À lire avant tout choix d'API.

### Règle absolue

JAMAIS hardcoder un secret dans `services/crewai-engine/src/` — toujours via `pydantic_settings` BaseSettings + `os.getenv()`. Même règle que Next.js (`process.env.X`).

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
| **GPU2** | `192.168.1.150` | `100.110.74.114` | `gpu2`, `gpu2-remote` | ComfyUI :8188 · InvokeAI :9090 |
| **Windows farm** | `192.168.1.14` | — | `windows-farm`, `farm-pc` | Windows-only tasks |

### Pattern de connexion pour ce projet

Si MySwarms a besoin de GPU (génération d'image/vidéo, training, inférence locale) :

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

### Côté Next.js — client OpenAI-compatible

```typescript
// src/lib/llm/kimi.ts
import OpenAI from "openai";

export const kimi = new OpenAI({
  apiKey: process.env.HYPERCLI_API_KEY!,
  baseURL: process.env.HYPERCLI_BASE_URL!, // https://api.hypercli.com/v1
});

const response = await kimi.chat.completions.create({
  model: process.env.HYPERCLI_DEFAULT_MODEL!, // kimi-k2.6
  messages: [{ role: "user", content: "..." }],
});
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

Embeddings via Hypercli modèle `qwen3-embedding-4b` (endpoint OpenAI-compatible, champ `model`). Plus de dépendance `text-embedding-3-small` OpenAI pour le chemin nominal. Si Hypercli est indisponible et qu'un embedding est requis, marquer en TODO — ne pas réintroduire OpenAI par défaut.

### Modèles Hypercli disponibles

`kimi-k2.6` · `kimi-k2.6-anthropic` · `kimi-k2.5` · `kimi-k2.5-anthropic` · `glm-5` · `minimax-m2.5` · `qwen3-embedding-4b`

### Historique

Hypercli avait été écarté en N-1 (empty-responses / 404 / timeouts observés sur le crew 8 agents séquentiels du Chief of Staff). Ré-adopté sur directive explicite — **surveiller la fiabilité du crew Chief of Staff** en production et consigner tout incident dans Langfuse.

### Règles strictes

- **JAMAIS** hardcoder une clé API dans le code — toujours `process.env.X` (Next.js) ou `pydantic_settings` BaseSettings + `os.getenv()` (Python).
- **JAMAIS** créer un client LLM sans passer par `src/lib/llm/` (factory centralisée côté TS).
- **JAMAIS** appeler un provider non listé sans validation explicite d'Adrien.
- Tracer chaque run LLM (model, tokens, latency, cost) dans Langfuse via les vars `LANGFUSE_*`.

## Commandes

- `npm run dev` — Next dev sur port 3333
- `npm run build` — build prod
- `npm run lint` — ESLint
- `npm run electron:dev` — Electron desktop (après scaffold `/electron`)
- `/dev-adrien` — kill total + relance dev + ouvre Chrome

## Conventions

- Pas de magic numbers. Tout via `.env.local` ou `config/`.
- **RLS Supabase activée par défaut** sur toutes les tables — toute nouvelle table DOIT avoir une policy (voir [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) pour le pattern).
- Tokens OAuth chiffrés avec `TOKEN_ENCRYPTION_KEY` avant insertion DB.
- Tous les secrets dans `.env.local` (gitignored) et `docs/api-config/SERVICES.md` (gitignored).

## Référentiels

- Services & API keys : [docs/api-config/SERVICES.md](docs/api-config/SERVICES.md) *(gitignored)*
- Variables locales : [.env.local](.env.local) *(gitignored)*

## Dashboard de référence

Le UI du dashboard est calé sur le template visuel :
`/Users/adrienbeyondcrypto/Dev/hearst-os/docs/visual/dashboard-template.html`

Adrien peut modifier ce fichier à tout moment — `/setup` prend toujours la dernière version au moment de l'invocation.

## URL & dashboards

- Supabase : https://app.supabase.com/project/fxeibmjebvxtoazuyyvz
- Railway : https://railway.app/project/693c476c-3d0c-4213-8088-63018863fa5d
- Vercel : https://vercel.com/hearst-corporation/myswarms
