#!/usr/bin/env bash
# =============================================================================
# scripts/test/orch-cold-evict-tests.sh
# Integration test suite for scripts/orch-cold-evict.sh
# =============================================================================
# Task:   D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND
# Sprint: BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP
# Brief:  docs/architecture-briefs/2026-07-10-backlog-hygiene-verify-prune-sweep.md §8 (D4 row)
#
# No prior test file existed for scripts/orch-cold-evict.sh (R-HIGH-1: sole
# SSOT eviction script). This suite covers the NEW Pass-1 category added by
# D4 (terminal-status eviction from the flat task lanes {backlog, review, qa,
# in_progress, ready} into the cold archive's `.backlog_detail[]` field), plus
# a regression check that the pre-existing done[]/done_verified[]/sprint
# eviction paths still function alongside it.
#
# COVERS (per task spec):
#   (1) evict correctness on a fixture
#   (2) non-terminal rows are skipped
#   (3) --exclude-ids is honored (both `--exclude-ids X` and repeated flag)
#   (4) idempotent re-run is a no-op
#   (5) conservation guard still fires correctly through this new path
#   (6) --dry-run doesn't mutate anything
#
# SAFETY: every test uses ORCH_STATE + ARCHIVE_DIR env overrides pointing at
# a throwaway fixture dir under mktemp. The REAL docs/data/orch/orch-state.json
# and docs/data/orch/archive/ are NEVER touched — a hash of the real live file
# is captured before and asserted after every test to prove this (mirrors
# scripts/test/orch-apply-wrapper-tests.sh's pattern).
# =============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COLD_EVICT_SH="$REPO_ROOT/scripts/orch-cold-evict.sh"
APPLY_SH="$REPO_ROOT/scripts/orch-apply.sh"
VALIDATOR="$REPO_ROOT/scripts/orch-validate.mjs"
REAL_LIVE="$REPO_ROOT/docs/data/orch/orch-state.json"

# ─── Preflight ────────────────────────────────────────────────────────────────
[ -f "$COLD_EVICT_SH" ] || { echo "FATAL: $COLD_EVICT_SH not found"; exit 1; }
[ -f "$APPLY_SH" ]      || { echo "FATAL: $APPLY_SH not found"; exit 1; }
[ -f "$VALIDATOR" ]     || { echo "FATAL: $VALIDATOR not found"; exit 1; }
[ -f "$REAL_LIVE" ]     || { echo "FATAL: $REAL_LIVE not found"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "FATAL: bun not found in PATH"; exit 1; }
command -v jq  >/dev/null 2>&1 || { echo "FATAL: jq not found in PATH"; exit 1; }
command -v sha256sum >/dev/null 2>&1 || \
  { command -v shasum >/dev/null 2>&1 || { echo "FATAL: sha256sum/shasum not found"; exit 1; }; }

