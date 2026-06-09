#!/usr/bin/env bash
# ci-per-file-isolation.sh — per-file process isolation runner for bun test
# Usage: cd apps/mcp-server && bash ../../scripts/ci-per-file-isolation.sh [P]
# P = parallelism (default 16)
# Outputs: aggregated pass/skip/fail to stdout + $GITHUB_STEP_SUMMARY (if set)
# Per-file results: /tmp/ci-isolation-<PID>/<file-slug>.json
# Host-safety: NEVER runs bare `bun test` (no file arg) — only per-file invocations

set -euo pipefail
P=${1:-16}
TESTDIR="src/__tests__"
RESULT_DIR="/tmp/ci-isolation-$$"
mkdir -p "$RESULT_DIR"

run_one_file() {
  local f="$1"
  local slug
  slug=$(echo "$f" | tr '/' '-' | tr '.' '-')
  local out_file="$RESULT_DIR/${slug}.json"
  local unique_db="/tmp/test_stock_price_$$.db"

  # Run bun test for this single file, capture output
  local raw
  if STOCK_PRICE_DB_PATH="$unique_db" bun test "$f" > "/tmp/ci-iso-out-$$.txt" 2>&1; then
    local rc=0
  else
    local rc=$?
  fi

  # Parse bun native summary line: "  N pass" / "  N skip" / "  N fail"
  # Anchor to leading-whitespace summary lines only; tail -1 collapses to one value;
  # strip non-digits + default 0 so printf never receives a multi-line or empty value.
  local pass skip fail
  pass=$(grep -E "^[[:space:]]*[0-9]+ pass" "/tmp/ci-iso-out-$$.txt" | \
         grep -oE "[0-9]+ pass" | grep -oE "^[0-9]+" | tail -1 || echo 0)
  pass=${pass//[^0-9]/}; pass=${pass:-0}
  skip=$(grep -E "^[[:space:]]*[0-9]+ skip" "/tmp/ci-iso-out-$$.txt" | \
         grep -oE "[0-9]+ skip" | grep -oE "^[0-9]+" | tail -1 || echo 0)
  skip=${skip//[^0-9]/}; skip=${skip:-0}
  fail=$(grep -E "^[[:space:]]*[0-9]+ fail" "/tmp/ci-iso-out-$$.txt" | \
         grep -oE "[0-9]+ fail" | grep -oE "^[0-9]+" | tail -1 || echo 0)
  fail=${fail//[^0-9]/}; fail=${fail:-0}

  # Write per-file JSON result
  printf '{"file":"%s","pass":%s,"skip":%s,"fail":%s,"rc":%s}\n' \
    "$f" "${pass:-0}" "${skip:-0}" "${fail:-0}" "$rc" > "$out_file"

  # If failed, preserve output for attribution
  if [ "$rc" -ne 0 ]; then
    cp "/tmp/ci-iso-out-$$.txt" "$RESULT_DIR/${slug}.log"
  fi
  rm -f "/tmp/ci-iso-out-$$.txt" "$unique_db"
}
export -f run_one_file
export RESULT_DIR

# Find all test files, run in parallel
find "$TESTDIR" -name "*.test.ts" | \
  xargs -P "$P" -I{} bash -c 'run_one_file "$@"' _ {}

# Aggregate results
TOTAL_PASS=0; TOTAL_SKIP=0; TOTAL_FAIL=0; FAILED_FILES=()
for f in "$RESULT_DIR"/*.json; do
  # Belt-and-suspenders: guard against any malformed per-file JSON (extractor fix is primary cure)
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
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "## Test Results (per-file isolation)" >> "$GITHUB_STEP_SUMMARY"
  echo "$SUMMARY" >> "$GITHUB_STEP_SUMMARY"
  if [ "${#FAILED_FILES[@]}" -gt 0 ]; then
    echo "### Failed files:" >> "$GITHUB_STEP_SUMMARY"
    printf -- '- %s\n' "${FAILED_FILES[@]}" >> "$GITHUB_STEP_SUMMARY"
  fi
fi

rm -rf "$RESULT_DIR"
[ "$TOTAL_FAIL" -eq 0 ]  # exit 1 if any failures
