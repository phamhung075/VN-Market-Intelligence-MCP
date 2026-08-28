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
# TEST 7 — FIX-COLDEVICT-DONE-LANE-TRIGGER-ACTION-AXIS-NOOP regression:
#   (A) done[] sort_by is a STRING sort on .created_at — a poison non-ISO
#       string (e.g. "unknown") string-sorts ABOVE every real ISO date and
#       ranks as NEWEST after reverse, permanently un-evictable. Fixed sort
#       must treat any unparseable created_at as epoch 0 (OLDEST), matching
#       the age-gate's own `try fromdateiso8601 catch 0` convention (line
#       ~245) so a poison row can never rank ahead of a genuinely recent row.
#   (C) compute_id_maps' done_verified[]/signal_queue.archive[] id-extraction
#       shape `[<array> // [] | .[].id // ""]` yields `[""]` (length 1) on a
#       genuinely EMPTY array — jq's `//` substitutes when the LHS pipeline
#       produces ZERO outputs, and `.[]` over an empty array produces zero
#       outputs, so the empty-array case is misreported as "1 item". This
#       corrupts exactly the report AC(1)'s biconditional trigger reads.
# =============================================================================
POISON_FIXTURE=$(jq -n --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {
    "backlog": [], "review": [], "qa": [], "in_progress": [], "ready": [],
    # FIX-ORCH-COLD-EVICT-VALIDATION-EXIT1 test-repair (2026-08-29): rows must
    # be DONE_VERIFIED, NOT DONE — FIX-DONELANE (407afb6a4, 2026-08-23) made
    # `.status == "DONE"` rows in done[] permanently unevictable by design
    # (they are the unverified rows the Done-Lane Drain exists to reach), so a
    # DONE-status fixture silently stopped exercising the poison-sort
    # predicate this regression guards. DONE_VERIFIED is the sole status still
    # eligible for age/rank eviction from done[] — the sort/age assertions
    # below are unchanged in intent.
    "done": [
      {"id":"DONE-POISON","status":"DONE_VERIFIED","created_at":"unknown",
       "verification":{"raw_probe":{"tool":"fixture","args":"fixture","live_value_observed":"fixture","observed_at":"2026-06-01T00:00:00Z"}}},
      {"id":"DONE-RECENT","status":"DONE_VERIFIED","created_at":$now,
       "verification":{"raw_probe":{"tool":"fixture","args":"fixture","live_value_observed":"fixture","observed_at":"2026-06-01T00:00:00Z"}}}
    ],
    "done_verified": [],
    "active_sprints": []
  },
  "signal_queue": {"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[],"archive":[]},
  "sprint_goal": {"entries": []}
}')
new_fixture "t7-poison-sort" "$POISON_FIXTURE"

# (C) dry-run must report 0, not the phantom 1, for done_verified[]/archive[]
# when they are genuinely empty — this must be verified BEFORE (A)/(1) per
# the task row's acceptance ordering (the (A) assertions below read the same
# report machinery).
EXIT_T7_DRY=0
KEEP_RECENT_DONE=1 run_cold_evict --dry-run || EXIT_T7_DRY=$?
if [ "$EXIT_T7_DRY" -eq 0 ]; then
  pass "T7 — dry-run (poison fixture) exits 0"
else
  fail "T7 — expected exit 0, got $EXIT_T7_DRY"
fi
DV_N=$(grep -E 'done_verified\[\]' "$FIXTURE_ROOT/.last-stderr" | grep -oE '[0-9]+' | head -1)
if [ "$DV_N" = "0" ]; then
  pass "T7 — (C) done_verified[] dry-run reports 0 (not phantom 1) when genuinely empty"
else
  fail "T7 — (C) done_verified[] dry-run reports '$DV_N', expected 0"
fi
SIGARCH_N=$(grep -E 'signal_queue\.archive\[\] evict' "$FIXTURE_ROOT/.last-stderr" | grep -oE '[0-9]+' | head -1)
if [ "$SIGARCH_N" = "0" ]; then
  pass "T7 — (C) signal_queue.archive[] dry-run reports 0 (not phantom 1) when genuinely empty"
else
  fail "T7 — (C) signal_queue.archive[] dry-run reports '$SIGARCH_N', expected 0"
fi
assert_real_live_unchanged "T7-dry"

# (A) LIVE run with keep_n=1: DONE-POISON ("unknown") must sort as OLDEST ->
# evicted; DONE-RECENT (today) must sort as NEWEST -> rank 0 < keep_n=1,
# protected regardless of age (this is also the AC(4) negative control: a
# genuinely recent row within keep_n survives even when keep_n is squeezed
# to 1 specifically to force the poison row's rank below the window).
EXIT_T7_LIVE=0
KEEP_RECENT_DONE=1 run_cold_evict || EXIT_T7_LIVE=$?
if [ "$EXIT_T7_LIVE" -eq 0 ]; then
  pass "T7 — (A) live run (keep_n=1) exits 0"
else
  fail "T7 — expected exit 0, got $EXIT_T7_LIVE ($(cat "$FIXTURE_ROOT/.last-stderr" | tail -5))"
fi
T7_HOT_DONE_IDS=$(jq -c '[.task_board.done[].id] | sort' "$HOT_PATH" 2>/dev/null)
if [ "$T7_HOT_DONE_IDS" = '["DONE-RECENT"]' ]; then
  pass "T7 — (A) poison created_at sorts as OLDEST: DONE-POISON evicted, DONE-RECENT (rank 0) kept"
else
  fail "T7 — (A) unexpected hot done[] after keep_n=1 run: $T7_HOT_DONE_IDS (poison must evict, recent must survive)"
fi
T7_COLD_DONE=$(jq -c '[.done_tasks[].id] | sort' "$ARCHIVE_PATH/$MONTH.json" 2>/dev/null)
if [ "$T7_COLD_DONE" = '["DONE-POISON"]' ]; then
  pass "T7 — (A) cold .done_tasks[] contains exactly the poison row"
else
  fail "T7 — (A) cold .done_tasks[] unexpected: $T7_COLD_DONE"
fi
assert_real_live_unchanged "T7-live"

# =============================================================================
# TEST 8 — FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE / P7: decision_journal[]
#   age-gated eviction — rank-gate, age-gate (independent of rank), null-ts
#   eviction, and INDEX-based hot removal correctness under reordering (evicted
#   rows are NOT contiguous in the original array: idx 0,2,4 evicted while
#   idx 1,3,5 survive — proves removal is keyed by the right original index,
#   not by post-sort position).
# =============================================================================
DJ_NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DJ_D1=$(date -u -v-1d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)
DJ_D10=$(date -u -v-10d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 days ago' +%Y-%m-%dT%H:%M:%SZ)
DJ_D20=$(date -u -v-20d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '20 days ago' +%Y-%m-%dT%H:%M:%SZ)
DJ_D30=$(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)

# Original array order (deliberately NOT rank order): OLD-2, NEW-1, NULL-1,
# RECENT-RANKED-OUT, OLD-1, NEW-2 — indices 0..5.
DJ_FIXTURE=$(jq -n \
  --arg d30 "$DJ_D30" --arg now "$DJ_NOW" --arg d10 "$DJ_D10" \
  --arg d20 "$DJ_D20" --arg d1 "$DJ_D1" \
  '{
    "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
    "head": {"status":"idle","active_task_id":null,"next_agent":null},
    "task_board": {
      "backlog": [], "review": [], "qa": [], "in_progress": [], "ready": [],
      "done": [], "done_verified": [], "active_sprints": []
    },
    "signal_queue": {"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]},
    "sprint_goal": {"entries": []},
    "decision_journal": [
      {"id":"DJ-OLD-2","ts":$d30},
      {"id":"DJ-NEW-1","ts":$now},
      {"id":"DJ-NULL-1","ts":null},
      {"id":"DJ-RECENT-RANKED-OUT","ts":$d10},
      {"id":"DJ-OLD-1","ts":$d20},
      {"id":"DJ-NEW-2","ts":$d1}
    ]
  }')
new_fixture "t8-decision-journal" "$DJ_FIXTURE"

EXIT_T8=0
DECISION_JOURNAL_KEEP_RECENT=2 DECISION_JOURNAL_MAX_AGE_DAYS=14 run_cold_evict || EXIT_T8=$?
if [ "$EXIT_T8" -eq 0 ]; then
  pass "T8 — decision_journal live run (keep=2, max_age=14d) exits 0"
else
  fail "T8 — expected exit 0, got $EXIT_T8 ($(cat "$FIXTURE_ROOT/.last-stderr" | tail -5))"
fi

# rank0/1 (NEW-1, NEW-2) always kept; RECENT-RANKED-OUT kept by age-gate
# despite rank>=keep_n; OLD-1/OLD-2/NULL-1 evicted (age>cutoff or ts null).
HOT_DJ_IDS=$(jq -c '[.decision_journal[].id] | sort' "$HOT_PATH")
if [ "$HOT_DJ_IDS" = '["DJ-NEW-1","DJ-NEW-2","DJ-RECENT-RANKED-OUT"]' ]; then
  pass "T8 — hot decision_journal[] keeps rank<keep_n rows + age-gate survivor, evicts the rest"
else
  fail "T8 — hot decision_journal[] unexpected: $HOT_DJ_IDS"
fi

COLD_FILE_T8="$ARCHIVE_PATH/$MONTH.json"
COLD_DJ_IDS=$(jq -c '[(.decision_journal // [])[].id] | sort' "$COLD_FILE_T8" 2>/dev/null)
if [ "$COLD_DJ_IDS" = '["DJ-NULL-1","DJ-OLD-1","DJ-OLD-2"]' ]; then
  pass "T8 — cold .decision_journal[] contains exactly the 3 evicted rows (null-ts + both age-expired)"
else
  fail "T8 — cold .decision_journal[] unexpected: $COLD_DJ_IDS"
fi

# Idempotent re-run: with only 3 rows left (2 within keep_n, 1 protected by
# age-gate), a second run must evict nothing further and leave both files
# byte-identical.
HASH_HOT_T8_1=$(file_hash "$HOT_PATH")
HASH_COLD_T8_1=$(file_hash "$COLD_FILE_T8")
EXIT_T8B=0
DECISION_JOURNAL_KEEP_RECENT=2 DECISION_JOURNAL_MAX_AGE_DAYS=14 run_cold_evict || EXIT_T8B=$?
if [ "$EXIT_T8B" -eq 0 ]; then
  pass "T8 — second (idempotent) run exits 0"
else
  fail "T8 — expected exit 0 on re-run, got $EXIT_T8B"
fi
HASH_HOT_T8_2=$(file_hash "$HOT_PATH")
HASH_COLD_T8_2=$(file_hash "$COLD_FILE_T8")
if [ "$HASH_HOT_T8_1" = "$HASH_HOT_T8_2" ] && [ "$HASH_COLD_T8_1" = "$HASH_COLD_T8_2" ]; then
  pass "T8 — hot + cold byte-identical after idempotent re-run (age-gate survivor stable)"
else
  fail "T8 — hot or cold CHANGED on decision_journal re-run (not idempotent)"
fi

assert_real_live_unchanged "T8"

# =============================================================================
# TEST 9 — FIX-COLDEVICT-SIGNALQUEUE-NO-AGE-GATE-ORPHANS-READ-ROWS: signal_queue
#   .rows[] eviction must be status IN (TERMINAL_SIGNAL_STATUSES) AND ts older
#   than SIGNAL_MAX_AGE_HOURS (default 24h) — previously status-only, no .ts
#   term at all, so a row could be cold-evicted the SAME tick it was flipped to
#   a terminal status (3/3 confirmed live incidents silently orphaned
#   po-addressed escalations before po ever triaged them — memory
#   feedback_coldevict_no_age_gate_orphans_unread_po_escalation.md). Covers:
#   fresh terminal-status row survives, aged terminal-status row evicts, a
#   status=NEW row is NEVER evicted regardless of age (pre-existing rule, must
#   not regress), null .ts is treated as unknown-age == oldest (same
#   convention as done[]/decision_journal[] above) so a poison row can never
#   become permanently un-evictable.
# =============================================================================
SIG_NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SIG_73H=$(date -u -v-73H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '73 hours ago' +%Y-%m-%dT%H:%M:%SZ)
SIG_100H=$(date -u -v-100H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '100 hours ago' +%Y-%m-%dT%H:%M:%SZ)

SIGNAL_FIXTURE=$(jq -n --arg now "$SIG_NOW" --arg h73 "$SIG_73H" --arg h100 "$SIG_100H" '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {
    "backlog": [], "review": [], "qa": [], "in_progress": [], "ready": [],
    "done": [], "done_verified": [], "active_sprints": []
  },
  "signal_queue": {
    "_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture",
    "rows": [
      {"id":"SIG-FRESH-READ","ts":$now,"from":"test","to":"po","type":"system-issue","summary":"fresh READ — must NOT evict","severity":"LOW","status":"READ","payload_ref":null},
      {"id":"SIG-STALE-READ","ts":$h73,"from":"test","to":"po","type":"system-issue","summary":"73h-old READ — MUST evict","severity":"LOW","status":"READ","payload_ref":null},
      {"id":"SIG-STALE-RESOLVED","ts":$h100,"from":"test","to":"po","type":"system-issue","summary":"100h-old RESOLVED — MUST evict","severity":"LOW","status":"RESOLVED","payload_ref":null},
      {"id":"SIG-NEW-STALE","ts":$h100,"from":"test","to":"po","type":"system-issue","summary":"100h-old NEW — must NEVER evict (not a terminal status)","severity":"LOW","status":"NEW","payload_ref":null},
      {"id":"SIG-NULL-TS","ts":null,"from":"test","to":"po","type":"system-issue","summary":"null ts — treated as unknown-age/oldest, MUST evict","severity":"LOW","status":"SUPERSEDED","payload_ref":null}
    ]
  },
  "sprint_goal": {"entries": []}
}')
new_fixture "t9-signal-age-gate" "$SIGNAL_FIXTURE"

EXIT_T9=0
run_cold_evict || EXIT_T9=$?
if [ "$EXIT_T9" -eq 0 ]; then
  pass "T9 — signal_queue age-gate live run exits 0"
else
  fail "T9 — expected exit 0, got $EXIT_T9 ($(cat "$FIXTURE_ROOT/.last-stderr" | tail -5))"
fi

T9_HOT_SIG_IDS=$(jq -c '[.signal_queue.rows[].id] | sort' "$HOT_PATH" 2>/dev/null)
if [ "$T9_HOT_SIG_IDS" = '["SIG-FRESH-READ","SIG-NEW-STALE"]' ]; then
  pass "T9 — hot signal_queue.rows[] keeps fresh terminal-status row + aged NEW row (NEW never evicted)"
else
  fail "T9 — hot signal_queue.rows[] unexpected: $T9_HOT_SIG_IDS"
fi

COLD_FILE_T9="$ARCHIVE_PATH/$MONTH.json"
T9_COLD_SIG_IDS=$(jq -c '[(.signal_rows // [])[].id] | sort' "$COLD_FILE_T9" 2>/dev/null)
if [ "$T9_COLD_SIG_IDS" = '["SIG-NULL-TS","SIG-STALE-READ","SIG-STALE-RESOLVED"]' ]; then
  pass "T9 — cold .signal_rows[] contains exactly the 3 aged terminal-status rows (incl. null-ts as oldest)"
else
  fail "T9 — cold .signal_rows[] unexpected: $T9_COLD_SIG_IDS"
fi

# Idempotent re-run: nothing left to evict (2 hot rows survive by rule, not
# age) — second run must be a byte-identical no-op.
HASH_HOT_T9_1=$(file_hash "$HOT_PATH")
HASH_COLD_T9_1=$(file_hash "$COLD_FILE_T9")
EXIT_T9B=0
run_cold_evict || EXIT_T9B=$?
if [ "$EXIT_T9B" -eq 0 ]; then
  pass "T9 — second (idempotent) run exits 0"
else
  fail "T9 — expected exit 0 on re-run, got $EXIT_T9B"
fi
HASH_HOT_T9_2=$(file_hash "$HOT_PATH")
HASH_COLD_T9_2=$(file_hash "$COLD_FILE_T9")
if [ "$HASH_HOT_T9_1" = "$HASH_HOT_T9_2" ] && [ "$HASH_COLD_T9_1" = "$HASH_COLD_T9_2" ]; then
  pass "T9 — hot + cold byte-identical after idempotent re-run"
else
  fail "T9 — hot or cold CHANGED on signal_queue re-run (not idempotent)"
fi

assert_real_live_unchanged "T9"

# =============================================================================
# TEST 10 — FIX-COLDEVICT-MALFORMED-TS-CATCH0-EVICTS-FRESH-SIGNAL-ROWS: a
#   well-formed-but-non-canonical .ts (minute precision, no seconds; or
#   fractional-second) must be aged from its TRUE instant, not silently
#   mapped to epoch 0 by the bare `try fromdateiso8601 catch 0` TEST 9 added.
#   Replays the live incident VERBATIM: signal row dev-20260801T035943, ts
#   "2026-08-01T03:59Z" (minute precision), status READ, evicted ~22min after
#   being marked READ against the 24h gate — this test seeds a row in the
#   SAME malformed shape at the CURRENT UTC minute (fresh) and asserts it
#   survives; a sibling row in the same malformed shape but genuinely 30h old
#   must still evict (proves the age gate now actually gates on malformed-
#   shape timestamps instead of always-true). Covers both known near-miss
#   variants (minute-precision, fractional-second) at both fresh and aged
#   instants, plus a null-ts row retained as still-evictable (AC-2: the
#   poison-row protection this convention exists for must be PRESERVED, not
#   flipped to "newest").
# =============================================================================
T10_NOW_MIN=$(date -u +%Y-%m-%dT%H:%MZ)
T10_AGED_MIN=$(date -u -v-30H +%Y-%m-%dT%H:%MZ 2>/dev/null || date -u -d '30 hours ago' +%Y-%m-%dT%H:%MZ)
T10_NOW_FRAC="$(date -u +%Y-%m-%dT%H:%M:%S).123Z"
T10_AGED_FRAC="$(date -u -v-30H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d '30 hours ago' +%Y-%m-%dT%H:%M:%S).546Z"

MALFORMED_TS_FIXTURE=$(jq -n \
  --arg now_min  "$T10_NOW_MIN" \
  --arg aged_min "$T10_AGED_MIN" \
  --arg now_frac "$T10_NOW_FRAC" \
  --arg aged_frac "$T10_AGED_FRAC" \
  '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {
    "backlog": [], "review": [], "qa": [], "in_progress": [], "ready": [],
    "done": [], "done_verified": [], "active_sprints": []
  },
  "signal_queue": {
    "_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture",
    "rows": [
      {"id":"dev-20260801T035943","ts":$now_min,"from":"developer","to":"po","type":"system-issue","summary":"LIVE INCIDENT REPLAY — minute-precision ts, fresh READ — must NOT evict","severity":"LOW","status":"READ","payload_ref":null},
      {"id":"SIG-AGED-MINUTE-PRECISION","ts":$aged_min,"from":"test","to":"po","type":"system-issue","summary":"30h-old minute-precision READ — MUST evict (age gate must still bind on malformed shape)","severity":"LOW","status":"READ","payload_ref":null},
      {"id":"SIG-FRESH-FRACTIONAL","ts":$now_frac,"from":"test","to":"po","type":"system-issue","summary":"fresh fractional-second READ — must NOT evict","severity":"LOW","status":"READ","payload_ref":null},
      {"id":"SIG-AGED-FRACTIONAL","ts":$aged_frac,"from":"test","to":"po","type":"system-issue","summary":"30h-old fractional-second RESOLVED — MUST evict","severity":"LOW","status":"RESOLVED","payload_ref":null},
      {"id":"SIG-NULL-TS-RETAINED","ts":null,"from":"test","to":"po","type":"system-issue","summary":"null ts — still treated as unknown-age/oldest post-fix, MUST evict (AC-2 poison-row guard not broken)","severity":"LOW","status":"SUPERSEDED","payload_ref":null}
    ]
  },
  "sprint_goal": {"entries": []}
}')
new_fixture "t10-malformed-ts-catch0" "$MALFORMED_TS_FIXTURE"

EXIT_T10=0
run_cold_evict || EXIT_T10=$?
if [ "$EXIT_T10" -eq 0 ]; then
  pass "T10 — malformed-ts age-gate live run exits 0"
else
  fail "T10 — expected exit 0, got $EXIT_T10 ($(cat "$FIXTURE_ROOT/.last-stderr" | tail -5))"
fi

T10_HOT_SIG_IDS=$(jq -c '[.signal_queue.rows[].id] | sort' "$HOT_PATH" 2>/dev/null)
if [ "$T10_HOT_SIG_IDS" = '["SIG-FRESH-FRACTIONAL","dev-20260801T035943"]' ]; then
  pass "T10 — hot signal_queue.rows[] keeps ONLY the two fresh malformed-ts rows (live-incident replay survives)"
else
  fail "T10 — hot signal_queue.rows[] unexpected: $T10_HOT_SIG_IDS (live-incident row must survive — regression)"
fi

COLD_FILE_T10="$ARCHIVE_PATH/$MONTH.json"
T10_COLD_SIG_IDS=$(jq -c '[(.signal_rows // [])[].id] | sort' "$COLD_FILE_T10" 2>/dev/null)
if [ "$T10_COLD_SIG_IDS" = '["SIG-AGED-FRACTIONAL","SIG-AGED-MINUTE-PRECISION","SIG-NULL-TS-RETAINED"]' ]; then
  pass "T10 — cold .signal_rows[] contains exactly the 2 genuinely-aged malformed-ts rows + the null-ts poison row"
else
  fail "T10 — cold .signal_rows[] unexpected: $T10_COLD_SIG_IDS"
fi

# Idempotent re-run: nothing left to evict (2 hot rows survive by true age) —
# second run must be a byte-identical no-op.
HASH_HOT_T10_1=$(file_hash "$HOT_PATH")
HASH_COLD_T10_1=$(file_hash "$COLD_FILE_T10")
EXIT_T10B=0
run_cold_evict || EXIT_T10B=$?
if [ "$EXIT_T10B" -eq 0 ]; then
  pass "T10 — second (idempotent) run exits 0"
else
  fail "T10 — expected exit 0 on re-run, got $EXIT_T10B"
fi
HASH_HOT_T10_2=$(file_hash "$HOT_PATH")
HASH_COLD_T10_2=$(file_hash "$COLD_FILE_T10")
if [ "$HASH_HOT_T10_1" = "$HASH_HOT_T10_2" ] && [ "$HASH_COLD_T10_1" = "$HASH_COLD_T10_2" ]; then
  pass "T10 — hot + cold byte-identical after idempotent re-run"
else
  fail "T10 — hot or cold CHANGED on malformed-ts re-run (not idempotent)"
fi

assert_real_live_unchanged "T10"

# =============================================================================
# TEST 11 — FIX-COLDEVICT-TERMINAL-SIGNAL-STATUSES-OMITS-TRIAGED-RETRACTED: the
#   default TERMINAL_SIGNAL_STATUSES omitted the lowercase "triaged" disposition
#   (only the ad-hoc-cased "TRIAGED" was present) and omitted "RETRACTED"
#   entirely, despite both being documented PO-terminal statuses (SKILL.md §
#   ACK/CLOSE "Extended statuses"). Matching (`.status | IN($tsig_arr[])`) is
#   EXACT-STRING with no case fold, so both case variants of "triaged" must be
#   present as separate literal entries — proven here by asserting BOTH survive
#   or evict identically (no asymmetric case handling). Covers: aged lowercase
#   "triaged" evicts, aged uppercase "TRIAGED" evicts, aged "RETRACTED" evicts,
#   a FRESH "triaged" row (within the 24h age gate) is NOT evicted (AC-3: the
#   age gate must still bind on these newly-admitted statuses, not be
#   bypassed), and a status=NEW row is never evicted regardless of age
#   (pre-existing rule, must not regress alongside this widening).
# =============================================================================
T11_NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
T11_H73=$(date -u -v-73H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '73 hours ago' +%Y-%m-%dT%H:%M:%SZ)

TRIAGED_FIXTURE=$(jq -n --arg now "$T11_NOW" --arg h73 "$T11_H73" '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {
    "backlog": [], "review": [], "qa": [], "in_progress": [], "ready": [],
    "done": [], "done_verified": [], "active_sprints": []
  },
  "signal_queue": {
    "_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture",
    "rows": [
      {"id":"SIG-STALE-TRIAGED-LOWER","ts":$h73,"from":"test","to":"po","type":"system-issue","summary":"73h-old lowercase triaged — MUST evict","severity":"LOW","status":"triaged","payload_ref":null},
      {"id":"SIG-STALE-TRIAGED-UPPER","ts":$h73,"from":"test","to":"po","type":"system-issue","summary":"73h-old uppercase TRIAGED — MUST evict","severity":"LOW","status":"TRIAGED","payload_ref":null},
      {"id":"SIG-STALE-RETRACTED","ts":$h73,"from":"test","to":"po","type":"system-issue","summary":"73h-old RETRACTED — MUST evict","severity":"LOW","status":"RETRACTED","payload_ref":null},
      {"id":"SIG-FRESH-TRIAGED-LOWER","ts":$now,"from":"test","to":"po","type":"system-issue","summary":"fresh lowercase triaged — must NOT evict (age gate still binds)","severity":"LOW","status":"triaged","payload_ref":null},
      {"id":"SIG-STALE-NEW","ts":$h73,"from":"test","to":"po","type":"system-issue","summary":"73h-old NEW — must NEVER evict (not a terminal status)","severity":"LOW","status":"NEW","payload_ref":null}
    ]
  },
  "sprint_goal": {"entries": []}
}')
new_fixture "t11-triaged-retracted" "$TRIAGED_FIXTURE"

