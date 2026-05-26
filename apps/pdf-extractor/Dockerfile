# PDF Extractor — Docker image
# Base: Ubuntu 24.04 (noble) — Python 3.12, Tesseract 5, poppler via apt
# Replaces python:3.11-slim (Debian trixie) which hit deb.debian.org (blocked).
# archive.ubuntu.com is accessible in this environment.
#
# PEK-INTEGRATE: PDF-Extract-Kit engine wired (CPU-only, 8GB-safe).
#   - requirements-pek.txt replaces requirements.txt (trimmed: no unimernet/struct-eqtable/gpu)
#   - torch/torchvision CPU build installed via --index-url (separate RUN for layer cache)
#   - pip install -e ./PDF-Extract-Kit (editable install; source stays in /app/PDF-Extract-Kit/)
#   - Model weights: runtime-downloaded to named volume pek_model_cache (/app/pek_models)
#   - .git/ of PEK excluded from image via .dockerignore (AC-PEK-3a)
#
# DRIFT-3 Phase B: GIT_SHA build-arg label for deploy-sha verification (AC-PEK-10b).

FROM ubuntu:24.04

# DRIFT-3 Phase B: capture build-time git SHA for deploy-sha verification
ARG GIT_SHA=unknown
LABEL git_sha="${GIT_SHA}" service="pdf-extractor"

# System dependencies via Ubuntu apt (archive.ubuntu.com accessible)
# tesseract-ocr + language packs: OCR for Vietnamese/English PDFs.
# poppler-utils: pdftotext fallback for text-layer PDFs.
# curl: healthcheck endpoint probe.
# python3 + python3-pip: FastAPI application runtime.
# libgl1 + libglib2.0-0: required by OpenCV (paddleocr dependency).
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
      libgl1 \
      libglib2.0-0 \
      git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# PyTorch CPU-only build FIRST (separate layer — avoids pulling GPU variant later)
# REQ-PEK-2: CPU-only. paddlepaddle_gpu must never appear in sys.modules.
RUN pip3 install --no-cache-dir --break-system-packages \
    torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cpu

# Install trimmed PDF-Extract-Kit requirements (CPU-only, no unimernet/struct-eqtable/gpu)
COPY requirements-pek.txt .
RUN pip3 install --no-cache-dir --break-system-packages \
    --trusted-host pypi.org --trusted-host files.pythonhosted.org \
    -r requirements-pek.txt

# Copy application source (includes PDF-Extract-Kit/ source tree for editable install)
# .dockerignore excludes PDF-Extract-Kit/.git/, PDF-Extract-Kit/models/, PDF-Extract-Kit/outputs/
COPY . .

# PDF-Extract-Kit is made importable via PYTHONPATH instead of pip editable install.
# pyproject.toml in the pristine PEK subtree contains invalid TOML (opencv-python key=value
# inside a PEP 508 dependencies array), which causes `pip install -e` to fail on Python 3.12.
# PYTHONPATH extension is equivalent: editable install only adds the source dir to sys.path.
# AC-PEK-3a: source tree IS present at /app/PDF-Extract-Kit/.
#             .git/ NOT present (excluded by .dockerignore).
#             model weights NOT baked in (downloaded to named volume at runtime).
# AC-PEK-0a: PEK subtree is pristine — NOT edited (pyproject.toml left as-is).

# Ensure extraction storage directory + model cache dir exist
RUN mkdir -p /app/data/extractions /app/data /app/pek_models

# /app/PDF-Extract-Kit added so pdf_extract_kit package is importable (replaces editable install).
ENV PYTHONPATH=/app:/app/PDF-Extract-Kit
ENV HOST=0.0.0.0
ENV PORT=5001
ENV DB_PATH=/app/data/pdf_extractor.db
ENV STORAGE_DIR=/app/data/extractions
ENV LOG_LEVEL=INFO

# PEK model weight cache dirs (overridden by docker-compose.yml env vars)
# These defaults ensure models cache inside the container if no named volume is mounted.
ENV HUGGINGFACE_HUB_CACHE=/app/pek_models/huggingface
ENV MODELSCOPE_CACHE=/app/pek_models/modelscope
ENV YOLO_CONFIG_DIR=/app/pek_models/yolo
ENV PADDLEOCR_HOME=/app/pek_models/paddleocr

# PEK-IMPORT-CHAIN: corrected build-time smoke gate.
# Imports pek_engine_adapter MODULE ITSELF — not a proxy symbol set.
# If ANY import inside pek_engine_adapter.py fails (including transitive chains
# through pdf_extract_kit.tasks.* or any other package), the build fails here,
# not at first /pek-extract call.
# MANDATE: any new 'import X' added to _load_pek_models() must also appear below.
RUN python3 -c "\
import sys; \
sys.path.insert(0, '/app'); \
sys.path.insert(0, '/app/PDF-Extract-Kit'); \
print('--- PEK import chain smoke gate (PEK-IMPORT-CHAIN) ---'); \
import numpy; print('numpy', numpy.__version__); \
import cv2; print('cv2', cv2.__version__); \
import fitz; print('fitz (PyMuPDF)', fitz.__version__); \
from omegaconf import OmegaConf; print('omegaconf OK'); \
from doclayout_yolo import YOLOv10; print('doclayout_yolo.YOLOv10 OK'); \
from paddleocr import PaddleOCR; print('paddleocr.PaddleOCR OK'); \
import torch; print('torch', torch.__version__); \
from infrastructure.pek_engine_adapter import _PekLayoutModel, _load_pek_models; \
print('pek_engine_adapter import OK — no pdf_extract_kit.tasks trigger'); \
print('--- pek-import-chain: ALL OK ---')"

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:5001/health || exit 1

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001"]
