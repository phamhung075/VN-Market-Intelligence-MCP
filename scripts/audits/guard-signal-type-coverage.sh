#!/usr/bin/env bash
# scripts/audits/guard-signal-type-coverage.sh
#
# Regression verifier for docs/agents/po/flow/triage-signals.md § Regression
# verifier — signal-type coverage guard (`guard_signal_type_coverage`).
#
# ROOT CAUSE THIS SCRIPT FIXES (FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE,
# 2026-08-22): the guard existed ONLY as a bash function embedded inline in
# the flow-doc's markdown — wired into NO CI job and NO cron, so nothing ever
# executed it. Its last recorded PASS was 2026-08-01; by 2026-08-22 the live
# `to==po` type namespace had fully rotated underneath it (5 new detector
# types — auditor_cycle_loss, auditor_cycle_missing, cron_fire_gap,
# db_freshness, narrative_contradiction — none in the old hardcoded array,
# 10/10 hot rows unrouted) and nobody noticed for 3 weeks because the check
# was pure prose, never actually run. This script IS the same check,
# extracted to an executable file and wired into
# .github/workflows/ci.yml (`signal-type-coverage-guard` job) so it runs on
# every push/PR that touches the tracked files below.
#
# SCOPE — Pipeline B only (`.signal_queue.rows[]`, `to=="po"`, stored in
# docs/data/orch/orch-state.json, which IS git-tracked). Pipeline A's source
# (docs/signals/signals.db, fed by scripts/agents-flow/drain-signals.js) is
# gitignored (*.db) and does not exist in a fresh CI checkout, so it cannot
# be verified here — that side of the fix is the route-by-`to` fallback
# described in triage-signals.md's Pipeline-A table (the "any unknown type"
# row), which structurally covers every type with a resolvable `to` rather
# than requiring per-type enumeration; see docs/agent-memory/notebooks/
# developer.md for the one-time live sqlite3 cross-check performed at fix
# time (`SELECT type, COUNT(*) FROM signals_processed GROUP BY type`).
#
# NO HAND-MAINTAINED $ROUTED ARRAY: unlike the original embedded function,
# this script does not hardcode a duplicate allowlist. It PARSES the `type`
# column directly out of docs/agents/po/flow/triage-signals.md's
# "## Live `.signal_queue.rows[]` inbox" table AND its lazy-load sibling
# triage-signals-longtail.md's table. That hand-copied duplicate array is
# exactly what let 5 new live types go unrouted for 3 weeks with a stale
# "PASS" still on record — deriving the allowlist from the docs themselves
# means adding a table row is now sufficient BY ITSELF to extend guard
# coverage; there is no second array to remember to edit.
#
# Usage:
#   bash scripts/audits/guard-signal-type-coverage.sh --check [orch-state-path]
#   bash scripts/audits/guard-signal-type-coverage.sh          [orch-state-path]  # same behaviour, --check optional
# Exit: 0 = pass (every live to==po type is routed), 1 = fail (unrouted
#       type(s) found, or one of the source docs could not be parsed).
#
# Env overrides (test-only; unset in normal/CI use — mirrors
# size-lint-justification.sh's SIZE_LINT_*_OVERRIDE convention, lets the
# paired .test.sh point at disposable fixture docs instead of the real,
# ever-changing production tables):
#   GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE     default: docs/agents/po/flow/triage-signals.md
#   GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE   default: docs/agents/po/flow/triage-signals-longtail.md

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TRIAGE_DOC="${GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE:-$REPO_ROOT/docs/agents/po/flow/triage-signals.md}"
LONGTAIL_DOC="${GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE:-$REPO_ROOT/docs/agents/po/flow/triage-signals-longtail.md}"

# First positional arg may be "--check" (CI-invocation convention shared with
# size-lint-justification.sh etc.) — accepted and ignored as a no-op flag
# since this script has only one mode. Remaining arg (if any) overrides the
# orch-state.json path (test fixtures).
ORCH_STATE="$REPO_ROOT/docs/data/orch/orch-state.json"
for arg in "$@"; do
  case "$arg" in
    --check) ;;
    *) ORCH_STATE="$arg" ;;
  esac
done

[ -f "$TRIAGE_DOC" ]    || { echo "FATAL: $TRIAGE_DOC not found" >&2; exit 1; }
[ -f "$LONGTAIL_DOC" ]  || { echo "FATAL: $LONGTAIL_DOC not found" >&2; exit 1; }
[ -f "$ORCH_STATE" ]    || { echo "FATAL: $ORCH_STATE not found" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "FATAL: jq not found in PATH" >&2; exit 1; }

# Extract the `type` column from a markdown table read on stdin: lines
# shaped "| `some_type` | ... |" -> "some_type". Drops the header row's
# literal "type" token (the column name itself, e.g. "| `type` | From | ... |").
extract_type_column() {
  grep -E '^\| `[^`]+` \|' | sed -E 's/^\| `([^`]+)`.*/\1/' | grep -v '^type$' || true
}

# Pipeline-B table in triage-signals.md lives between the
# "## Live `.signal_queue.rows[]` inbox" heading and the
# "### Regression verifier" heading immediately below it — scope the
# extraction to that range so Pipeline-A's table (same file, backtick-quoted
# first column, different pipeline) is never mixed in.
pipeline_b_section() {
  awk '
    /^## Live/ { flag=1 }
    flag && /^### Regression verifier/ { exit }
    flag { print }
  ' "$TRIAGE_DOC"
}

ROUTED_MAIN=$(pipeline_b_section | extract_type_column)
ROUTED_LONGTAIL=$(extract_type_column < "$LONGTAIL_DOC")

if [ -z "$ROUTED_MAIN" ]; then
  echo "FATAL: parsed zero types out of $TRIAGE_DOC § Live .signal_queue.rows[] inbox — table markup drifted, fix the parser or the table" >&2
  exit 1
fi

ROUTED_JSON=$(printf '%s\n%s\n' "$ROUTED_MAIN" "$ROUTED_LONGTAIL" | grep -v '^[[:space:]]*$' | sort -u | jq -R . | jq -s .)

UNROUTED=$(jq -c --argjson routed "$ROUTED_JSON" '
  [.signal_queue.rows[]? | select(.to=="po") | .type] | unique
  | map(select(. as $t | ($routed | index($t)) == null))
' "$ORCH_STATE")

LIVE_COUNT=$(jq '[.signal_queue.rows[]? | select(.to=="po") | .type] | unique | length' "$ORCH_STATE")

if [ "$UNROUTED" != "[]" ]; then
  echo "[guard-signal-type-coverage] FAIL — unrouted to=po types: $UNROUTED" >&2
  echo "[guard-signal-type-coverage] add a table row to docs/agents/po/flow/triage-signals.md (§ Live .signal_queue.rows[] inbox) or its longtail sibling for each type above." >&2
  exit 1
fi

echo "[guard-signal-type-coverage] PASS — all $LIVE_COUNT live to=po type(s) routed ($(echo "$ROUTED_JSON" | jq 'length') types known to the two docs)"
exit 0