EXIT_T11=0
run_cold_evict || EXIT_T11=$?
if [ "$EXIT_T11" -eq 0 ]; then
  pass "T11 — triaged/RETRACTED eviction live run exits 0"
else
  fail "T11 — expected exit 0, got $EXIT_T11 ($(cat "$FIXTURE_ROOT/.last-stderr" | tail -5))"
fi

T11_HOT_SIG_IDS=$(jq -c '[.signal_queue.rows[].id] | sort' "$HOT_PATH" 2>/dev/null)
if [ "$T11_HOT_SIG_IDS" = '["SIG-FRESH-TRIAGED-LOWER","SIG-STALE-NEW"]' ]; then
  pass "T11 — hot signal_queue.rows[] keeps ONLY the fresh triaged row + aged NEW row"
else
  fail "T11 — hot signal_queue.rows[] unexpected: $T11_HOT_SIG_IDS"
fi

COLD_FILE_T11="$ARCHIVE_PATH/$MONTH.json"
T11_COLD_SIG_IDS=$(jq -c '[(.signal_rows // [])[].id] | sort' "$COLD_FILE_T11" 2>/dev/null)
if [ "$T11_COLD_SIG_IDS" = '["SIG-STALE-RETRACTED","SIG-STALE-TRIAGED-LOWER","SIG-STALE-TRIAGED-UPPER"]' ]; then
  pass "T11 — cold .signal_rows[] contains exactly the 3 aged triaged/TRIAGED/RETRACTED rows"
