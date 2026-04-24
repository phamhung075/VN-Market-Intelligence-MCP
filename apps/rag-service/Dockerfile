FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

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

CMD ["python", "main.py"]
