#!/bin/bash
# railway-deploy.sh — redeploy hive-engine sur Railway
# Usage: ./scripts/railway-deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# ── Prérequis ────────────────────────────────────────────────────────────────
if ! command -v railway >/dev/null 2>&1; then
  echo "❌  Railway CLI manquant. Installe : brew install railway"
  exit 1
fi

# ── Auth ─────────────────────────────────────────────────────────────────────
if ! railway whoami >/dev/null 2>&1; then
  echo "→ Login Railway requis..."
  railway login
fi
echo "✓ Connecté : $(railway whoami)"

# ── Link projet (interactif si .railway/config.json absent) ──────────────────
if [ ! -f .railway/config.json ]; then
  echo "→ Aucun projet Railway lié. Lance 'railway link' ou 'railway init'..."
  railway link
fi

# ── Deploy ───────────────────────────────────────────────────────────────────
echo ""
echo "→ Déploiement en cours (builder: Dockerfile)..."
railway up

# ── Post-deploy ──────────────────────────────────────────────────────────────
echo ""
DOMAIN=$(railway domain 2>/dev/null || echo "<URL non disponible — relance: railway domain>")
echo "✅  Deploy terminé."
echo ""
echo "Tests :"
echo "  curl ${DOMAIN}/health"
echo "  curl ${DOMAIN}/v1/swarms -H \"Authorization: Bearer \$CREWAI_ENGINE_AUTH_TOKEN\""
echo ""
echo "Mets à jour Cortex .env.local :"
echo "  CREWAI_ENGINE_URL=${DOMAIN}"
echo "  CREWAI_API_KEY=<même valeur que CREWAI_ENGINE_AUTH_TOKEN>"