else
  fail "T11 — cold .signal_rows[] unexpected: $T11_COLD_SIG_IDS"
fi

# Idempotent re-run: nothing left to evict (2 hot rows survive by rule/age) —
# second run must be a byte-identical no-op.
HASH_HOT_T11_1=$(file_hash "$HOT_PATH")
HASH_COLD_T11_1=$(file_hash "$COLD_FILE_T11")
EXIT_T11B=0
run_cold_evict || EXIT_T11B=$?
if [ "$EXIT_T11B" -eq 0 ]; then
  pass "T11 — second (idempotent) run exits 0"
else
  fail "T11 — expected exit 0 on re-run, got $EXIT_T11B"
fi
HASH_HOT_T11_2=$(file_hash "$HOT_PATH")
HASH_COLD_T11_2=$(file_hash "$COLD_FILE_T11")
if [ "$HASH_HOT_T11_1" = "$HASH_HOT_T11_2" ] && [ "$HASH_COLD_T11_1" = "$HASH_COLD_T11_2" ]; then
  pass "T11 — hot + cold byte-identical after idempotent re-run"
else
  fail "T11 — hot or cold CHANGED on triaged/RETRACTED re-run (not idempotent)"
fi

assert_real_live_unchanged "T11"

# =============================================================================
# TEST 12 — FIX-ORCHCOLDEVICT-NARRATED-ARCHIVE-WRITE-NEVER-EXECUTED-DATA-LOSS
#   regression: reproduces the exact commit-38c013342e failure mode (10
#   terminal rows deleted from hot with ZERO corresponding archive write
#   ever landing) via a PATH-shadowed `mv` that intercepts ONLY the cold-
#   archive rename call and makes it silently fail to deliver the new rows
#   — everything else (mktemp, the hot-file write via orch-apply.sh, any
#   other `mv` invocation) passes through to the real binary untouched.
#   Proves the hot/cold symmetry self-check (verify_cold_archive_write,
#   wired in BOTH pre-rename-on-temp and post-rename-on-the-real-file) makes
#   a hot-delete-without-archive-write outcome structurally unreachable: the
#   run must abort non-zero and the hot file must stay BYTE-IDENTICAL to its
#   pre-run state, in every sub-case below.
#     (a) rename call reports success but the target file is never created.
#     (b) rename call reports success and the target file DOES exist and IS
#         valid JSON — the closer analog to the real incident — but it is
#         empty (missing every row this pass should have added).
#     (c) control: the identical fixture with the REAL mv (no fault
#         injection) must still succeed normally, proving (a)/(b) failures
#         come from the injected fault, not from the fixture itself.
# =============================================================================
FAKE_BIN_T12="$FIXTURE_ROOT/fake-bin-t12"
mkdir -p "$FAKE_BIN_T12"

