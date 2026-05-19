# RAG Service — Docker image
# Base: Ubuntu 22.04 — Python 3.10 via apt, lancedb requires glibc (no musl/Alpine)
# Replaces python:3.11-slim (Debian trixie) which hit deb.debian.org (blocked).
# archive.ubuntu.com is accessible in this environment.

FROM ubuntu:22.04

WORKDIR /app

# System dependencies via Ubuntu apt (archive.ubuntu.com accessible).
# curl: healthcheck endpoint probe.
# python3 + python3-pip: FastAPI + lancedb + sentence-transformers runtime.
# build-essential: required for native extension compilation (lancedb C bindings).
# DEBIAN_FRONTEND=noninteractive prevents apt from prompting during build.
RUN apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      curl \
      python3 \
      python3-pip \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
# CPU-only torch: PyTorch CPU wheel index added in requirements.txt (sprint 1956c).
# Trust download.pytorch.org so the --extra-index-url in requirements.txt resolves.
COPY requirements.txt .
RUN pip3 install --no-cache-dir \
      --trusted-host pypi.org \
      --trusted-host files.pythonhosted.org \
      --trusted-host download.pytorch.org \
      -r requirements.txt

# Copy application
COPY . .

# Data directory (LanceDB + SQLite + model cache)
RUN mkdir -p /app/data/lancedb /app/data/models

ENV LANCEDB_PATH=/app/data/lancedb
ENV DB_PATH=/app/data/rag_service.db
ENV EMBEDDING_CACHE_DIR=/app/data/models
ENV HOST=0.0.0.0
ENV PORT=5002
ENV LOG_LEVEL=INFO

EXPOSE 5002

# NOTE: sentence-transformers model (~400MB) auto-downloads on first run
# Pre-download by setting EMBEDDING_MODEL env and running:
#   docker run --rm -e EMBEDDING_MODEL=... rag-service python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5002/health || exit 1

CMD ["python3", "main.py"]