# ─── Checksum helper (macOS + Linux portable) ─────────────────────────────────
file_hash() {
  if [ ! -f "$1" ]; then echo "MISSING"; return; fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# ─── Counters ─────────────────────────────────────────────────────────────────
PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n' "$1"; }

# ─── Real-live hash snapshot (must be unchanged after every test) ─────────────
REAL_HASH_BEFORE=$(file_hash "$REAL_LIVE")
assert_real_live_unchanged() {
  local label="$1"
  local now
  now=$(file_hash "$REAL_LIVE")
  if [ "$REAL_HASH_BEFORE" = "$now" ]; then
    pass "$label — REAL live orch-state.json UNCHANGED"
  else
    fail "$label — REAL live orch-state.json CHANGED (CRITICAL)"
  fi
}

# ─── Throwaway fixture root ────────────────────────────────────────────────────
FIXTURE_ROOT=$(mktemp -d "/tmp/orch-cold-evict-test-XXXXXX")
trap 'rm -rf "$FIXTURE_ROOT"' EXIT

MONTH="$(date -u +%Y-%m)"

# Build a fresh fixture dir "$1" with hot=orch-state.json (content = "$2") and
# an empty archive/ dir. Sets HOT_PATH / ARCHIVE_PATH globals.
# NOTE: must be called as a plain command (NOT the RHS of a pipe) — bash runs
# each pipeline stage in its own subshell, which would make the HOT_PATH/
# ARCHIVE_PATH global assignments invisible to the caller.
new_fixture() {
  local name="$1"
  local content="$2"
  local dir="$FIXTURE_ROOT/$name"
  rm -rf "$dir"
  mkdir -p "$dir/archive"
  HOT_PATH="$dir/orch-state.json"
  ARCHIVE_PATH="$dir/archive"
  printf '%s' "$content" > "$HOT_PATH"
}

# Minimal-but-realistic fixture: 5 backlog rows (2 terminal DONE/CANCELLED +
# 1 excludable DONE + 1 non-terminal BACKLOG + 1 non-terminal BLOCKED),
# 2 review rows (1 terminal DONE_VERIFIED + 1 non-terminal REVIEW),
# 1 in_progress row (non-terminal). qa/ready empty.
BASE_FIXTURE='{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {
    "backlog": [
      {"id":"BL-DONE-1","status":"DONE"},
      {"id":"BL-CANCELLED-1","status":"CANCELLED"},
      {"id":"BL-BACKLOG-1","status":"BACKLOG"},
      {"id":"BL-BLOCKED-1","status":"BLOCKED"},
      {"id":"BL-EXCLUDE-1","status":"DONE"}
    ],
    "review": [
      {"id":"RV-DV-1","status":"DONE_VERIFIED"},
      {"id":"RV-REVIEW-1","status":"REVIEW"}
    ],
    "qa": [],
    "in_progress": [{"id":"IP-1","status":"IN_PROGRESS"}],
    "ready": [],
    "done": [],
    "done_verified": [],
    "active_sprints": []
  },
  "signal_queue": {"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]},
  "sprint_goal": {"entries": []}
}'

run_cold_evict() {
  # $@ = extra args (--dry-run, --exclude-ids ..., etc.)
  ORCH_STATE="$HOT_PATH" ARCHIVE_DIR="$ARCHIVE_PATH" bash "$COLD_EVICT_SH" "$@" >"$FIXTURE_ROOT/.last-stdout" 2>"$FIXTURE_ROOT/.last-stderr"
}

# =============================================================================
# TEST 1 + 2 — evict correctness + non-terminal rows skipped
# =============================================================================
new_fixture "t1-evict-correctness" "$BASE_FIXTURE"
EXIT_T1=0
run_cold_evict --exclude-ids BL-EXCLUDE-1 || EXIT_T1=$?

if [ "$EXIT_T1" -eq 0 ]; then
  pass "T1 — live run exits 0"
else
  fail "T1 — expected exit 0, got $EXIT_T1 ($(cat "$FIXTURE_ROOT/.last-stderr" | tail -3))"
fi

# (1) evict correctness: terminal rows removed from hot backlog/review
HOT_BACKLOG_IDS=$(jq -c '[.task_board.backlog[].id] | sort' "$HOT_PATH")
HOT_REVIEW_IDS=$(jq -c '[.task_board.review[].id] | sort' "$HOT_PATH")
if [ "$HOT_BACKLOG_IDS" = '["BL-BACKLOG-1","BL-BLOCKED-1","BL-EXCLUDE-1"]' ]; then
  pass "T1 — hot backlog[] has terminal DONE/CANCELLED rows removed (exclude honored, non-terminal kept)"
else
  fail "T1 — hot backlog[] unexpected: $HOT_BACKLOG_IDS"
fi
if [ "$HOT_REVIEW_IDS" = '["RV-REVIEW-1"]' ]; then
  pass "T1 — hot review[] has terminal DONE_VERIFIED row removed"
else
  fail "T1 — hot review[] unexpected: $HOT_REVIEW_IDS"
fi

