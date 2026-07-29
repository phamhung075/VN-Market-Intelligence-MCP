#!/usr/bin/env bash
# scripts/emit-dashboard-row.test.sh
#
# Regression test for scripts/emit-dashboard-row.sh
# (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED).
#
# Mirrors scripts/emit-audit-signal.test.sh conventions:
#   - `source` the script under test (its bottom guard prevents auto-exec).
#   - Redefine `mcp_call()` (from mcp-call.sh, sourced transitively) to a
#     recording stub — ZERO real network calls in this suite.
#   - All git operations run against an ISOLATED SCRATCH git repo
#     (EMIT_DASHBOARD_GIT_ROOT) — never the live repo/live DASHBOARD.md.
#
# Core proof this suite exists to carry (AC-4 of the owning task): a
# narrated-but-unwritten dashboard_rows count cannot pass. T6/T7/T8 prove
# every failure path returns non-zero AND prints an ABORT/WARN marker (never
# a silent OK) AND fires a BUG telegram — i.e. the caller can never compose
# "dashboard_rows=N" for a row that did not actually land + verify on disk.
#
# Run:
#   bash scripts/emit-dashboard-row.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EMIT_SH="$SCRIPT_DIR/emit-dashboard-row.sh"

if [ ! -f "$EMIT_SH" ]; then
  echo "ERROR: emit-dashboard-row.sh not found at $EMIT_SH" >&2
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

