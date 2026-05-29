#!/usr/bin/env bash
# start-all.sh — boote les 3 stacks locales (Myswarms + Hedge) en parallèle.
#
# Usage : ./start-all.sh
#   - Ctrl+C → arrête les 3 en cascade (trap)
#   - Logs préfixés par couleur ([back], [myswarms], [hedge])
#
# Stacks :
#   1. MySwarms backend  (FastAPI uvicorn :8000) — bypass dev Swagger via patch main.py
#   2. MySwarms front    (Next.js :3333)         — bypass auth via DEV_BYPASS_AUTH=true
#   3. Hedge front       (Next.js :3001)         — bypass auth via DEV_BYPASS_AUTH=true
#
# Pré-requis :
#   - uv (Python) installé · npm installé
#   - ~/Dev/Hearst Corporation/Myswarms/.env.local doit exister (vars Supabase/Hypercli/Langfuse)
#   - hive-front-swarms + Hedge cloned aux paths attendus

set -euo pipefail

MYSWARMS_ROOT="/Users/adrienbeyondcrypto/Dev/Hearst Corporation/Myswarms"
MYSWARMS_FRONT="/Users/adrienbeyondcrypto/Dev/Hearst Corporation/hive-front-swarms"
HEDGE_ROOT="/Users/adrienbeyondcrypto/Dev/Projects/Hedge"
BACKEND_DIR="$MYSWARMS_ROOT/services/crewai-engine"

# Couleurs ANSI pour préfixes logs
C_BACK=$'\033[35m'        # magenta — backend
C_MYSWARMS=$'\033[36m'    # cyan — MySwarms front
C_HEDGE=$'\033[33m'       # jaune — Hedge front
C_RESET=$'\033[0m'

# Préfixe chaque ligne stdout d'un process avec un label coloré.
prefix() {
  local label=$1
  local color=$2
  while IFS= read -r line; do
    echo "${color}[${label}]${C_RESET} ${line}"
  done
}

# Tue tout sur Ctrl+C.
cleanup() {
  echo
  echo "🛑 Arrêt des stacks…"
  jobs -p | xargs -r kill 2>/dev/null || true
  # Backup : libère explicitement les ports si jobs orphelins
  lsof -ti :8000 :3333 :3001 2>/dev/null | xargs -r kill 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# 1. Kill ports déjà occupés avant boot (évite EADDRINUSE)
echo "🧹 Cleanup ports 8000/3333/3001…"
lsof -ti :8000 :3333 :3001 2>/dev/null | xargs -r kill 2>/dev/null || true
sleep 1

# 2. Backend MySwarms : exporte .env.local dans le shell puis lance uvicorn
echo "🐍 Boot backend MySwarms :8000…"
(
  set -a
  # shellcheck disable=SC1091
  source "$MYSWARMS_ROOT/.env.local"
  set +a
  cd "$BACKEND_DIR"
  unset VIRTUAL_ENV
  uv run uvicorn src.main:app --port 8000 --reload 2>&1 | prefix "back" "$C_BACK"
) &

# 3. Front MySwarms : avec bypass dev (skipper login)
echo "🌐 Boot front MySwarms :3333 (bypass auth)…"
(
  cd "$MYSWARMS_FRONT"
  DEV_BYPASS_AUTH=true npm run dev:front 2>&1 | prefix "myswarms" "$C_MYSWARMS"
) &

# 4. Front Hedge : avec bypass dev
echo "📊 Boot front Hedge :3001 (bypass auth)…"
(
  cd "$HEDGE_ROOT"
  DEV_BYPASS_AUTH=true npm run dev 2>&1 | prefix "hedge" "$C_HEDGE"
) &

# 5. Poll jusqu'à ce que les 3 répondent, puis ouvre Chrome
echo "⏳ Attente boot complet (max 60s)…"
for i in $(seq 1 60); do
  back=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null || echo "000")
  myswarms=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3333/ 2>/dev/null || echo "000")
  hedge=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ 2>/dev/null || echo "000")
  if [ "$back" = "200" ] && [ "$myswarms" != "000" ] && [ "$hedge" != "000" ]; then
    echo "✅ Up en ${i}s — back=$back myswarms=$myswarms hedge=$hedge"
    break
  fi
  [ "$((i % 5))" -eq 0 ] && echo "   [${i}s] back=$back myswarms=$myswarms hedge=$hedge"
  sleep 1
done

echo
echo "🌐 Ouverture Chrome…"
open -a "Google Chrome" "http://localhost:3333" "http://localhost:3001" "http://localhost:8000/docs"

echo
echo "──────────────────────────────────────────────────────"
echo "  MySwarms front  → http://localhost:3333"
echo "  Hedge front     → http://localhost:3001"
echo "  Backend health  → http://localhost:8000/health"
echo "  Backend Swagger → http://localhost:8000/docs"
echo "──────────────────────────────────────────────────────"
echo "Ctrl+C pour tout arrêter."
echo

# Attend les jobs background — bloque le script tant que tout tourne
wait
