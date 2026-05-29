FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy lockable deps first for cache.
COPY services/risk-engine/pyproject.toml /app/pyproject.toml
RUN uv pip install --system -e .

# Shared HMAC library.
COPY shared/hmac/python /app/shared/hmac/python

# Source.
COPY services/risk-engine/src /app/src

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8001/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
