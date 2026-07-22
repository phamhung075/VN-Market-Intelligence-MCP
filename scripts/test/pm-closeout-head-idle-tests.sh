#!/usr/bin/env bash
# =============================================================================
# scripts/test/pm-closeout-head-idle-tests.sh
# Integration test suite for scripts/pm-closeout-head-idle.jq
# =============================================================================
# Task: UC-DTL-P9 (sprint ULTRACODE-AUDIT-FIXALL)
# Mirrors scripts/test/orch-apply-wrapper-tests.sh's fixture-isolation pattern.
#
# COVERS (3 mandatory head cases from the task spec, + 1 refuse-guard case):
#   CASE-A  head belongs to the closing sprint  -> sprint DONE, head idled
#   CASE-B  head.active_task_id is null         -> sprint DONE, head idled
#   CASE-C  head belongs to a DIFFERENT sprint  -> sprint DONE, head UNTOUCHED
#   CASE-D  sprint_id not found in active_sprints[] -> error(), non-zero exit,
#           fixture file left untouched (refuse, no silent no-op)
#
# SAFETY: every test runs orch-apply.sh with ORCH_APPLY_LIVE_FILE_OVERRIDE
# pointing at a throwaway fixture under mktemp. The REAL
# docs/data/orch/orch-state.json is NEVER touched — a hash is captured before
# and asserted after every test to prove this.
# =============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
JQ_FILTER="$REPO_ROOT/scripts/pm-closeout-head-idle.jq"
APPLY_SH="$REPO_ROOT/scripts/orch-apply.sh"
REAL_LIVE="$REPO_ROOT/docs/data/orch/orch-state.json"

[ -f "$JQ_FILTER" ] || { echo "FATAL: $JQ_FILTER not found"; exit 1; }
[ -f "$APPLY_SH" ]  || { echo "FATAL: $APPLY_SH not found"; exit 1; }
[ -f "$REAL_LIVE" ] || { echo "FATAL: $REAL_LIVE not found"; exit 1; }

file_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n' "$1"; }

REAL_HASH_BEFORE=$(file_hash "$REAL_LIVE")

FIXTURE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/pm-closeout-test-XXXXXX")
trap 'rm -rf "$FIXTURE_DIR"' EXIT
FIXTURE_LIVE="$FIXTURE_DIR/orch-state.json"

NOW="2026-07-23T00:00:00Z"
SPRINT_ID="BCTC-ANALYTICS-LAYER"

run_filter() {
  # $1 = fixture json path to read; result piped into orch-apply.sh against FIXTURE_LIVE
  jq --arg sprint_id "$SPRINT_ID" --arg now "$NOW" -f "$JQ_FILTER" "$1" \
    | ORCH_APPLY_LIVE_FILE_OVERRIDE="$FIXTURE_LIVE" bash "$APPLY_SH"
}

# ─── CASE-A: head belongs to the closing sprint -> idled ────────────────────
cp "$REAL_LIVE" "$FIXTURE_LIVE"
TASK_ID=$(jq -r --arg sid "$SPRINT_ID" '.task_board.active_sprints[] | select(.id==$sid) | .tasks[0].id' "$FIXTURE_LIVE")
jq --arg tid "$TASK_ID" '.head.active_task_id = $tid | .head.status = "in_progress"' "$FIXTURE_LIVE" > "$FIXTURE_DIR/case-a-pre.json"
mv "$FIXTURE_DIR/case-a-pre.json" "$FIXTURE_LIVE"
if run_filter "$FIXTURE_LIVE" >"$FIXTURE_DIR/case-a.out" 2>&1; then
  STATUS=$(jq -r --arg sid "$SPRINT_ID" '.task_board.active_sprints[] | select(.id==$sid) | .status' "$FIXTURE_LIVE")
  HEAD_STATUS=$(jq -r '.head.status' "$FIXTURE_LIVE")
  HEAD_TASK=$(jq -r '.head.active_task_id' "$FIXTURE_LIVE")
  if [ "$STATUS" = "DONE" ] && [ "$HEAD_STATUS" = "idle" ] && [ "$HEAD_TASK" = "null" ]; then
    pass "CASE-A head-belongs-to-sprint -> sprint DONE, head idled"
  else
    fail "CASE-A unexpected result: sprint=$STATUS head.status=$HEAD_STATUS head.active_task_id=$HEAD_TASK"
  fi
else
  fail "CASE-A orch-apply.sh exited non-zero: $(cat "$FIXTURE_DIR/case-a.out")"