# --- (a) total write failure: rename call succeeds but target never appears
cat > "$FAKE_BIN_T12/mv" <<'EOS'
#!/usr/bin/env bash
dest="${@: -1}"
case "$dest" in
  *"/archive/"*.json) exit 0 ;;   # simulate: reported success, nothing landed
  *) exec /bin/mv "$@" ;;
esac
EOS
chmod +x "$FAKE_BIN_T12/mv"

new_fixture "t12a-archive-write-total-failure" "$BASE_FIXTURE"
HASH_HOT_BEFORE_T12A=$(file_hash "$HOT_PATH")
EXIT_T12A=0
PATH="$FAKE_BIN_T12:$PATH" run_cold_evict || EXIT_T12A=$?
if [ "$EXIT_T12A" -ne 0 ]; then
  pass "T12a — archive write total failure: script exits non-zero (pre-fix: silent exit 0)"
else
  fail "T12a — expected non-zero exit when archive write silently no-ops, got 0"
fi
HASH_HOT_AFTER_T12A=$(file_hash "$HOT_PATH")
if [ "$HASH_HOT_BEFORE_T12A" = "$HASH_HOT_AFTER_T12A" ]; then
  pass "T12a — hot file BYTE-IDENTICAL after aborted run (no hot-delete-without-archive-write)"