# (2) non-terminal rows skipped: BLOCKED/BACKLOG/REVIEW/IN_PROGRESS still present with original status
BL_BLOCKED_STATUS=$(jq -r '.task_board.backlog[] | select(.id=="BL-BLOCKED-1") | .status' "$HOT_PATH")
IP1_STATUS=$(jq -r '.task_board.in_progress[] | select(.id=="IP-1") | .status' "$HOT_PATH")
if [ "$BL_BLOCKED_STATUS" = "BLOCKED" ] && [ "$IP1_STATUS" = "IN_PROGRESS" ]; then
  pass "T2 — non-terminal rows (BLOCKED/IN_PROGRESS) left untouched in hot"
else
  fail "T2 — non-terminal rows mutated (BL-BLOCKED-1=$BL_BLOCKED_STATUS, IP-1=$IP1_STATUS)"
fi

# Cold sink: evicted rows landed in .backlog_detail[], NOT the excluded one
COLD_FILE="$ARCHIVE_PATH/$MONTH.json"
COLD_IDS=$(jq -c '[.backlog_detail[].id] | sort' "$COLD_FILE" 2>/dev/null)
if [ "$COLD_IDS" = '["BL-CANCELLED-1","BL-DONE-1","RV-DV-1"]' ]; then
  pass "T1 — cold .backlog_detail[] contains exactly the 3 evicted rows (excluded row absent)"
else
  fail "T1 — cold .backlog_detail[] unexpected: $COLD_IDS"
fi

# Cold-file structural sentinel still intact (done_tasks/closed_sprints/signal_rows keys)
COLD_SENTINEL=$(jq -e '.month and .done_tasks and .closed_sprints and .signal_rows and .backlog_detail' "$COLD_FILE" >/dev/null 2>&1 && echo ok || echo bad)
if [ "$COLD_SENTINEL" = "ok" ]; then
  pass "T1 — cold file retains full sentinel schema (done_tasks/closed_sprints/signal_rows/backlog_detail)"
else
  fail "T1 — cold file sentinel broken"
fi

assert_real_live_unchanged "T1/T2"

# =============================================================================
# TEST 3 — --exclude-ids honored (repeated-flag form + comma-separated form)
# =============================================================================
new_fixture "t3-exclude-repeated" "$BASE_FIXTURE"
EXIT_T3A=0
run_cold_evict --exclude-ids BL-DONE-1 --exclude-ids BL-CANCELLED-1 --exclude-ids BL-EXCLUDE-1 || EXIT_T3A=$?
if [ "$EXIT_T3A" -eq 0 ]; then
  pass "T3a — repeated --exclude-ids flag: live run exits 0"
else
  fail "T3a — expected exit 0, got $EXIT_T3A"
fi
T3A_BACKLOG_IDS=$(jq -c '[.task_board.backlog[].id] | sort' "$HOT_PATH")
if [ "$T3A_BACKLOG_IDS" = '["BL-BACKLOG-1","BL-BLOCKED-1","BL-CANCELLED-1","BL-DONE-1","BL-EXCLUDE-1"]' ]; then
  pass "T3a — all 3 excluded DONE/CANCELLED rows retained in hot (repeated flag honored)"
else
  fail "T3a — unexpected backlog after all-excluded run: $T3A_BACKLOG_IDS"
fi

new_fixture "t3-exclude-csv" "$BASE_FIXTURE"
EXIT_T3B=0
run_cold_evict --exclude-ids=BL-DONE-1,BL-CANCELLED-1,BL-EXCLUDE-1 || EXIT_T3B=$?
if [ "$EXIT_T3B" -eq 0 ]; then
  pass "T3b — comma-separated --exclude-ids=A,B,C: live run exits 0"
else
  fail "T3b — expected exit 0, got $EXIT_T3B"
fi
T3B_BACKLOG_IDS=$(jq -c '[.task_board.backlog[].id] | sort' "$HOT_PATH")
if [ "$T3B_BACKLOG_IDS" = '["BL-BACKLOG-1","BL-BLOCKED-1","BL-CANCELLED-1","BL-DONE-1","BL-EXCLUDE-1"]' ]; then
  pass "T3b — all 3 excluded DONE/CANCELLED rows retained in hot (CSV form honored)"
else
  fail "T3b — unexpected backlog after CSV-excluded run: $T3B_BACKLOG_IDS"
