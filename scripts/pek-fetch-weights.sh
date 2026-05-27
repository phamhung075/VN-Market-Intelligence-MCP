#!/usr/bin/env bash
# scripts/pek-fetch-weights.sh
# Provision DocLayout-YOLO weights onto the pek_model_cache named volume.
# IDEMPOTENT: exits 0 immediately if the weight file already exists on the volume.
# Run this ONCE after any fresh volume creation or docker volume rm pek_model_cache.
#
# Usage:
#   bash scripts/pek-fetch-weights.sh
#   bash scripts/pek-fetch-weights.sh --source modelscope   # force ModelScope
#
# Prerequisites: docker running, pek_model_cache volume exists or will be created by compose.

set -euo pipefail

VOLUME_NAME="vn-market-intelligence-mcp_pek_model_cache"
IMAGE="vn-market-intelligence-mcp-pdf-extractor:latest"
WEIGHT_DEST="/app/PDF-Extract-Kit/models/Layout/YOLO/doclayout_yolo_ft.pt"
HF_REPO="opendatalab/PDF-Extract-Kit-1.0"
HF_FILENAME="models/Layout/YOLO/doclayout_yolo_ft.pt"
MS_REPO="OpenDataLab/PDF-Extract-Kit-1.0"
SOURCE="${1:-hf}"  # hf | modelscope

echo "[pek-fetch-weights] Checking if weights already on volume..."
EXISTS=$(docker run --rm \
  -v "${VOLUME_NAME}:/app/PDF-Extract-Kit/models" \
  "${IMAGE}" \
  python3 -c "
import os, sys
p = '${WEIGHT_DEST}'
if os.path.exists(p) and os.path.getsize(p) > 1_000_000:
    print('EXISTS')
else:
    print('MISSING')
")

if [ "${EXISTS}" = "EXISTS" ]; then
  echo "[pek-fetch-weights] Weight file already present — skipping download."
  exit 0
fi

echo "[pek-fetch-weights] Weight file MISSING. Fetching from ${SOURCE}..."

if [ "${SOURCE}" = "modelscope" ]; then
  docker run --rm \
    -v "${VOLUME_NAME}:/app/PDF-Extract-Kit/models" \
    -e MODELSCOPE_CACHE=/app/PDF-Extract-Kit/models/modelscope \
    "${IMAGE}" \
    python3 -c "
from modelscope.hub.snapshot_download import snapshot_download
import shutil, os
local = snapshot_download(
    '${MS_REPO}',
    cache_dir='/app/PDF-Extract-Kit/models/modelscope',
    allow_patterns=['models/Layout/YOLO/doclayout_yolo_ft.pt']
)
src = os.path.join(local, 'models/Layout/YOLO/doclayout_yolo_ft.pt')
dst = '${WEIGHT_DEST}'
os.makedirs(os.path.dirname(dst), exist_ok=True)
shutil.copy2(src, dst)
print('[pek-fetch-weights] ModelScope fetch done:', dst, os.path.getsize(dst), 'bytes')
"
else
  # Primary: HuggingFace hf_hub_download (single file — faster than snapshot_download)
  docker run --rm \
    -v "${VOLUME_NAME}:/app/PDF-Extract-Kit/models" \
    -e HUGGINGFACE_HUB_CACHE=/app/PDF-Extract-Kit/models/huggingface \
    "${IMAGE}" \
    python3 -c "
from huggingface_hub import hf_hub_download
import shutil, os
local = hf_hub_download(
    repo_id='${HF_REPO}',
    filename='${HF_FILENAME}',
    cache_dir='/app/PDF-Extract-Kit/models/huggingface',
)
dst = '${WEIGHT_DEST}'
os.makedirs(os.path.dirname(dst), exist_ok=True)
shutil.copy2(local, dst)
size = os.path.getsize(dst)
assert size > 1_000_000, f'Weight file suspiciously small: {size} bytes'
print('[pek-fetch-weights] HuggingFace fetch done:', dst, size, 'bytes')
"
fi

echo "[pek-fetch-weights] DONE. Verify:"
echo "  docker run --rm -v ${VOLUME_NAME}:/app/PDF-Extract-Kit/models ${IMAGE} ls -lh /app/PDF-Extract-Kit/models/Layout/YOLO/"
