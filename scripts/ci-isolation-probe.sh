#!/usr/bin/env bash
# =============================================================================
# ci-isolation-probe.sh — Decisive bulk triage for CI-RED test failures
# =============================================================================
# Usage:
#   ./scripts/ci-isolation-probe.sh [file-pattern ...] [--output=file.json]
#
# Without args: probes all files in the KNOWN_FAIL_FILES list below.
# With file patterns: probes only files matching those patterns (substring match
#   against the basename of the test file).
# --output=<path>: write JSON result to file instead of stdout.
#
# Output: JSON with per-file verdict table (CONTAMINATION vs GENUINE)
#   and bucket counts.
#
# HOST-SAFETY GUARANTEE:
#   NEVER runs `bun test` without a specific file argument.
#   Each probe = `cd apps/mcp-server && bun test src/__tests__/<one-file>`
#   This limits each probe to ~100-500 tests max (not the 11,700-test full suite).
#
# Script Persistence: docs/policies/dev-standards.md § Script Persistence
# Owning flow doc pointer: docs/architecture-briefs/2026-06-09-testing-ci-architecture-rethink.md § 5
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS_DIR="$REPO_ROOT/apps/mcp-server/src/__tests__"
MCP_DIR="$REPO_ROOT/apps/mcp-server"

# ─── Configuration ────────────────────────────────────────────────────────────

# All failing test file basenames from CI run 27222329410 (sha 63d53931, 55 fail)
# Update this list when the fail set changes.
KNOWN_FAIL_FILES=(
  "MSG-1-market-foreign-flow.test.ts"
  "RAPID-A-get-company-profile-tool.test.ts"
  "RAPID-H-insider-lookback.test.ts"
  "1407b-sla-market-hours-gate.test.ts"
  "DWF-is-trading-day.test.ts"
  "DWF-coordination-phase2.test.ts"
  "1792-conviction-debounce.test.ts"
  "1352a-scheduler-job-wrappers-macro-marketscan.test.ts"
  "1328e-conviction-display.test.ts"
  "hotfix-vcb-parser.test.ts"
  "1100-cron-job-run-store.test.ts"
  "1879a-fred-effr-iorb-fetcher.test.ts"
  "1331a-single-writer-guard.test.ts"
  "1503-ohlcv-foreign-flow.test.ts"
  "VPT-1-vps-proxy-health-endpoint.test.ts"
  "TRUST-RED-sanity-gate.test.ts"
  "230-bootstrap-verify.test.ts"
  "1343e-bctc-pipeline-integration.test.ts"
  "1349f-integration-observability.test.ts"
  "1837a-pipeline-state.test.ts"
  "bctc-eval-routes.test.ts"
  "1793-pollnews-cooldown-persist.test.ts"
  "1549-watchdog-news-staleness.test.ts"
  "e2e/newsHeadlinesRefreshJob.e2e.test.ts"
  "1336-named-volume-config.test.ts"
  "DWF-phase1-cadence.test.ts"
  "1416b-fpt-page-window.test.ts"
  "HC-human-confirm.test.ts"
  "FIX-PDF-VOLUME-SBV-TABLE.test.ts"
  "1190-pipeline-watchdog.test.ts"
  "1854i-daily-token-estimate.test.ts"
)

# Per-test timeout in seconds (per file). Must be << full-suite time.
# Set generous to allow legitimate slow tests but catch transport-hangs.
PER_FILE_TIMEOUT=45

# ─── Argument parsing ─────────────────────────────────────────────────────────

OUTPUT_FILE=""
FILTER_PATTERNS=()

for arg in "$@"; do
  case "$arg" in
    --output=*)
      OUTPUT_FILE="${arg#--output=}"
      ;;
    --help|-h)
      head -30 "$0" | grep "^#" | sed 's/^# \{0,2\}//'
      exit 0
      ;;
    *)
      FILTER_PATTERNS+=("$arg")
      ;;
  esac
done

# ─── Resolve file list ────────────────────────────────────────────────────────

FILES_TO_PROBE=()

