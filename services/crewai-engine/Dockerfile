FROM python:3.12-slim AS base

# Install uv via official binary (faster, no pip overhead)
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv

# curl needed for HEALTHCHECK CMD
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Deps layer (cached unless pyproject.toml / uv.lock change) ──────────────
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev

# ── Application code ─────────────────────────────────────────────────────────
COPY src/ ./src/
COPY swarms/ ./swarms/

# Railway injects $PORT dynamically; default 8000 for local docker run
ENV PORT=8000
EXPOSE 8000

# Docker-level healthcheck (Railway also probes /health via railway.json)
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

CMD ["sh", "-c", "uv run uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