fi
assert_real_live_unchanged "T3"

# =============================================================================
# TEST 4 — idempotent re-run is a no-op
# =============================================================================
new_fixture "t4-idempotent" "$BASE_FIXTURE"
run_cold_evict --exclude-ids BL-EXCLUDE-1
HASH_HOT_1=$(file_hash "$HOT_PATH")
HASH_COLD_1=$(file_hash "$ARCHIVE_PATH/$MONTH.json")

EXIT_T4=0
run_cold_evict --exclude-ids BL-EXCLUDE-1 || EXIT_T4=$?
if [ "$EXIT_T4" -eq 0 ]; then
  pass "T4 — second run exits 0"
else
  fail "T4 — expected exit 0 on re-run, got $EXIT_T4"
fi

HASH_HOT_2=$(file_hash "$HOT_PATH")
HASH_COLD_2=$(file_hash "$ARCHIVE_PATH/$MONTH.json")

if [ "$HASH_HOT_1" = "$HASH_HOT_2" ]; then
  pass "T4 — hot file byte-identical after idempotent re-run"
else
  fail "T4 — hot file CHANGED on re-run (not idempotent)"
fi
if [ "$HASH_COLD_1" = "$HASH_COLD_2" ]; then
  pass "T4 — cold file byte-identical after idempotent re-run (no duplicate archive rows)"
else
  fail "T4 — cold file CHANGED on re-run (duplicate archival — not idempotent)"
fi
assert_real_live_unchanged "T4"

# =============================================================================
# TEST 5 — conservation guard still fires correctly through this new path
# =============================================================================
# Fixture: 20 backlog rows (16 terminal DONE, 4 non-terminal BACKLOG) — evicting
# the 16 shrinks task_total 20 -> 4 (< 0.5 floor, live >= 10 baseline) — a
# genuine conservation violation driven ENTIRELY by the new flat-task-lane pass.
N_TERMINAL=16
N_KEEP=4
CONSERVATION_FIXTURE=$(jq -n --argjson nt "$N_TERMINAL" --argjson nk "$N_KEEP" '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {
    "backlog": ([range($nt) | {id: ("POP-DONE-" + (.|tostring)), status:"DONE"}]
               + [range($nk) | {id: ("POP-BACKLOG-" + (.|tostring)), status:"BACKLOG"}]),
    "review": [], "qa": [], "in_progress": [], "ready": [], "done": [], "done_verified": [],
    "active_sprints": []
  },
  "signal_queue": {"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]},
  "sprint_goal": {"entries": []}
}')
new_fixture "t5-conservation" "$CONSERVATION_FIXTURE"

