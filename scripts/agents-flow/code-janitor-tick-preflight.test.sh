#!/usr/bin/env bash
# scripts/agents-flow/code-janitor-tick-preflight.test.sh
#
# Regression test for FIX-CRON-CODEJANITOR-NO-PRESPAWN-GATE-BOOTS-FULL-SESSION-4X-DAILY —
# exercises the Branch A (src-diff) / Branch B (sweep-judgment) verdict paths of
# code-janitor-tick-preflight.sh via stubbed `_git_diff_src_files` / `_git_status_scoped` /
# `_run_*_sweep` / `_commit_paths` (function-override after sourcing, same pattern
# db-integrity-probe.test.sh / dev-team-tick-preflight.test.sh already use — NEVER
# exercises real git or the real sweep scripts against the live repo).
#
# Run:
#   bash scripts/agents-flow/code-janitor-tick-preflight.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREFLIGHT_SH="$SCRIPT_DIR/code-janitor-tick-preflight.sh"

if [ ! -f "$PREFLIGHT_SH" ]; then
  echo "ERROR: preflight script not found at $PREFLIGHT_SH" >&2
  exit 1
fi

PASS=0
FAIL=0

check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR_TEST=$(mktemp -d /private/tmp/code-janitor-preflight-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

export REPO_ROOT_OVERRIDE="$TMPDIR_TEST/fake-repo"
export VERDICT_FILE_PATH="$TMPDIR_TEST/code-janitor-tick-preflight-last-verdict.json"

# shellcheck source=./code-janitor-tick-preflight.sh
source "$PREFLIGHT_SH"

# ── Stub state (reset before every case) ──
STUB_DIFF_N=0
STUB_DIFF_RC=0
STUB_BEFORE_STATUS=""
STUB_AFTER_STATUS=""
STUB_MP_OUT=""
STUB_MP_RC=0
STUB_NL_OUT=""
STUB_NL_RC=0
STUB_CA_OUT=""
STUB_CA_RC=0
# `_commit_paths` calls are recorded to a FILE, not a variable — `run_and_capture`
# below captures run_preflight's stdout via `$(...)`, which forks the ENTIRE function
# (including every stubbed side-effecting call inside it) into a subshell; a variable
# mutation there is invisible once the subshell exits (same class of bug as the
# git-status call-counter above, confirmed live here too). A file write persists
# across that boundary.
COMMIT_LOG_FILE="$TMPDIR_TEST/commit-calls.log"

reset_stubs() {
  STUB_DIFF_N=0
  STUB_DIFF_RC=0
  STUB_BEFORE_STATUS=""
  STUB_AFTER_STATUS=""
  STUB_MP_OUT="[memory-prune-sweep] SUMMARY sessions_archived=0 health_deleted=0 session_logs_folded=0 scheduled_archived=0 signal_written=0"
  STUB_MP_RC=0
  STUB_NL_OUT="[notebook-linecap-sweep] SUMMARY checked=3 over_cap=0 pruned=0"
  STUB_NL_RC=0
  STUB_CA_OUT="[cold-archive-sweep] SKIP reason=not-first-of-month day=15"
  STUB_CA_RC=0
  : > "$COMMIT_LOG_FILE"
  rm -f "$VERDICT_FILE_PATH" 2>/dev/null
}

_git_diff_src_files() {
  [ "$STUB_DIFF_RC" -ne 0 ] && return 1
  printf '%s' "$STUB_DIFF_N"
  return 0
}

# Stubbed by explicit phase arg ("before"|"after") — NOT a mutable call-counter: a
# counter incremented inside this function would live only in the command-substitution
# subshell each separate `$(...)` call forks (confirmed live: the counter never
# advanced past 1 across the two calls, silently returning STUB_BEFORE_STATUS both
# times). The real script's own `_git_status_scoped` takes the same phase arg (and
# ignores it) for exactly this reason.
_git_status_scoped() {
  if [ "${1:-}" = "before" ]; then
    printf '%s' "$STUB_BEFORE_STATUS"
  else
    printf '%s' "$STUB_AFTER_STATUS"
  fi
}

_run_memory_prune_sweep() { printf '%s' "$STUB_MP_OUT"; return "$STUB_MP_RC"; }
_run_notebook_linecap_sweep() { printf '%s' "$STUB_NL_OUT"; return "$STUB_NL_RC"; }
_run_cold_archive_sweep() { printf '%s' "$STUB_CA_OUT"; return "$STUB_CA_RC"; }

_commit_paths() {
  printf '%s\n' "$*" >> "$COMMIT_LOG_FILE"
  return 0
}

run_and_capture() {
  OUT=$(run_preflight)
  RC=$?
  COMMIT_CALL_COUNT=$(wc -l < "$COMMIT_LOG_FILE" 2>/dev/null | tr -d ' ')
  [ -z "$COMMIT_CALL_COUNT" ] && COMMIT_CALL_COUNT=0
  COMMIT_CALL_LAST_ARGS=$(tail -1 "$COMMIT_LOG_FILE" 2>/dev/null)
}

# ── Case 1: Branch A — src diff non-empty -> SPAWN, sweeps never run, no commit ──
reset_stubs
STUB_DIFF_N=2
run_and_capture
check "Case1: Branch A verdict=SPAWN" "$([ "$(printf '%s' "$OUT" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"
check "Case1: Branch A exit code=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "Case1: Branch A sweeps_ran=false" "$([ "$(printf '%s' "$OUT" | jq -r '.sweeps_ran')" = "false" ] && echo true || echo false)"
check "Case1: Branch A detail mentions DRY scan" "$(printf '%s' "$OUT" | jq -r '.detail' | grep -q 'DRY scan needed' && echo true || echo false)"
check "Case1: Branch A never committed" "$([ "$COMMIT_CALL_COUNT" -eq 0 ] && echo true || echo false)"

# ── Case 2: git diff command itself fails -> fail-open SPAWN ──
reset_stubs
STUB_DIFF_RC=1
run_and_capture
check "Case2: git-diff fault -> SPAWN" "$([ "$(printf '%s' "$OUT" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"
check "Case2: git-diff fault detail says fail-open" "$(printf '%s' "$OUT" | jq -r '.detail' | grep -qi 'fail-open' && echo true || echo false)"

# ── Case 3: Branch B — diff empty, all 3 sweeps clean -> SKIP-SPAWN, exit 0 ──
reset_stubs
STUB_DIFF_N=0
run_and_capture
check "Case3: Branch B clean -> SKIP-SPAWN" "$([ "$(printf '%s' "$OUT" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"
check "Case3: Branch B clean exit code=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "Case3: Branch B sweeps_ran=true" "$([ "$(printf '%s' "$OUT" | jq -r '.sweeps_ran')" = "true" ] && echo true || echo false)"

# ── Case 4: SIGNAL-WRITTEN fires -> SPAWN, payload_ref captured ──
reset_stubs
STUB_DIFF_N=0
STUB_MP_OUT="[memory-prune-sweep] SIGNAL-WRITTEN path=docs/signals/janitor-health-recheck-writer-retired-2026-08-11.json
[memory-prune-sweep] SUMMARY sessions_archived=0 health_deleted=0 session_logs_folded=0 scheduled_archived=0 signal_written=1"
STUB_AFTER_STATUS="?? docs/signals/janitor-health-recheck-writer-retired-2026-08-11.json"
run_and_capture
check "Case4: SIGNAL-WRITTEN -> SPAWN" "$([ "$(printf '%s' "$OUT" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"
check "Case4: payload_ref captured verbatim" "$([ "$(printf '%s' "$OUT" | jq -r '.sweeps.memory_prune.payload_ref')" = "docs/signals/janitor-health-recheck-writer-retired-2026-08-11.json" ] && echo true || echo false)"
check "Case4: signal_written=true in verdict" "$([ "$(printf '%s' "$OUT" | jq -r '.sweeps.memory_prune.signal_written')" = "true" ] && echo true || echo false)"

# ── Case 5: notebook-linecap safe-fail fires -> SPAWN ──
reset_stubs
STUB_DIFF_N=0
STUB_NL_OUT="[notebook-linecap-sweep] NO-CHANGE path=docs/agent-memory/notebooks/foo.md lines=250 bytes=15000 reason=safe-fail-see-docs-signals-notebook-unparseable-or-single-section-breach
[notebook-linecap-sweep] SUMMARY checked=3 over_cap=1 pruned=0"
run_and_capture
check "Case5: notebook safe-fail -> SPAWN" "$([ "$(printf '%s' "$OUT" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"

# ── Case 6: cold-archive po-decisions safe-fail fires -> SPAWN ──
reset_stubs
STUB_DIFF_N=0
STUB_CA_OUT="[cold-archive-sweep] START month=2026-08 handoffs_max_age=30 sessions_max_age=30
[cold-archive-sweep] OVER-CAP path=docs/agent-memory/decisions/po-decisions.md lines=250 cap=200
[cold-archive-sweep] NO-CHANGE path=docs/agent-memory/decisions/po-decisions.md lines=250 reason=safe-fail-see-docs-signals-notebook-unparseable-or-single-section-breach
[cold-archive-sweep] SUMMARY handoffs_archived=0 handoffs_skipped_referenced=0 sessions_archived=0 po_decisions_pruned=0"
run_and_capture
check "Case6: cold-archive po-decisions safe-fail -> SPAWN" "$([ "$(printf '%s' "$OUT" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"

# ── Case 7: Cold Archive non-trivial monthly leg -> SPAWN ──
reset_stubs
STUB_DIFF_N=0
STUB_CA_OUT="[cold-archive-sweep] START month=2026-08 handoffs_max_age=30 sessions_max_age=30
[cold-archive-sweep] ARCHIVED path=docs/handoffs/old.md -> docs/handoffs/archive/2026-08/old.md
[cold-archive-sweep] SUMMARY handoffs_archived=1 handoffs_skipped_referenced=0 sessions_archived=0 po_decisions_pruned=0"
STUB_AFTER_STATUS=" D docs/handoffs/old.md
?? docs/handoffs/archive/2026-08/old.md"
run_and_capture
check "Case7: Cold Archive non-trivial -> SPAWN" "$([ "$(printf '%s' "$OUT" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"
check "Case7: cold_archive.non_trivial=true" "$([ "$(printf '%s' "$OUT" | jq -r '.sweeps.cold_archive.non_trivial')" = "true" ] && echo true || echo false)"
check "Case7: committed delta paths (old+new)" "$([ "$COMMIT_CALL_COUNT" -eq 1 ] && echo true || echo false)"

# ── Case 8: sweep script exec itself fails (non-zero rc) -> fail-open SPAWN ──
reset_stubs
STUB_DIFF_N=0
STUB_NL_RC=1
run_and_capture
check "Case8: sweep exec fault -> SPAWN" "$([ "$(printf '%s' "$OUT" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"
check "Case8: sweep exec fault detail says fail-open" "$(printf '%s' "$OUT" | jq -r '.detail' | grep -qi 'fail-open' && echo true || echo false)"

# ── Case 9: Branch B clean commits ONLY the delta, not pre-existing dirty paths ──
reset_stubs
STUB_DIFF_N=0
STUB_BEFORE_STATUS=" M docs/agent-memory/notebooks/unrelated-agent.md"
STUB_AFTER_STATUS=" M docs/agent-memory/notebooks/unrelated-agent.md
?? docs/agent-memory/sessions/archive/2026-07-20-foo.md"
STUB_MP_OUT="[memory-prune-sweep] ARCHIVED path=docs/agent-memory/sessions/2026-07-20-foo.md -> docs/agent-memory/sessions/archive/2026-07-20-foo.md
[memory-prune-sweep] SUMMARY sessions_archived=1 health_deleted=0 session_logs_folded=0 scheduled_archived=0 signal_written=0"
run_and_capture
check "Case9: commit called once for the real delta" "$([ "$COMMIT_CALL_COUNT" -eq 1 ] && echo true || echo false)"
check "Case9: commit args exclude the pre-existing unrelated dirty path" "$(printf '%s' "$COMMIT_CALL_LAST_ARGS" | grep -q 'unrelated-agent.md' && echo false || echo true)"
check "Case9: commit args include the newly-archived path" "$(printf '%s' "$COMMIT_CALL_LAST_ARGS" | grep -q '2026-07-20-foo.md' && echo true || echo false)"

# ── Case 10: verdict file written atomically and readable ──
reset_stubs
STUB_DIFF_N=0
run_and_capture
check "Case10: verdict file exists after run" "$([ -s "$VERDICT_FILE_PATH" ] && echo true || echo false)"
check "Case10: verdict file verdict matches stdout" "$([ "$(jq -r '.verdict' "$VERDICT_FILE_PATH" 2>/dev/null)" = "$(printf '%s' "$OUT" | jq -r '.verdict')" ] && echo true || echo false)"

# ── Case 11: stdout is exactly one line of JSON (no progress leakage) ──
reset_stubs
STUB_DIFF_N=0
run_and_capture
check "Case11: stdout is single-line JSON" "$([ "$(printf '%s' "$OUT" | wc -l | tr -d ' ')" -le 1 ] && echo true || echo false)"
check "Case11: stdout parses as valid JSON" "$(printf '%s' "$OUT" | jq -e . >/dev/null 2>&1 && echo true || echo false)"

echo ""
echo "== code-janitor-tick-preflight.test.sh: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