fi

# ─── CASE-B: head.active_task_id is null -> idled ────────────────────────────
cp "$REAL_LIVE" "$FIXTURE_LIVE"
jq '.head.active_task_id = null | .head.status = "idle"' "$FIXTURE_LIVE" > "$FIXTURE_DIR/case-b-pre.json"
mv "$FIXTURE_DIR/case-b-pre.json" "$FIXTURE_LIVE"
if run_filter "$FIXTURE_LIVE" >"$FIXTURE_DIR/case-b.out" 2>&1; then
  STATUS=$(jq -r --arg sid "$SPRINT_ID" '.task_board.active_sprints[] | select(.id==$sid) | .status' "$FIXTURE_LIVE")
  HEAD_STATUS=$(jq -r '.head.status' "$FIXTURE_LIVE")
  HEAD_UPDATED_BY=$(jq -r '.head.updated_by' "$FIXTURE_LIVE")
  if [ "$STATUS" = "DONE" ] && [ "$HEAD_STATUS" = "idle" ] && [ "$HEAD_UPDATED_BY" = "pm" ]; then
    pass "CASE-B head-null -> sprint DONE, head idled (updated_by=pm)"
  else
    fail "CASE-B unexpected result: sprint=$STATUS head.status=$HEAD_STATUS head.updated_by=$HEAD_UPDATED_BY"
  fi
else
  fail "CASE-B orch-apply.sh exited non-zero: $(cat "$FIXTURE_DIR/case-b.out")"
fi

# ─── CASE-C: head belongs to a DIFFERENT sprint's task -> untouched ─────────
cp "$REAL_LIVE" "$FIXTURE_LIVE"
OTHER_TASK_ID=$(jq -r '.task_board.in_progress[0].id' "$FIXTURE_LIVE")
OTHER_HEAD_BEFORE=$(jq -c '.head' "$FIXTURE_LIVE")
if run_filter "$FIXTURE_LIVE" >"$FIXTURE_DIR/case-c.out" 2>&1; then
  STATUS=$(jq -r --arg sid "$SPRINT_ID" '.task_board.active_sprints[] | select(.id==$sid) | .status' "$FIXTURE_LIVE")
  OTHER_HEAD_AFTER=$(jq -c '.head' "$FIXTURE_LIVE")
  if [ "$STATUS" = "DONE" ] && [ "$OTHER_HEAD_BEFORE" = "$OTHER_HEAD_AFTER" ]; then
    pass "CASE-C head-other-sprint (active_task_id=$OTHER_TASK_ID) -> sprint DONE, head UNTOUCHED"
  else
    fail "CASE-C unexpected result: sprint=$STATUS head_before=$OTHER_HEAD_BEFORE head_after=$OTHER_HEAD_AFTER"
  fi
else
  fail "CASE-C orch-apply.sh exited non-zero: $(cat "$FIXTURE_DIR/case-c.out")"
fi

# ─── CASE-D: sprint_id not found -> refuse (error), fixture untouched ───────
cp "$REAL_LIVE" "$FIXTURE_LIVE"
PRE_HASH=$(file_hash "$FIXTURE_LIVE")
if jq --arg sprint_id "NO-SUCH-SPRINT-XYZ" --arg now "$NOW" -f "$JQ_FILTER" "$FIXTURE_LIVE" \
     2>"$FIXTURE_DIR/case-d.err" | ORCH_APPLY_LIVE_FILE_OVERRIDE="$FIXTURE_LIVE" bash "$APPLY_SH" >/dev/null 2>>"$FIXTURE_DIR/case-d.err"; then
  fail "CASE-D expected non-zero exit (missing sprint), got success"
else
  POST_HASH=$(file_hash "$FIXTURE_LIVE")
  if [ "$PRE_HASH" = "$POST_HASH" ] && grep -q "not found in task_board.active_sprints" "$FIXTURE_DIR/case-d.err"; then
    pass "CASE-D missing-sprint -> error() refuse, fixture untouched"
  else
    fail "CASE-D refuse-guard did not behave as expected (hash changed or wrong error text)"
  fi
fi

# ─── Prove the REAL live file was never touched by any test above ──────────
REAL_HASH_AFTER=$(file_hash "$REAL_LIVE")
if [ "$REAL_HASH_BEFORE" = "$REAL_HASH_AFTER" ]; then
  pass "REAL orch-state.json hash unchanged across all tests"
else
  fail "REAL orch-state.json hash CHANGED — safety invariant violated"
fi

echo "----------------------------------------"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
