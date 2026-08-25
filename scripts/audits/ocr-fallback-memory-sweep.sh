#!/usr/bin/env bash
# scripts/audits/ocr-fallback-memory-sweep.sh
# — FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS
#   measurement cycle 2, PO ruling triage-20260825T1752Z §2e / §3 "Run the
#   §2e memory sweep FIRST — it is the cheapest and it can moot everything else."
#
# Sweeps OCR_FALLBACK_THRESHOLD (env var AutoFallbackOcrBackend reads — NO code
# change, NO rebuild) across a caller-supplied list of thresholds, running the
# real `auto` backend via ocr_bench_inner.py in a fresh ephemeral container per
# threshold, and prints rescue_fire_count alongside cgroup memory.peak and
# memory.events so the two can be plotted against each other.
#
# Bind-mounts the CURRENT apps/pdf-extractor/infrastructure/ tree read-only over
# /app/infrastructure so every run reflects HEAD (including the 2026-08-25
# orientation fix, not yet baked into any image) without a rebuild.
#
# Runs SEQUENTIALLY, deliberately — this host also runs the live pdf-extractor
# container and 12 other services in an 8 GiB Docker VM; concurrent ephemeral
# containers would perturb both this measurement and the live service.
#
# Usage:
#   bash scripts/audits/ocr-fallback-memory-sweep.sh <report_id_prefix> <pdf_path> <threshold> [<threshold> ...]
# Output: one line per threshold: threshold, rescue_fire_count, cgroup peak (after), events.max, events.oom_kill
# Never call during VN market hours (02:00-08:59 UTC weekdays).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ID_PREFIX="$1"; shift
PDF_PATH="$1"; shift
THRESHOLDS=("$@")

for T in "${THRESHOLDS[@]}"; do
  RID=$(uuidgen)
  NAME="ocr-mem-sweep-${T//[^0-9.]/-}-$$"
  echo "=== threshold=$T report_id=$RID ===" >&2
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  OUT=$(docker compose run --rm --no-deps \
    -e OCR_TEXT_BACKEND=auto \
    -e OCR_FALLBACK_THRESHOLD="$T" \
    -v "$PWD/scripts/audits/ocr_bench_inner.py:/tmp/ocr_bench_inner.py:ro" \
    -v "$PWD/apps/pdf-extractor/infrastructure:/app/infrastructure:ro" \
    --name "$NAME" \
    pdf-extractor \
    python3 -u /tmp/ocr_bench_inner.py "$RID" "$PDF_PATH" \
    2> >(sed "s/^/[t=$T] /" >&2) | grep "^OCR_BENCH_RESULT_JSON " || true)
  if [ -z "$OUT" ]; then
    echo "threshold=$T FAILED (no result line)" >&2
    continue
  fi
  echo "$OUT" | python3 -c "
import json, sys
line = sys.stdin.readline()
d = json.loads(line[len('OCR_BENCH_RESULT_JSON '):])
ev = d.get('cgroup_events', {})
print(f\"threshold=$T fires={d['rescue_fire_count']} fire_pages={d['rescue_fire_pages']} \"
      f\"peak={d['cgroup_after']['peak']} max_cap={d['cgroup_after']['max']} \"
      f\"events_max={ev.get('max')} events_oom_kill={ev.get('oom_kill')} \"
      f\"wall_s={d['wall_time_s']} table_phase_s={d['table_phase_s']}\")
"
done