else
  fail "T12a — hot file CHANGED despite archive write failing (CRITICAL — reproduces 38c013342e)"
fi
if grep -q "SYMMETRY-CHECK FAILED" "$FIXTURE_ROOT/.last-stderr"; then
  pass "T12a — symmetry self-check reported the failure (not a silent abort)"
else
  fail "T12a — expected SYMMETRY-CHECK FAILED in stderr, got: $(tail -5 "$FIXTURE_ROOT/.last-stderr")"
fi
assert_real_live_unchanged "T12a"

# --- (b) partial/corrupted write: target exists + valid schema but EMPTY —
#     this is the closer analog of the real incident (archive/2026-08.json
#     continued to exist and validate; it just never received the new rows).
cat > "$FAKE_BIN_T12/mv" <<'EOS'
#!/usr/bin/env bash
dest="${@: -1}"
case "$dest" in
  *"/archive/"*.json)
    printf '{"month":"1970-01","created_at":"1970-01-01T00:00:00Z","done_tasks":[],"closed_sprints":[],"closed_sprint_goals":[],"signal_rows":[],"backlog_detail":[],"decision_journal":[]}' > "$dest"
    rm -f "$1"
    exit 0
    ;;
  *) exec /bin/mv "$@" ;;
esac
EOS
chmod +x "$FAKE_BIN_T12/mv"

