#!/usr/bin/env bash
# scripts/audits/ocr-confidence-probe.sh
# — FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS
#
# Design-phase instrument (AC-1). Runs the real PekEngineAdapter pipeline in an
# ephemeral `docker compose run --rm` container with a RECORDING shim around
# TesseractVieBackend.recognize_text, and dumps per-table-region diagnostics for
# every candidate discriminator named in AC-1 (area coverage, line coverage,
# char-weighted conf, ink coverage) side by side with today's mean(conf).
#
# Behaviour-neutral: the shim returns exactly what the unmodified backend would,
# and does NOT push to mcp-server. Nothing is baked into the image.
#
# Usage:  bash scripts/audits/ocr-confidence-probe.sh [report_id] [pdf_path] > out.jsonl
# Never call during VN market hours (02:00-08:59 UTC weekdays).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

REPORT_ID="${1:-e71f845d-ffa5-48f9-8f09-30ac2cd09c65}"
PDF_PATH="${2:-/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf}"
NAME="ocr-conf-probe-$$"

echo "=== confidence probe: $REPORT_ID ===" >&2
docker compose run --rm --no-deps \
  -v "$PWD/scripts/audits/ocr_confidence_probe_inner.py:/tmp/ocr_confidence_probe_inner.py:ro" \
  --name "$NAME" \
  pdf-extractor \
  python3 -u /tmp/ocr_confidence_probe_inner.py "$REPORT_ID" "$PDF_PATH" \
  2> >(sed 's/^/[probe] /' >&2) \
  | grep "^OCR_PROBE_RESULT_JSON " || {
    echo "=== probe FAILED (no result line) ===" >&2
    exit 1
  }