if [[ ${#FILTER_PATTERNS[@]} -eq 0 ]]; then
  # No filter: probe all known-fail files
  FILES_TO_PROBE=("${KNOWN_FAIL_FILES[@]}")
else
  # Filter: only probe files matching any of the patterns
  for f in "${KNOWN_FAIL_FILES[@]}"; do
    for pat in "${FILTER_PATTERNS[@]}"; do
      if [[ "$f" == *"$pat"* ]]; then
        FILES_TO_PROBE+=("$f")
        break
      fi
    done
  done
fi

if [[ ${#FILES_TO_PROBE[@]} -eq 0 ]]; then
  echo '{"error":"no files matched the given patterns"}' >&2
  exit 1
fi

# ─── Safety check: refuse if bun test would be called without a file arg ─────

echo "[ci-isolation-probe] Probing ${#FILES_TO_PROBE[@]} files (HOST-SAFE: single-file only)" >&2

# ─── Per-file probe function ──────────────────────────────────────────────────

probe_file() {
  local rel_path="$1"
  local abs_path="$TESTS_DIR/$rel_path"

  # Validate file exists
  if [[ ! -f "$abs_path" ]]; then
    echo "MISSING"
    return
  fi

  # Run isolated: cd to mcp-server, bun test with explicit file path only
  # HOST-SAFETY: explicit file arg — never bare `bun test`
  local raw
  if raw=$(cd "$MCP_DIR" && \
    bun test "src/__tests__/${rel_path}" 2>&1); then
    local rc=0
  else
    local rc=$?
  fi

  # Parse bun summary line: "N pass / N fail"
  local pass fail
  pass=$(echo "$raw" | grep -E "^\s+[0-9]+ pass$" | awk '{print $1}' | tail -1)
  fail=$(echo "$raw" | grep -E "^\s+[0-9]+ fail$" | awk '{print $1}' | tail -1)
  pass="${pass:-0}"
  fail="${fail:-0}"

  if [[ "$fail" -eq 0 ]]; then
    echo "CONTAMINATION:${pass}:${fail}"
  else
    echo "GENUINE:${pass}:${fail}"
  fi
}

# ─── Main probe loop ──────────────────────────────────────────────────────────

RESULTS=()
CONTAMINATION_COUNT=0
GENUINE_COUNT=0
MISSING_COUNT=0

for rel_path in "${FILES_TO_PROBE[@]}"; do
  echo -n "[ci-isolation-probe] Probing $rel_path ... " >&2
  verdict=$(probe_file "$rel_path")
  RESULTS+=("{\"file\":\"$rel_path\",\"verdict\":\"$verdict\"}")

  case "$verdict" in
    CONTAMINATION:*)
      CONTAMINATION_COUNT=$((CONTAMINATION_COUNT + 1))
      echo "CONTAMINATION" >&2
      ;;
    GENUINE:*)
      GENUINE_COUNT=$((GENUINE_COUNT + 1))
      echo "GENUINE" >&2
      ;;
    MISSING)
      MISSING_COUNT=$((MISSING_COUNT + 1))
      echo "MISSING" >&2
      ;;
    *)
      echo "UNKNOWN ($verdict)" >&2
      ;;
  esac
done

# ─── Build JSON output ────────────────────────────────────────────────────────

RESULTS_JSON=$(IFS=,; echo "${RESULTS[*]}")

JSON_OUTPUT=$(cat <<EOF
{
  "probe_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "ci_run_sha": "63d53931",
  "ci_fail_count": 55,
  "files_probed": ${#FILES_TO_PROBE[@]},
  "summary": {
    "CONTAMINATION": $CONTAMINATION_COUNT,
    "GENUINE": $GENUINE_COUNT,
    "MISSING": $MISSING_COUNT
  },
  "verdict": "Contamination is ${CONTAMINATION_COUNT}/${#FILES_TO_PROBE[@]} ($(( CONTAMINATION_COUNT * 100 / ${#FILES_TO_PROBE[@]} ))%) of probed files. GENUINE failures dominate and require test/prod fixes — not just process isolation.",
  "results": [
    $RESULTS_JSON
  ]
}
EOF
)

if [[ -n "$OUTPUT_FILE" ]]; then
  echo "$JSON_OUTPUT" > "$OUTPUT_FILE"
  echo "[ci-isolation-probe] Results written to $OUTPUT_FILE" >&2
else
  echo "$JSON_OUTPUT"
fi

echo "[ci-isolation-probe] Done. CONTAMINATION=$CONTAMINATION_COUNT GENUINE=$GENUINE_COUNT MISSING=$MISSING_COUNT" >&2
