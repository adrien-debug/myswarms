# Railway Deploy — hive-engine

Service : `crewai-engine` (FastAPI + CrewAI + APScheduler)
URL prod actuelle : à récupérer via `railway domain` après redeploy.

---

## Setup initial (5 min)

```bash
# 1. CLI
brew install railway

# 2. Login
railway login

# 3. Depuis services/crewai-engine/
cd services/crewai-engine
railway init          # ou `railway link` si le projet existe déjà

# 4. Set les env vars (cf liste ci-dessous)
# Via dashboard Railway → Variables, ou railway variables set KEY=value

# 5. Deploy
./scripts/railway-deploy.sh
# (ou `railway up` directement)

# 6. URL
railway domain
```

---

## Variables d'environnement à set sur Railway

Copie depuis ton `.env` local. Toutes sont requises sauf indication contraire.

### Auth
```
CREWAI_ENGINE_AUTH_TOKEN        # openssl rand -hex 32 — token partagé avec Cortex
```

### LLM Providers
```
ANTHROPIC_API_KEY
OPENAI_API_KEY
HYPERCLI_API_KEY
HYPERCLI_BASE_URL
HYPERCLI_DEFAULT_MODEL
HYPERCLI_ANTHROPIC_MODEL
CREWAI_DEFAULT_FAST_MODEL
CREWAI_DEFAULT_BALANCED_MODEL
CREWAI_DEFAULT_SMART_MODEL
```

### Supabase
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

### Observabilité
```
LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY
LANGFUSE_HOST
SENTRY_DSN                      # optionnel — fail-soft si absent
```

### CORS (Railway prod — obligatoire)
```
CREWAI_ENGINE_ALLOWED_ORIGINS   # CSV : https://myswarms.vercel.app,https://staging.myswarms.app
```
> Note : l'env var `CREWAI_ENGINE_ALLOWED_ORIGINS` (CSV) prend la priorité sur `ALLOWED_ORIGINS` (JSON).
> Utilise `CREWAI_ENGINE_ALLOWED_ORIGINS` sur Railway, c'est plus simple.

### Composio
```
COMPOSIO_API_KEY
COMPOSIO_USER_ID
```

### Telegram (optionnel — désactive le digest Telegram si absent)
```
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

### Préférences utilisateur
```
USER_TIMEZONE                   # ex: Asia/Dubai
USER_LANGUAGE                   # ex: fr
VIP_CONTACTS                    # JSON array : ["boss@example.com"]
URGENT_KEYWORDS                 # JSON array
SECURITY_LEVEL                  # 1-5
```

### Scheduler
```
SCHEDULER_ENABLED               # true
MORNING_HOUR
MORNING_MINUTE
EVENING_HOUR
EVENING_MINUTE
MISFIRE_GRACE_TIME_SECONDS
```

### Cortex RAG (vault_search tool)
```
CORTEX_URL                      # ex: https://cortex.hearst.app
CORTEX_API_KEY
```

### Divers
```
CREWAI_DISABLE_TELEMETRY        # true recommandé en prod
FLOW_TIMEOUT_SECONDS            # 300 par défaut
AGENT_MOCK_MODE                 # false en prod
ENVIRONMENT                     # production (active Sentry prod traces 10%)
```

---

## Tests post-deploy

```bash
URL=$(railway domain)

# Healthcheck (pas d'auth)
curl $URL/health
# → {"status":"ok","version":"0.1.0"}

# Endpoint swarms (auth Bearer)
curl $URL/v1/swarms \
  -H "Authorization: Bearer $CREWAI_ENGINE_AUTH_TOKEN"
```

---

## Mise à jour de Cortex après redeploy

Dans `services/cortex/.env.local` (ou variables Railway Cortex) :

```
CREWAI_ENGINE_URL=https://<nouvelle-url-railway>
CREWAI_API_KEY=<même valeur que CREWAI_ENGINE_AUTH_TOKEN>
```

---

## Troubleshooting

| Symptôme | Cause probable | Fix |
|---|---|---|
| 404 "Application not found" | Déploiement expiré / service supprimé | `railway up` depuis `services/crewai-engine/` |
| 401 sur toutes les routes sauf /health | `CREWAI_ENGINE_AUTH_TOKEN` absent ou différent | Vérifier variable Railway + variable Cortex |
| Health KO au boot (timeout 120s) | Dep install lente ou crash au démarrage | Consulter logs : `railway logs` |
| CORS bloqué depuis Vercel | `CREWAI_ENGINE_ALLOWED_ORIGINS` non set | Ajouter l'URL Vercel en CSV |
| Telegram digest silencieux | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` manquants | Set les vars ou `SCHEDULER_ENABLED=false` |
