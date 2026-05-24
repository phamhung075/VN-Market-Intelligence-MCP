#!/usr/bin/env bash
# sandbox/rerun.sh — Edit-Rerun Handler (P1-E2)
#
# Re-triggers sandbox/runner.py for a given scenario and writes the trace JSON
# into dashboard/traces/ so the dashboard can pick it up on reload.
#
# Usage (run from repo root):
#   PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh \
#       --tier=primitive \
#       --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json
#
# Or from apps/pdf-extractor/:
#   PYTHONPATH=. bash sandbox/rerun.sh \
#       --tier=primitive \
#       --scenario=scenarios/primitives/validate_financial_figures/happy.json
#
# Exit codes:
#   0 — scenario PASS (trace written to dashboard/traces/)
#   1 — scenario FAIL or runner error
#
# Security clause (G7):
#   This script inherits the caller's environment.
#   It must be called with zero DB/VPS/OCR credentials in env.

set -uo pipefail
# NOTE: -e is intentionally omitted so we can capture runner exit code even on FAIL.

TIER=""
SCENARIO=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier=*)
      TIER="${1#--tier=}"
      shift
      ;;
    --tier)
      TIER="$2"
      shift 2
      ;;
    --scenario=*)
      SCENARIO="${1#--scenario=}"
      shift
      ;;
    --scenario)
      SCENARIO="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TIER" || -z "$SCENARIO" ]]; then
  echo "Usage: $0 --tier=<primitive|module|service> --scenario=<path-to-scenario.json>" >&2
  exit 1
fi

# Resolve script directory to locate runner.py regardless of CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$SCRIPT_DIR/runner.py"

# Resolve absolute scenario path.
SCENARIO_ABS="$(realpath "$SCENARIO")"
SCENARIO_DIR="$(dirname "$SCENARIO_ABS")"
TARGET_NAME="$(basename "$SCENARIO_DIR")"  # e.g. validate_financial_figures

# Dashboard traces dir: sibling of sandbox/ → dashboard/traces/<tier>/
DASHBOARD_DIR="$(dirname "$SCRIPT_DIR")/dashboard"
TRACES_DIR="$DASHBOARD_DIR/traces/$TIER"
mkdir -p "$TRACES_DIR"

TRACE_FILE="$TRACES_DIR/${TARGET_NAME}.json"

echo "--- rerun.sh ---" >&2
echo "tier:     $TIER" >&2
echo "scenario: $SCENARIO_ABS" >&2
echo "trace:    $TRACE_FILE" >&2

# Run the scenario, write trace, capture exit code.
# Redirect stdout to both the trace file (tee) and to a temp variable for echo.
TMPFILE="$(mktemp)"
PYTHONPATH="${PYTHONPATH:-$(dirname "$SCRIPT_DIR")}" python3 "$RUNNER" \
    --tier="$TIER" \
    --scenario="$SCENARIO_ABS" > "$TMPFILE"
RUNNER_EXIT=$?

cp "$TMPFILE" "$TRACE_FILE"
rm -f "$TMPFILE"

echo "trace written → $TRACE_FILE" >&2
cat "$TRACE_FILE"

# Regenerate dashboard/traces.js so index.html works under file:// (double-click).
# <script src="traces.js"> is not subject to fetch() CORS restriction that blocks
# file:// origins in Chrome/Safari. gen_traces_js.py reads all existing trace JSONs
# and emits window.__TRACES = {...} into dashboard/traces.js.
GEN_SCRIPT="$SCRIPT_DIR/gen_traces_js.py"
if [[ -f "$GEN_SCRIPT" ]]; then
  python3 "$GEN_SCRIPT" >&2
else
  echo "WARNING: gen_traces_js.py not found at $GEN_SCRIPT — traces.js not regenerated" >&2
fi

exit $RUNNER_EXIT
