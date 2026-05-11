# PDF Extractor — Docker image
# Base: Ubuntu 24.04 (noble) — Python 3.12, Tesseract 5, poppler via apt
# Replaces python:3.11-slim (Debian trixie) which hit deb.debian.org (blocked).
# archive.ubuntu.com is accessible in this environment.

FROM ubuntu:24.04

# System dependencies via Ubuntu apt (archive.ubuntu.com accessible)
# tesseract-ocr + language packs: OCR for Vietnamese/English PDFs.
# poppler-utils: pdftotext fallback for text-layer PDFs.
# curl: healthcheck endpoint probe.
# python3 + python3-pip: FastAPI application runtime.
# DEBIAN_FRONTEND=noninteractive prevents apt from prompting during build.
RUN apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      tesseract-ocr \
      tesseract-ocr-vie \
      tesseract-ocr-eng \
      poppler-utils \
      curl \
      python3 \
      python3-pip \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cache friendly)
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt

# Copy application source
COPY . .

# Ensure extraction storage directory exists
RUN mkdir -p /app/data/extractions /app/data

ENV PYTHONPATH=/app
ENV HOST=0.0.0.0
ENV PORT=5001
ENV DB_PATH=/app/data/pdf_extractor.db
ENV STORAGE_DIR=/app/data/extractions
ENV LOG_LEVEL=INFO

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:5001/health || exit 1

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001"]
