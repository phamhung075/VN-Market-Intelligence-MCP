#!/usr/bin/env bash
# scripts/migrations/sweep-pdf-ocr-orientation-garble.sh
#
# FIX-MCPSERVER-PDFOCRWORKER-OCRONEPAGE-NO-ORIENTATION-4TH-OCR-SITE — corpus
# sweep runner. Ties together the two persisted pieces of this fix:
#   1. scripts/audits/detect-pdf-ocr-orientation-garble.ts — calibrated
#      discriminator, finds the currently-garbled (filename, page_number)
#      set fresh from the live DB (re-run each invocation of this script —
#      NOT a frozen snapshot, so it is safe to re-run after an interrupted
#      partial sweep and it will only touch what's still garbled).
#   2. scripts/migrations/reextract-pdf-ocr-orientation.ts --pages <list>
#      --apply — the targeted-page re-extraction (12x cheaper than the
#      whole-file default; see that script's header for why).
#
# Default is DRY-RUN (prints the plan: file list + page counts + total,
# no writes, no OCR spawned). Pass --apply to actually run the sweep.
#
# Usage:
#   DB_PATH=data/live/market.db bash scripts/migrations/sweep-pdf-ocr-orientation-garble.sh
#   DB_PATH=data/live/market.db bash scripts/migrations/sweep-pdf-ocr-orientation-garble.sh --apply
#
# Env:
#   DB_PATH — forwarded to both the detector and the reextract script
#             (default in both: data/market.db — the STALE 14MB copy; pass
#             DB_PATH=data/live/market.db explicitly for the real corpus)
#   PDF_DIR — forwarded to the reextract script (default: data/pdfs)
#
# Exit codes: 0 success | 1 detector or reextract invocation failed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APPLY=0
for arg in "$@"; do
  if [ "$arg" = "--apply" ]; then APPLY=1; fi
done

MANIFEST="$(mktemp)"
trap 'rm -f "$MANIFEST"' EXIT

echo "[SWEEP] running detector (fresh scan, not a frozen snapshot)..."
bun "$REPO_ROOT/scripts/audits/detect-pdf-ocr-orientation-garble.ts" --json > "$MANIFEST"

FILES_TOTAL=$(jq -r '.files_affected' "$MANIFEST")
PAGES_TOTAL=$(jq -r '.pages_affected' "$MANIFEST")
echo "[SWEEP] current scope: ${FILES_TOTAL} file(s) / ${PAGES_TOTAL} page(s) still garbled"

if [ "$FILES_TOTAL" -eq 0 ]; then
  echo "[SWEEP] nothing to do — corpus is clean per the current discriminator."
  exit 0
fi

MODE_LABEL="DRY-RUN (no writes — pass --apply to run)"
if [ "$APPLY" -eq 1 ]; then MODE_LABEL="APPLY"; fi
echo "[SWEEP] mode=${MODE_LABEL}"

i=0
FAILED_FILES=""
while IFS= read -r filename; do
  i=$((i + 1))
  pages=$(jq -r --arg f "$filename" '.by_file[$f] | join(",")' "$MANIFEST")
  npages=$(jq -r --arg f "$filename" '.by_file[$f] | length' "$MANIFEST")
  echo "[SWEEP] (${i}/${FILES_TOTAL}) ${filename} — ${npages} page(s): ${pages}"
  if [ "$APPLY" -eq 1 ]; then
    if ! bun "$REPO_ROOT/scripts/migrations/reextract-pdf-ocr-orientation.ts" \
      --filename "$filename" --pages "$pages" --apply; then
      echo "[SWEEP] ERROR: reextract failed for ${filename} — continuing with remaining files"
      FAILED_FILES="${FAILED_FILES}${filename} "
    fi
  fi
done < <(jq -r '.by_file | keys[]' "$MANIFEST")

if [ "$APPLY" -eq 1 ]; then
  echo "[SWEEP] re-running detector to report residual scope..."
  AFTER_MANIFEST="$(mktemp)"
  bun "$REPO_ROOT/scripts/audits/detect-pdf-ocr-orientation-garble.ts" --json > "$AFTER_MANIFEST"
  AFTER_FILES=$(jq -r '.files_affected' "$AFTER_MANIFEST")
  AFTER_PAGES=$(jq -r '.pages_affected' "$AFTER_MANIFEST")
  echo "[SWEEP] RESULT: before=${FILES_TOTAL}f/${PAGES_TOTAL}p  after=${AFTER_FILES}f/${AFTER_PAGES}p"
  if [ "$AFTER_FILES" -gt 0 ]; then
    echo "[SWEEP] RESIDUAL (still garbled per discriminator — inspect manually, may be a total-OCR-miss"
    echo "[SWEEP]   rather than orientation garble, e.g. the disclosed SAB_2026_Q1 p10 precision-limit case):"
    jq -r '.by_file | to_entries[] | "  \(.key): \(.value | join(","))"' "$AFTER_MANIFEST"
  fi
  if [ -n "$FAILED_FILES" ]; then
    echo "[SWEEP] FILES WITH SCRIPT-LEVEL FAILURES (non-zero exit, not just residual garble): ${FAILED_FILES}"
    rm -f "$AFTER_MANIFEST"
    exit 1
  fi
  rm -f "$AFTER_MANIFEST"
fi
