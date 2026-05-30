# Dockerfile for the JipJaba Python agent service (agents/server.py).
# Use this on Fly.io / Render / Railway / any container host.
# The Next.js frontend deploys separately to Vercel and calls this over HTTP.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt ./
COPY agents/requirements.txt ./agents/requirements.txt
RUN pip install -r requirements.txt

# App code + mock data the agents read at runtime.
COPY agents ./agents
COPY data ./data

# Persist conversation memory here; mount a volume at /data-persist in prod.
ENV JIPJABA_CHECKPOINT_PATH=/app/data/checkpoints.sqlite

EXPOSE 8000
# $PORT is provided by most hosts; default to 8000 locally.
CMD ["sh", "-c", "uvicorn agents.server:app --host 0.0.0.0 --port ${PORT:-8000}"]
