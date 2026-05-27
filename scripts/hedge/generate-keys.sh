#!/usr/bin/env bash
# Generate HMAC signing keys for HEDGE inter-service auth.
#
# Outputs hex-encoded 32-byte keys, one per signing context.
# Store in Railway/Vercel secrets + .env.local (gitignored). NEVER commit.
#
# Format compatible with hedge_hmac.SigningContext.from_env:
#   SWARM_SIGNING_KEY=v1:<hex>
#   STRATEGY_SIGNING_KEY=v1:<hex>
#   RISK_DECISION_KEY=v1:<hex>
#   PORTFOLIO_SIGNING_KEY=v1:<hex>
#
# Rotation: append a new key like "v1:<oldhex>,v2:<newhex>" — verifiers accept
# both, signers use the active_key_id from service config.

set -euo pipefail

keygen() { openssl rand -hex 32; }

cat <<EOF
# === HEDGE HMAC signing keys (generated $(date -u +%FT%TZ)) ===
# Paste into your secret manager and into the per-service .env files.

SWARM_SIGNING_KEY=v1:$(keygen)
STRATEGY_SIGNING_KEY=v1:$(keygen)
RISK_DECISION_KEY=v1:$(keygen)
PORTFOLIO_SIGNING_KEY=v1:$(keygen)
MARKET_SIGNING_KEY=v1:$(keygen)
EOF