new_fixture "t12b-archive-write-corrupted-empty" "$BASE_FIXTURE"
HASH_HOT_BEFORE_T12B=$(file_hash "$HOT_PATH")
EXIT_T12B=0
PATH="$FAKE_BIN_T12:$PATH" run_cold_evict || EXIT_T12B=$?
if [ "$EXIT_T12B" -ne 0 ]; then
  pass "T12b — archive write lands valid-but-empty file: script exits non-zero"
else
  fail "T12b — expected non-zero exit when archive write drops the new rows, got 0"
fi
HASH_HOT_AFTER_T12B=$(file_hash "$HOT_PATH")
if [ "$HASH_HOT_BEFORE_T12B" = "$HASH_HOT_AFTER_T12B" ]; then
  pass "T12b — hot file BYTE-IDENTICAL after aborted run (this IS the exact 38c013342e shape)"
else
  fail "T12b — hot file CHANGED despite archive missing the new rows (CRITICAL — reproduces 38c013342e)"
fi
if grep -q "SYMMETRY-CHECK FAILED" "$FIXTURE_ROOT/.last-stderr"; then
  pass "T12b — symmetry self-check reported the failure (not a silent abort)"
else
  fail "T12b — expected SYMMETRY-CHECK FAILED in stderr, got: $(tail -5 "$FIXTURE_ROOT/.last-stderr")"
fi
assert_real_live_unchanged "T12b"

# --- (c) control: WITHOUT the fake mv, the identical fixture must still
#     succeed normally.
new_fixture "t12c-control-real-mv" "$BASE_FIXTURE"
EXIT_T12C=0
run_cold_evict || EXIT_T12C=$?
if [ "$EXIT_T12C" -eq 0 ]; then
  pass "T12c — control (real mv, same fixture): exits 0 normally"
else
  fail "T12c — control expected exit 0, got $EXIT_T12C (fixture itself broken, not the fault injection) — $(tail -5 "$FIXTURE_ROOT/.last-stderr")"
fi
assert_real_live_unchanged "T12c"

# =============================================================================
# TEST 13 — FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ (AC-1/AC-4
#   caller migration): orch-cold-evict.sh now captures a content hash
#   (HASH_BEFORE) at the top of its retry loop — BEFORE compute_id_maps()
#   reads the hot file — and threads it through to orch-apply.sh as
#   ORCH_APPLY_CALLER_BASELINE_HASH. This closes a residual staleness window
#   this script's own pre-existing mtime-CAS loop does NOT cover: a peer
#   write landing AFTER this script's own mid-loop MTIME_BEFORE/MTIME_AFTER
#   check (right before the cold-archive rename) but BEFORE orch-apply.sh's
#   own CAS baseline is evaluated (i.e. during the cold-archive rename +
#   verify_cold_archive_write() + process-spawn gap before orch-apply.sh
#   starts). Pre-migration, orch-apply.sh (unmigrated) self-captured its
#   baseline at its own LATER process startup — already downstream of any
#   such peer write — so its before/after check trivially matched and the
#   peer's concurrent change was silently clobbered on rename.
#
#   (a) FIRES: a PATH-shadowed `mv` performs the real cold-archive rename
#       (so cold-side behaviour is completely unaffected) and THEN, in that
#       exact residual window, mutates the hot fixture file as a stand-in
#       for a peer's concurrent write — before this fix, that write would
#       have been silently overwritten by this script's own (by-then-stale)
#       candidate; after this fix, orch-apply.sh's CAS check must catch it
#       every retry (the injected mutation reproduces on each attempt),
#       exhausting MTIME_CAS_RETRIES and aborting non-zero with the hot
#       file left holding the PEER's write, never this run's own candidate.
#   (b) PASSES: identical fixture, no fault injection — normal eviction
#       still succeeds exit 0 (regression guard: HASH_BEFORE threading does
#       not perturb the non-concurrent mainline path).
# =============================================================================
FAKE_BIN_T13="$FIXTURE_ROOT/fake-bin-t13"
mkdir -p "$FAKE_BIN_T13"
cat > "$FAKE_BIN_T13/mv" <<'EOS'
#!/usr/bin/env bash
dest="${@: -1}"
case "$dest" in
  *"/archive/"*.json)
    # Perform the REAL cold-archive rename first — cold-side behaviour must
    # stay completely unaffected by this fault injection.
    /bin/mv "$@" || exit $?
    # Simulate a peer write landing in the residual gap between this
    # script's own internal mid-loop CAS check (already passed, earlier in
    # orch-cold-evict.sh) and orch-apply.sh's own pre-rename CAS check
    # (invoked next, right after this cold-archive rename completes).
    if [ -n "${FAKE_INJECT_HOT_PATH:-}" ] && [ -f "${FAKE_INJECT_HOT_PATH}" ]; then
      _inject_tmp=$(mktemp)
      jq --arg id "PEER-INJECTED-$$-${RANDOM}" \
         '.task_board.backlog += [{"id":$id,"status":"BACKLOG"}]' \
         "${FAKE_INJECT_HOT_PATH}" > "${_inject_tmp}" \
        && /bin/mv "${_inject_tmp}" "${FAKE_INJECT_HOT_PATH}"
    fi
    exit 0
    ;;
  *) exec /bin/mv "$@" ;;
