# hive-engine

> Backend CrewAI orchestration — microservice Python FastAPI déployé sur Railway.

Anciennement `hive — myswarms` (front Next.js + backend).
Le front Next.js a été archivé dans `.archive/front-nextjs-2026-05-20/` après
migration des pages vers `helm — hearst-os` (Admin Orchestrator).

## Architecture

```
helm — hearst-os (Next.js user-facing)
  ↓ HTTP via /api/crewai/* proxy
hive-engine (Python FastAPI, ce repo)
  ↓
CrewAI agents + crews + tools + Supabase + Composio + Langfuse
```

## Quick start

```bash
cd services/crewai-engine
uv sync
uvicorn src.main:app --reload --port 8000
curl http://127.0.0.1:8000/health  # → {"status":"ok"}
```

## Deploy

Railway autodeploy on push to main, healthcheck `/health`.

## Endpoints

| Route | Méthode | Description |
|---|---|---|
| `/v1/swarms` | GET/POST | List / Create |
| `/v1/swarms/{id}` | GET/PATCH/DELETE | CRUD |
| `/v1/swarms/{id}/kickoff` | POST | Démarrer un run |
| `/v1/swarms/{id}/runs` | GET | Historique runs |
| `/v1/swarms/{id}/status/{run_id}` | GET | État d'un run |
| `/v1/runs/{run_id}` | GET | Détail run |
| `/v1/swarms/architect/generate` | POST | Architect : NL brief → swarm spec |
| `/v1/tools` | GET | Tools registry |
| `/crews/chief-of-staff/kickoff` | POST | Daily Chief |
| `/crews/chief-of-staff/runs` | GET | Historique runs Chief |
| `/crews/chief-of-staff/status/{kickoff_id}` | GET | État run Chief |
| `/crews/chief-of-staff/runs/{kickoff_id}/steps` | GET | Étapes |
| `/crews/chief-of-staff/runs/{kickoff_id}/decisions` | GET | Décisions |
| `/crews/chief-of-staff/decisions` | POST | Poster une décision |
| `/health` | GET | Healthcheck |

## Historique de migration

Voir `.archive/front-nextjs-2026-05-20/MIGRATION_NOTES.md` pour le détail de ce qui a été porté.