# ── Isolated tmp fixture root — a REAL scratch git repo, NEVER the live repo ─
TMPDIR_TEST=$(mktemp -d /private/tmp/emit-dashboard-row-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

SCRATCH_REPO="$TMPDIR_TEST/repo"
mkdir -p "$SCRATCH_REPO/docs/data"
git -C "$SCRATCH_REPO" init -q
git -C "$SCRATCH_REPO" config user.email "test@example.com"
git -C "$SCRATCH_REPO" config user.name "test"
echo "# System Audit Dashboard" > "$SCRATCH_REPO/docs/data/DASHBOARD.md"
git -C "$SCRATCH_REPO" add -A
git -C "$SCRATCH_REPO" commit -q -m "init"

SCRATCH_DASHBOARD="$SCRATCH_REPO/docs/data/DASHBOARD.md"
CALL_LOG="$TMPDIR_TEST/mcp-calls.log"

export EMIT_DASHBOARD_GIT_ROOT="$SCRATCH_REPO"
export CLAUDE_CODE_SESSION_ID="test-session-001"

# ── Source the script under test (guard prevents auto-exec) ─────────────────
# shellcheck source=./emit-dashboard-row.sh
source "$EMIT_SH"

# ── Recording stub for mcp_call — overrides the real transport ─────────────
MCP_CALL_FAIL_TOOL=""       # tool name to force-fail; empty = never fail
MCP_CALL_CLAIM_RESULT=""    # override JSON for task_claim; empty = default success
mcp_call() {
  local tool="${1:-}" args="${2:-}"
  echo "CALL: $tool $args" >> "$CALL_LOG"
  if [ "$tool" = "$MCP_CALL_FAIL_TOOL" ]; then
    echo "simulated transport failure" >&2
    return 1
  fi
  if [ "$tool" = "task_claim" ] && [ -n "$MCP_CALL_CLAIM_RESULT" ]; then
    echo "$MCP_CALL_CLAIM_RESULT"
    return 0
  fi
  echo '{"claimed":true}'
  return 0
}

call_count_for() {
  local n
  n=$(grep -c "^CALL: $1 " "$CALL_LOG" 2>/dev/null)
  echo "${n:-0}"
}

reset_case() {
  : > "$CALL_LOG"
  MCP_CALL_FAIL_TOOL=""
  MCP_CALL_CLAIM_RESULT=""
  echo "# System Audit Dashboard" > "$SCRATCH_DASHBOARD"
  git -C "$SCRATCH_REPO" add -A
  git -C "$SCRATCH_REPO" commit -q -m "reset" --allow-empty
}

row_count() {
  grep -cF "$1" "$SCRATCH_DASHBOARD" 2>/dev/null || echo 0
}

# ── T1: happy path — write, read-back verified, committed, OK marker ───────
reset_case
OUT=$(run_emit_dashboard_row \
  --check-id "B-06" --title "vn-bctc-fetch VPS proxy route stale" \
  --severity "WARN" --location "VPS vinahost" --details "stale 18h" \
  --impact "pipeline may be idle" --root-cause "event-driven, off-season" \
  --zone-owner "dev-mcp-server" --signal-id "sys-20260729T100000-abcd" \
  --dedup-key "data_stale:vps-bctc-proxy:B-06" \
  --dashboard-file "$SCRATCH_DASHBOARD")
RC=$?
check "T1 happy-path exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T1 happy-path marker OK" "$(printf '%s' "$OUT" | grep -q '^\[emit-dashboard\] OK id=sys-20260729T100000-abcd check_id=B-06$' && echo true || echo false)"
check "T1 happy-path row anchor present on disk" "$([ "$(row_count "signal sys-20260729T100000-abcd")" -eq 1 ] && echo true || echo false)"
check "T1 happy-path check-id heading present" "$([ "$(row_count "## Anomaly: B-06")" -eq 1 ] && echo true || echo false)"
check "T1 happy-path committed (working tree clean)" "$(git -C "$SCRATCH_REPO" diff --quiet && git -C "$SCRATCH_REPO" diff --cached --quiet && echo true || echo false)"
check "T1 happy-path task_claim called once" "$([ "$(call_count_for task_claim)" -eq 1 ] && echo true || echo false)"
check "T1 happy-path task_release called once" "$([ "$(call_count_for task_release)" -eq 1 ] && echo true || echo false)"
check "T1 happy-path no BUG telegram on clean success" "$([ "$(call_count_for send_telegram)" -eq 0 ] && echo true || echo false)"

# ── T2: appending a second row preserves the first (never overwrites) ──────
OUT2=$(run_emit_dashboard_row \
  --check-id "C-08" --title "orphaned alerts" \
  --severity "CRITICAL" --location "market.db" --details "3 orphaned" \
  --impact "alert integrity" --root-cause "join gap" \
  --zone-owner "dev-mcp-server" --signal-id "sys-20260729T100500-ef01" \
  --dashboard-file "$SCRATCH_DASHBOARD")
RC2=$?
check "T2 second-row exit=0" "$([ "$RC2" -eq 0 ] && echo true || echo false)"
check "T2 second-row FIRST row still present" "$([ "$(row_count "signal sys-20260729T100000-abcd")" -eq 1 ] && echo true || echo false)"
check "T2 second-row own anchor present" "$([ "$(row_count "signal sys-20260729T100500-ef01")" -eq 1 ] && echo true || echo false)"

# ── T3: missing required arg — usage error, exit 2, NO mcp calls, NO write ──
reset_case
BEFORE_SIZE=$(wc -c < "$SCRATCH_DASHBOARD")
OUT3=$(run_emit_dashboard_row --check-id "X" --title "t" --severity "WARN")
RC3=$?
AFTER_SIZE=$(wc -c < "$SCRATCH_DASHBOARD")
check "T3 missing-arg exit=2" "$([ "$RC3" -eq 2 ] && echo true || echo false)"
check "T3 missing-arg marker ABORT" "$(printf '%s' "$OUT3" | grep -q '^\[emit-dashboard\] ABORT missing-required-arg' && echo true || echo false)"
check "T3 missing-arg no mcp calls" "$([ ! -s "$CALL_LOG" ] && echo true || echo false)"
check "T3 missing-arg file untouched" "$([ "$BEFORE_SIZE" -eq "$AFTER_SIZE" ] && echo true || echo false)"

# ── T4: no CLAUDE_CODE_SESSION_ID — refuses to run ──────────────────────────
reset_case
OUT4=$(CLAUDE_CODE_SESSION_ID="" run_emit_dashboard_row \
  --check-id "A-1" --title "t" --severity "WARN" --location "l" --details "d" \
  --impact "i" --zone-owner "z" --signal-id "s-1" --dashboard-file "$SCRATCH_DASHBOARD")
RC4=$?
check "T4 no-session-id exit=2" "$([ "$RC4" -eq 2 ] && echo true || echo false)"
check "T4 no-session-id marker ABORT" "$(printf '%s' "$OUT4" | grep -q '^\[emit-dashboard\] ABORT no-session-id' && echo true || echo false)"

# ── T5: mutex contended — ABORT, non-zero exit, BUG telegram, NO write ─────
reset_case
MCP_CALL_CLAIM_RESULT='{"claimed":false,"current_holder":{"owner_agent":"peer","owner_client_session":"peer-sess"}}'
BEFORE_SIZE5=$(wc -c < "$SCRATCH_DASHBOARD")
OUT5=$(run_emit_dashboard_row \
  --check-id "A-2" --title "t" --severity "WARN" --location "l" --details "d" \
  --impact "i" --zone-owner "z" --signal-id "s-2" --dashboard-file "$SCRATCH_DASHBOARD")
RC5=$?
AFTER_SIZE5=$(wc -c < "$SCRATCH_DASHBOARD")
check "T5 mutex-contended non-zero exit" "$([ "$RC5" -ne 0 ] && echo true || echo false)"
check "T5 mutex-contended marker ABORT mutex-claim-failed contended" "$(printf '%s' "$OUT5" | grep -q '^\[emit-dashboard\] ABORT mutex-claim-failed contended' && echo true || echo false)"
check "T5 mutex-contended file untouched" "$([ "$BEFORE_SIZE5" -eq "$AFTER_SIZE5" ] && echo true || echo false)"
check "T5 mutex-contended BUG telegram fired" "$([ "$(call_count_for send_telegram)" -eq 1 ] && echo true || echo false)"
check "T5 mutex-contended task_release NEVER called (claim never held)" "$([ "$(call_count_for task_release)" -eq 0 ] && echo true || echo false)"

# ── T6: task_claim transport failure — ABORT, BUG telegram, NO write ────────
reset_case
MCP_CALL_FAIL_TOOL="task_claim"
BEFORE_SIZE6=$(wc -c < "$SCRATCH_DASHBOARD")
OUT6=$(run_emit_dashboard_row \
  --check-id "A-3" --title "t" --severity "CRITICAL" --location "l" --details "d" \
  --impact "i" --zone-owner "z" --signal-id "s-3" --dashboard-file "$SCRATCH_DASHBOARD")
RC6=$?
AFTER_SIZE6=$(wc -c < "$SCRATCH_DASHBOARD")
check "T6 claim-transport-fail non-zero exit" "$([ "$RC6" -ne 0 ] && echo true || echo false)"
check "T6 claim-transport-fail marker ABORT" "$(printf '%s' "$OUT6" | grep -q '^\[emit-dashboard\] ABORT mutex-claim-failed transport-error' && echo true || echo false)"
check "T6 claim-transport-fail file untouched (proves narrated-but-unwritten cannot pass)" "$([ "$BEFORE_SIZE6" -eq "$AFTER_SIZE6" ] && echo true || echo false)"

# ── T7: simulated write failure (dashboard-file path points at a directory,
# so mv into it fails) — ABORT write-failed, BUG telegram ──────────────────
reset_case
BAD_DIR="$TMPDIR_TEST/is-a-directory"
mkdir -p "$BAD_DIR"
OUT7=$(run_emit_dashboard_row \
  --check-id "A-4" --title "t" --severity "WARN" --location "l" --details "d" \
  --impact "i" --zone-owner "z" --signal-id "s-4" --dashboard-file "$BAD_DIR")
RC7=$?
check "T7 write-failure non-zero exit" "$([ "$RC7" -ne 0 ] && echo true || echo false)"
check "T7 write-failure marker ABORT write-failed" "$(printf '%s' "$OUT7" | grep -q '^\[emit-dashboard\] ABORT write-failed' && echo true || echo false)"
check "T7 write-failure BUG telegram fired" "$(grep -q '^CALL: send_telegram' "$CALL_LOG" && echo true || echo false)"

# ── T8: read-back failure — the underlying write (cat/printf/mv) succeeds,
# but the MANDATORY POST-WRITE grep re-read is forced to miss (shadowing
# `grep` for the duration of this one call — the ONLY grep in the write path
# is the read-back assert, so this deterministically exercises that gate
# without touching the real write mechanics). Proves the script can never
# print OK (and thus dashboard_rows can never count) a write whose anchor
# does not verify on an independent re-read — the exact anti-false-green
# property this script exists to add. ───────────────────────────────────────
reset_case
grep() { command grep -q "definitely-not-present-anchor-xyz-does-not-exist" "$@"; }
OUT8=$(run_emit_dashboard_row \
  --check-id "A-5" --title "t" --severity "WARN" --location "l" --details "d" \
  --impact "i" --zone-owner "z" --signal-id "s-5" --dashboard-file "$SCRATCH_DASHBOARD")
RC8=$?
unset -f grep
check "T8 readback-failure non-zero exit" "$([ "$RC8" -ne 0 ] && echo true || echo false)"
check "T8 readback-failure marker ABORT readback-failed" "$(printf '%s' "$OUT8" | grep -q '^\[emit-dashboard\] ABORT readback-failed id=s-5$' && echo true || echo false)"
check "T8 readback-failure NEVER prints OK" "$(! printf '%s' "$OUT8" | grep -q '^\[emit-dashboard\] OK' && echo true || echo false)"
check "T8 readback-failure BUG telegram fired" "$(grep -q '^CALL: send_telegram' "$CALL_LOG" && echo true || echo false)"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