esac
EOS
chmod +x "$FAKE_BIN_T13/mv"

# --- (a) FIRES: fault-injected peer write in the residual window ------------
new_fixture "t13a-cas-baseline-fires-on-injected-peer-write" "$BASE_FIXTURE"
EXIT_T13A=0
FAKE_INJECT_HOT_PATH="$HOT_PATH" MTIME_CAS_RETRIES=2 PATH="$FAKE_BIN_T13:$PATH" run_cold_evict \
  || EXIT_T13A=$?

if [ "$EXIT_T13A" -ne 0 ]; then
  pass "T13a — CAS baseline FIRES: run aborts non-zero when a peer write lands in the residual window"
else
  fail "T13a — expected non-zero exit (CAS mismatch should have fired), got 0 — guard is a no-op"
fi

if grep -q "orch-apply.sh CAS mismatch" "$FIXTURE_ROOT/.last-stderr"; then
  pass "T13a — stderr confirms orch-apply.sh's own CAS check is what fired (not some other abort path)"
else
  fail "T13a — expected 'orch-apply.sh CAS mismatch' in stderr, got: $(tail -8 "$FIXTURE_ROOT/.last-stderr")"
fi

if jq -e '[.task_board.backlog[].id] | any(startswith("PEER-INJECTED-"))' "$HOT_PATH" >/dev/null 2>&1; then
  pass "T13a — hot file retains the PEER's injected row (never silently clobbered)"
else
  fail "T13a — PEER-INJECTED row missing from hot file — the stale candidate overwrote the peer's write"
fi

if jq -e '[.task_board.backlog[].id] | index("BL-DONE-1")' "$HOT_PATH" >/dev/null 2>&1; then
  pass "T13a — hot file still holds BL-DONE-1 (this run's OWN stale eviction candidate correctly rejected)"
else
  fail "T13a — BL-DONE-1 missing from hot file — this run's stale candidate applied despite the CAS mismatch"
fi

assert_real_live_unchanged "T13a"

# --- (b) PASSES: identical fixture, no fault injection -----------------------
new_fixture "t13b-cas-baseline-control-no-injection" "$BASE_FIXTURE"
EXIT_T13B=0
run_cold_evict || EXIT_T13B=$?

if [ "$EXIT_T13B" -eq 0 ]; then
  pass "T13b — control (no concurrent peer write): HASH_BEFORE threading does not perturb the mainline path — exit 0"
else
  fail "T13b — control expected exit 0, got $EXIT_T13B — $(tail -8 "$FIXTURE_ROOT/.last-stderr")"
fi

if jq -e '[.task_board.backlog[].id] | index("BL-DONE-1") | not' "$HOT_PATH" >/dev/null 2>&1; then
  pass "T13b — BL-DONE-1 correctly evicted from hot file (normal eviction still functions)"
else
  fail "T13b — BL-DONE-1 still present in hot file — normal eviction broken by this change"
fi

assert_real_live_unchanged "T13b"

# =============================================================================
# TEST 14 — FIX-ORCH-COLD-EVICT-VALIDATION-EXIT1 (2026-08-29): a stale
#   candidate + peer forward lane-moves must abort RETRYABLE (CAS exit 2 →
#   cold-evict re-reads fresh → run completes), NOT fatally (conservation
#   lane-placement exit 1 → "cold eviction skipped, retry next tick" forever).
#
#   Root cause reproduced live (telegram 5209, 2026-08-26): orch-apply.sh ran
#   the conservation check (AC-3 lane-placement dimension) BEFORE the CAS
#   check. The conservation check compares the candidate against the LIVE file
#   read fresh at ITS OWN invocation — a candidate built from a snapshot that
#   predates a peer's forward lane-moves (e.g. review[]→qa[] qa_drain rows)
#   scores those rows as BACKWARD and exits 1 (fatal). The CAS check — the
#   authoritative stale-candidate detector, exit 2 (retryable) — ran after and
#   was never reached. Fix: CAS check moved BEFORE the conservation check in
#   orch-apply.sh.
#
#   Fault injection (mirrors TEST 13's PATH-shadowed-mv pattern): a peer write
#   lands in the residual window after cold-evict's own mid-loop mtime check
#   (during the cold-archive rename) — moving TWO non-terminal rows FORWARD
#   (BL-BLOCKED-1 backlog→in_progress, RV-DEGRADED-1 review→qa; both statuses
#   coherent in their target lanes). Injected ONCE (marker file) so attempt 2's
#   fresh read includes the moves and the retried run completes.
#
#   (a) SELF-HEALS: run exits 0 — the stale candidate aborted via CAS
#       (retryable), the retry re-read the mutated hot file, and the eviction
#       completed. Pre-fix, attempt 1 aborted exit 1 at the conservation check
#       and the run never completed (the regression this test guards).
#   (b) stderr proves the RETRY mechanism fired ("CAS mismatch") and the fatal
#       conservation abort did NOT ("orch-apply.sh validation failed (exit 1)"
#       must be absent).
#   (c) the PEER's lane moves survive in the final hot file (never clobbered
#       by the stale candidate) AND the terminal rows were archived (the
#       eviction this whole backstop exists to perform).
# =============================================================================
FAKE_BIN_T14="$FIXTURE_ROOT/fake-bin-t14"
mkdir -p "$FAKE_BIN_T14"
cat > "$FAKE_BIN_T14/mv" <<'EOS'
#!/usr/bin/env bash
dest="${@: -1}"
case "$dest" in
  *"/archive/"*.json)
    # Perform the REAL cold-archive rename first — cold-side behaviour stays
    # completely unaffected by this fault injection.
    /bin/mv "$@" || exit $?
    # Simulate a peer write landing in the residual gap: ONCE (marker-guarded),
    # move two non-terminal rows FORWARD to higher pipeline ranks. A stale
    # candidate built before this write scores both as BACKWARD (candidate lane
    # rank < live lane rank) — the exact AC-3 lane-placement violation shape.
    if [ -n "${FAKE_INJECT_HOT_PATH:-}" ] && [ -f "${FAKE_INJECT_HOT_PATH}" ] \
       && [ ! -f "${FAKE_INJECT_DONE:-}" ]; then
      _inj_tmp=$(mktemp)
      jq '
        (.task_board.backlog[] | select(.id=="BL-BLOCKED-1")) as $b |
        (.task_board.review[] | select(.id=="RV-DEGRADED-1")) as $r |
        .task_board.in_progress = (.task_board.in_progress + [$b]) |
        .task_board.backlog = [.task_board.backlog[] | select(.id != "BL-BLOCKED-1")] |
        .task_board.qa = (.task_board.qa + [$r]) |
        .task_board.review = [.task_board.review[] | select(.id != "RV-DEGRADED-1")]
      ' "${FAKE_INJECT_HOT_PATH}" > "${_inj_tmp}" \
        && /bin/mv "${_inj_tmp}" "${FAKE_INJECT_HOT_PATH}" \
        && touch "${FAKE_INJECT_DONE}"
    fi
    exit 0
    ;;
  *) exec /bin/mv "$@" ;;
