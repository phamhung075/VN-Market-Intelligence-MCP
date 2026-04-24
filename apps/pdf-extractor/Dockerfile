# PDF Extractor — Docker image
# Base: Python 3.11 slim; installs Tesseract + pdfplumber + FastAPI

FROM python:3.11-slim

# System dependencies: Tesseract OCR + Vietnamese language pack + poppler for pdftoppm
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-vie \
    tesseract-ocr-eng \
    poppler-utils \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cache friendly)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

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

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001"]
