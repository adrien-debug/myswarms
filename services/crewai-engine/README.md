# crewai-engine

CrewAI orchestration microservice for MySwarms — Daily Chief of Staff AI.
FastAPI + CrewAI 1.14+, deployed on Railway, consumed by Next.js via REST.

## Secrets

Avant de booter localement ou déployer, génère le token bearer partagé entre Next.js et le microservice :

```bash
openssl rand -hex 32
```

Place cette valeur dans :
- `.env.local` du repo Next.js racine → `CREWAI_ENGINE_AUTH_TOKEN=...`
- `.env` du microservice (et dans Railway env vars en prod) → `CREWAI_ENGINE_AUTH_TOKEN=...` (même valeur des deux côtés)

Sans token, l'auth Bearer rejette toutes les requêtes (401).

## Boot local

```bash
cd services/crewai-engine
cp .env.example .env      # Fill in your secrets
uv sync
uv run uvicorn src.main:app --reload
```

API available at http://localhost:8000. Docs at http://localhost:8000/docs.

## Boot Docker

```bash
docker build -t crewai-engine .
docker run -p 8000:8000 --env-file .env crewai-engine
```

## Smoke test

```bash
# Health (no auth required)
curl http://localhost:8000/health

# Kickoff a run
curl -X POST \
  -H "Authorization: Bearer <CREWAI_ENGINE_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"on_demand"}' \
  http://localhost:8000/v1/crews/chief-of-staff/kickoff

# Check status (use kickoff_id from above)
curl -H "Authorization: Bearer <CREWAI_ENGINE_AUTH_TOKEN>" \
  http://localhost:8000/v1/crews/chief-of-staff/status/<kickoff_id>
```

## Deploy Railway

Push to your Railway service. Set all vars from `.env.example` in Railway dashboard.
The `railway.json` handles Dockerfile build, port 8000, and `/health` healthcheck.