# CONTROL: apply the equivalent post-eviction candidate directly via orch-apply.sh
# WITHOUT ORCH_APPLY_ALLOW_SHRINK -- must be REJECTED. Proves the guard is
# genuinely engaged against this shape of change (not vacuously passing).
CONTROL_CANDIDATE=$(jq '.task_board.backlog = [.task_board.backlog[] | select(.status=="BACKLOG")]
                        | ._meta.updated_at = "2026-06-01T00:01:00Z"' "$HOT_PATH")
EXIT_CONTROL=0
printf '%s' "$CONTROL_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$HOT_PATH" bash "$APPLY_SH" >/dev/null 2>&1 \
  || EXIT_CONTROL=$?
if [ "$EXIT_CONTROL" -eq 1 ]; then
  pass "T5 — control (no bypass, direct orch-apply.sh): conservation guard REJECTS this reduction — exit 1"
else
  fail "T5 — control expected exit 1, got $EXIT_CONTROL (fixture does not genuinely trip the floor — test bug)"
fi
CONTROL_BACKLOG_N=$(jq '.task_board.backlog | length' "$HOT_PATH")
if [ "$CONTROL_BACKLOG_N" -eq $((N_TERMINAL + N_KEEP)) ]; then
  pass "T5 — control rejection left hot file UNCHANGED (backlog still $((N_TERMINAL + N_KEEP)))"
else
  fail "T5 — control rejection did not prevent mutation (backlog=$CONTROL_BACKLOG_N)"
fi

# ACTUAL: run the real orch-cold-evict.sh (bypass baked in) -- must SUCCEED and
# actually perform the reduction, proving the bypass correctly propagates to
# this new eviction path (not silently exempted or silently blocked).
EXIT_T5=0
run_cold_evict || EXIT_T5=$?
if [ "$EXIT_T5" -eq 0 ]; then
  pass "T5 — orch-cold-evict.sh (bypass honored) — exit 0"
else
  fail "T5 — expected exit 0, got $EXIT_T5 ($(cat "$FIXTURE_ROOT/.last-stderr" | tail -5))"
fi
FINAL_BACKLOG_N=$(jq '.task_board.backlog | length' "$HOT_PATH" 2>/dev/null || echo -1)
if [ "$FINAL_BACKLOG_N" -eq "$N_KEEP" ]; then
  pass "T5 — hot backlog[] correctly shrunk to $N_KEEP (16 terminal rows evicted via bypass)"
else
  fail "T5 — expected backlog length $N_KEEP, got $FINAL_BACKLOG_N"
fi
COLD_N=$(jq '.backlog_detail | length' "$ARCHIVE_PATH/$MONTH.json" 2>/dev/null || echo -1)
if [ "$COLD_N" -eq "$N_TERMINAL" ]; then
  pass "T5 — cold .backlog_detail[] received all $N_TERMINAL evicted rows"
else
  fail "T5 — expected $N_TERMINAL rows in backlog_detail[], got $COLD_N"
fi
assert_real_live_unchanged "T5"

# =============================================================================
# TEST 6 — --dry-run does not mutate anything
# =============================================================================
new_fixture "t6-dry-run" "$BASE_FIXTURE"
HASH_HOT_BEFORE_DRY=$(file_hash "$HOT_PATH")
COLD_FILE_T6="$ARCHIVE_PATH/$MONTH.json"
COLD_EXISTED_BEFORE=$([ -f "$COLD_FILE_T6" ] && echo yes || echo no)

EXIT_T6=0
run_cold_evict --dry-run --exclude-ids BL-EXCLUDE-1 || EXIT_T6=$?
if [ "$EXIT_T6" -eq 0 ]; then
  pass "T6 — --dry-run exits 0"
else
  fail "T6 — expected exit 0, got $EXIT_T6"
fi

HASH_HOT_AFTER_DRY=$(file_hash "$HOT_PATH")
if [ "$HASH_HOT_BEFORE_DRY" = "$HASH_HOT_AFTER_DRY" ]; then
  pass "T6 — hot file byte-identical after --dry-run"
else
  fail "T6 — hot file CHANGED by --dry-run (CRITICAL)"
fi

COLD_EXISTS_AFTER=$([ -f "$COLD_FILE_T6" ] && echo yes || echo no)
if [ "$COLD_EXISTED_BEFORE" = "no" ] && [ "$COLD_EXISTS_AFTER" = "no" ]; then
  pass "T6 — cold archive file NOT created by --dry-run"
else
  fail "T6 — cold archive file state changed by --dry-run (before=$COLD_EXISTED_BEFORE after=$COLD_EXISTS_AFTER)"
fi

# Preview output must mention the new eviction category (regression guard:
# proves the dry-run report line was actually wired, not silently omitted).
if grep -q "flat task lanes" "$FIXTURE_ROOT/.last-stdout" "$FIXTURE_ROOT/.last-stderr" 2>/dev/null; then
  pass "T6 — dry-run preview output includes the new flat-task-lane eviction line"
else
  fail "T6 — dry-run preview output missing the new flat-task-lane eviction line"
fi

assert_real_live_unchanged "T6"

# =============================================================================
# Summary
# =============================================================================
TOTAL=$((PASS+FAIL))
printf '\n─── orch-cold-evict-tests results ───\n'
printf 'PASS: %d / %d\n' "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  printf 'FAIL: %d / %d\n' "$FAIL" "$TOTAL"
  exit 1
fi
exit 0
