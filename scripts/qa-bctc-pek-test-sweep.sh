#!/usr/bin/env bash
# qa-bctc-pek-test-sweep.sh — per-file isolation runner scoped to BCTC/PEK test files
# Usage: cd apps/mcp-server && bash ../../scripts/qa-bctc-pek-test-sweep.sh [P] [FILTER]
# P      = parallelism (default 16)
# FILTER = case-insensitive filename substring, comma-separated (default "bctc,pek")
# Outputs: aggregated pass/skip/fail to stdout
# Per-file results: /tmp/qa-bctc-sweep-<PID>/<file-slug>.json
# Host-safety: NEVER runs bare `bun test` (no file arg) — only per-file invocations
# (same discipline as scripts/ci-per-file-isolation.sh, scoped down for QA re-verification
# of BCTC/PEK-touching sprint tasks instead of the full test corpus.)

set -euo pipefail
P=${1:-16}
FILTER=${2:-"bctc,pek"}
TESTDIR="src/__tests__"
RESULT_DIR="/tmp/qa-bctc-sweep-$$"
mkdir -p "$RESULT_DIR"

run_one_file() {
  local f="$1"
  local slug
  slug=$(echo "$f" | tr '/' '-' | tr '.' '-')
  local out_file="$RESULT_DIR/${slug}.json"
  local unique_db="/tmp/test_$$_stock_price.db"

  # NOTE: no external `timeout` wrapper — neither GNU `timeout` nor `gtimeout`
  # is guaranteed present on this host (macOS without coreutils). Bounding is
  # left to bun's own per-test timeouts, same as scripts/ci-per-file-isolation.sh.
  local rc
  if STOCK_PRICE_DB_PATH="$unique_db" bun test "$f" > "/tmp/qa-bctc-sweep-out-$$.txt" 2>&1; then
    rc=0
  else
    rc=$?
  fi

  local pass skip fail
  pass=$(grep -E "^[[:space:]]*[0-9]+ pass" "/tmp/qa-bctc-sweep-out-$$.txt" | \
         grep -oE "[0-9]+ pass" | grep -oE "^[0-9]+" | tail -1 || echo 0)
  pass=${pass//[^0-9]/}; pass=${pass:-0}
  skip=$(grep -E "^[[:space:]]*[0-9]+ skip" "/tmp/qa-bctc-sweep-out-$$.txt" | \
         grep -oE "[0-9]+ skip" | grep -oE "^[0-9]+" | tail -1 || echo 0)
  skip=${skip//[^0-9]/}; skip=${skip:-0}
  fail=$(grep -E "^[[:space:]]*[0-9]+ fail" "/tmp/qa-bctc-sweep-out-$$.txt" | \
         grep -oE "[0-9]+ fail" | grep -oE "^[0-9]+" | tail -1 || echo 0)
  fail=${fail//[^0-9]/}; fail=${fail:-0}

  printf '{"file":"%s","pass":%s,"skip":%s,"fail":%s,"rc":%s}\n' \
    "$f" "${pass:-0}" "${skip:-0}" "${fail:-0}" "$rc" > "$out_file"

  if [ "$rc" -ne 0 ]; then
    cp "/tmp/qa-bctc-sweep-out-$$.txt" "$RESULT_DIR/${slug}.log"
  fi
  rm -f "/tmp/qa-bctc-sweep-out-$$.txt" "$unique_db"
}
export -f run_one_file
export RESULT_DIR

# Build -iname args from comma-separated FILTER
IFS=',' read -ra TERMS <<< "$FILTER"
FIND_ARGS=()
for t in "${TERMS[@]}"; do
  if [ "${#FIND_ARGS[@]}" -gt 0 ]; then FIND_ARGS+=(-o); fi
  FIND_ARGS+=(-iname "*${t}*")
done

find "$TESTDIR" -maxdepth 1 -type f -name "*.test.ts" \( "${FIND_ARGS[@]}" \) | sort | \
  xargs -P "$P" -I{} bash -c 'run_one_file "$@"' _ {}

TOTAL_PASS=0; TOTAL_SKIP=0; TOTAL_FAIL=0; FAILED_FILES=()
for f in "$RESULT_DIR"/*.json; do
  if ! jq -e . "$f" >/dev/null 2>&1; then
    echo "WARN: malformed result $f, counting as 1 fail" >&2
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
    FAILED_FILES+=("$f")
    continue
  fi
  p=$(jq -r '.pass' "$f"); s=$(jq -r '.skip' "$f"); fl=$(jq -r '.fail' "$f")
  TOTAL_PASS=$((TOTAL_PASS + p))
  TOTAL_SKIP=$((TOTAL_SKIP + s))
  TOTAL_FAIL=$((TOTAL_FAIL + fl))
  if [ "$fl" -gt 0 ]; then
    FAILED_FILES+=("$(jq -r '.file' "$f")")
  fi
done

SUMMARY="  ${TOTAL_PASS} pass / ${TOTAL_SKIP} skip / ${TOTAL_FAIL} fail"
echo "$SUMMARY"
if [ "${#FAILED_FILES[@]}" -gt 0 ]; then
  echo "=== FAILED FILES (${#FAILED_FILES[@]}) ==="
  printf 'FAILEDFILE: %s\n' "${FAILED_FILES[@]}" | sort -u
  echo "=== END FAILED FILES ==="
fi

rm -rf "$RESULT_DIR"
[ "$TOTAL_FAIL" -eq 0 ]