esac
EOS
chmod +x "$FAKE_BIN_T14/mv"

# Fixture: terminal rows to evict (BL-DONE-1/BL-CANCELLED-1/RV-DV-1) + the two
# coherently-forward-movable non-terminal rows the injected peer write moves.
T14_FIXTURE=$(jq -n '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {
    "backlog": [
      {"id":"BL-DONE-1","status":"DONE"},
      {"id":"BL-CANCELLED-1","status":"CANCELLED"},
      {"id":"BL-BLOCKED-1","status":"BLOCKED"}
    ],
    "review": [
      {"id":"RV-DV-1","status":"DONE_VERIFIED"},
      {"id":"RV-DEGRADED-1","status":"DEGRADED","verification":{"honest_gap_reason":"fixture row — survives eviction, needs gate-valid verification shape"}}
    ],
    "qa": [],
    "in_progress": [],
    "ready": [],
    "done": [],
    "done_verified": [],
    "active_sprints": []
  },
  "signal_queue": {"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]},
  "sprint_goal": {"entries": []}
}')

# --- (a)+(b)+(c): single-injection stale candidate self-heals via CAS retry --
new_fixture "t14-stale-candidate-lane-placement-self-heal" "$T14_FIXTURE"
EXIT_T14=0
FAKE_INJECT_HOT_PATH="$HOT_PATH" FAKE_INJECT_DONE="$FIXTURE_ROOT/.t14-injected" \
  MTIME_CAS_RETRIES=2 PATH="$FAKE_BIN_T14:$PATH" run_cold_evict || EXIT_T14=$?

if [ "$EXIT_T14" -eq 0 ]; then
  pass "T14a — stale candidate + peer forward moves SELF-HEALS: run exits 0 (retried against fresh read)"
else
  fail "T14a — expected exit 0, got $EXIT_T14 — $(tail -6 "$FIXTURE_ROOT/.last-stderr")"
fi

if grep -q "CAS mismatch" "$FIXTURE_ROOT/.last-stderr"; then
  pass "T14a — stderr confirms the RETRYABLE CAS check fired (stale candidate rejected via exit 2, not the fatal conservation exit 1)"
else
  fail "T14a — expected 'CAS mismatch' in stderr, got: $(tail -6 "$FIXTURE_ROOT/.last-stderr")"
fi

if grep -q "orch-apply.sh validation failed (exit 1)" "$FIXTURE_ROOT/.last-stderr"; then
  fail "T14a — FATAL conservation abort still reachable on a stale candidate — reorder did not take effect"
else
  pass "T14a — fatal 'orch-apply.sh validation failed (exit 1)' absent (conservation check no longer aborts on stale candidates)"
fi

# Peer's forward moves survive in the FINAL hot file (stale candidate never applied)
if jq -e '.task_board.in_progress[] | select(.id=="BL-BLOCKED-1")' "$HOT_PATH" >/dev/null 2>&1 \
   && jq -e '.task_board.qa[] | select(.id=="RV-DEGRADED-1")' "$HOT_PATH" >/dev/null 2>&1; then
  pass "T14b — peer's forward lane-moves (BL-BLOCKED-1 → in_progress[], RV-DEGRADED-1 → qa[]) preserved in final hot file"
else
  fail "T14b — peer's lane moves missing from final hot file: $(jq -c '{b:.task_board.in_progress[].id,q:.task_board.qa[].id}' "$HOT_PATH" 2>/dev/null || echo unreadable)"
fi

# Terminal rows STILL archived — the eviction the backstop exists to perform
if jq -e '[.task_board.backlog[].id] | index("BL-DONE-1") | not' "$HOT_PATH" >/dev/null 2>&1 \
   && jq -e '[.task_board.backlog[].id] | index("BL-CANCELLED-1") | not' "$HOT_PATH" >/dev/null 2>&1 \
   && jq -e '[.task_board.review[].id] | index("RV-DV-1") | not' "$HOT_PATH" >/dev/null 2>&1; then
  pass "T14c — terminal rows (BL-DONE-1/BL-CANCELLED-1/RV-DV-1) evicted from hot despite the concurrent peer write"
else
  fail "T14c — terminal rows NOT evicted — hot: $(jq -c '{bl:[.task_board.backlog[].id],rv:[.task_board.review[].id]}' "$HOT_PATH")"
fi

COLD_T14="$ARCHIVE_PATH/$MONTH.json"
if [ -f "$COLD_T14" ] && [ "$(jq '[.backlog_detail[].id] | length' "$COLD_T14")" -ge 3 ]; then
  pass "T14c — cold .backlog_detail[] holds the 3 evicted terminal rows"
else
  fail "T14c — cold .backlog_detail[] unexpected: $(jq -c '[.backlog_detail[].id]' "$COLD_T14" 2>/dev/null || echo no-cold-file)"
fi

assert_real_live_unchanged "T14"

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
