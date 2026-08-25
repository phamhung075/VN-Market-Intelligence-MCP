#!/usr/bin/env bash
# scripts/audits/ocr-backend-bench.sh — OCR-PADDLE-VI-LANG-FIX-AND-REBENCH
#
# Re-runs the tesseract-vie / paddleocr / auto comparison on FPT Q4 2025
# (report_id e71f845d-ffa5-48f9-8f09-30ac2cd09c65, 46 pages) via ephemeral
# `docker compose run --rm --no-deps` containers — same method as the
# INVALIDATED 2026-08-25 benchmark, now against a rebuilt image with
# ocr_adapter.py/ocr_worker.py lang="vi" (was "en"). Bind-mounts
# scripts/audits/ocr_bench_inner.py read-only into the container (never
# baked into the image, apps/pdf-extractor/ untouched by this script).
#
# Usage: bash scripts/audits/ocr-backend-bench.sh [tesseract-vie paddleocr auto ...]
# Output: one JSON line per backend on stdout (prefixed OCR_BENCH_RESULT_JSON),
#         plus stderr progress. Never call during VN market hours (02:00-08:59 UTC weekdays).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

REPORT_ID="e71f845d-ffa5-48f9-8f09-30ac2cd09c65"
PDF_PATH="/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"
if [ "$#" -gt 0 ]; then BACKENDS=("$@"); else BACKENDS=(tesseract-vie paddleocr auto); fi

for BACKEND in "${BACKENDS[@]}"; do
  NAME="ocr-bench-${BACKEND//[^a-zA-Z0-9]/-}-$$"
  echo "=== [$BACKEND] starting ephemeral container $NAME ===" >&2
  docker compose run --rm --no-deps \
    -e OCR_TEXT_BACKEND="$BACKEND" \
    -v "$PWD/scripts/audits/ocr_bench_inner.py:/tmp/ocr_bench_inner.py:ro" \
    --name "$NAME" \
    pdf-extractor \
    python3 -u /tmp/ocr_bench_inner.py "$REPORT_ID" "$PDF_PATH" \
    2> >(sed "s/^/[$BACKEND] /" >&2) \
    | tee /dev/stderr | grep "^OCR_BENCH_RESULT_JSON " || echo "=== [$BACKEND] FAILED (no result line) ===" >&2
  echo "=== [$BACKEND] done ===" >&2
done
