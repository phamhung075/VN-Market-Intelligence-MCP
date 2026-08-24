#!/usr/bin/env bash
# =============================================================================
# scripts/test/orch-apply-wrapper-tests.sh
# Integration test suite for scripts/orch-apply.sh
# =============================================================================
# Sprint: SSOT-INTEGRITY-PERIMETER
# Task:   SSOT-W1-ORCH-APPLY-WRAPPER (rank 5, wave-1)
# Canonical ref: docs/policies/dev-standards.md § CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER
#
# COVERS:
#   QA-1 — invalid status ("PARKED") → exit 1, live UNCHANGED
#   QA-2 — duplicate JSON key         → exit 1, live UNCHANGED
#   CAS   — concurrent-write mtime mismatch → exit 2, live UNCHANGED, temp cleaned
#   E3    — empty stdin               → exit 3
#   E3-NF — missing live file         → exit 3
#   HAPPY — valid candidate           → exit 0, fixture updated
#   QA-COLLAPSE / QA-APPEND-HAPPY — task_board.qa[] is counted in the
#     conservation guard's task_total (FIX-ORCHSTATE-CONSERVATION-GUARD-QA-LANE-BLIND)
#   CALLER-BASELINE-* — AC-1/AC-2 of FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-
#     CALLER-JQ-READ: caller-supplied CAS baseline (hash or mtime) closes the
#     gap where this script's own self-captured mtime is taken AFTER the
#     caller's jq already read a stale copy; includes the exact T0..T3
#     interleave repro + a sequential-write negative control + the
#     no-baseline-supplied fallback-unchanged control.
#   LANE-BACKWARD-* / LANE-FORWARD-BATCH-HAPPY — AC-3 of the same task: a new
#     lane-placement conservation dimension flags 2+ undeclared task rows
#     reverting to an earlier-pipeline-rank lane in one write (the reproduced
#     stale-full-doc-revert incident shape), tolerating the single sanctioned
#     backward move (e.g. QA CHANGES_REQUESTED) and leaving forward batch
#     moves (e.g. QA-Drain) untouched.
#
# SAFETY: all tests use ORCH_APPLY_LIVE_FILE_OVERRIDE pointing at a throwaway
# fixture under mktemp. The REAL docs/data/orch/orch-state.json is NEVER touched.
# A hash is captured before and asserted after every test to prove this.
# =============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APPLY_SH="$REPO_ROOT/scripts/orch-apply.sh"
VALIDATOR="$REPO_ROOT/scripts/orch-validate.mjs"
REAL_LIVE="$REPO_ROOT/docs/data/orch/orch-state.json"

# ─── Preflight ────────────────────────────────────────────────────────────────
[ -f "$APPLY_SH" ]   || { echo "FATAL: $APPLY_SH not found"; exit 1; }
[ -f "$VALIDATOR" ]  || { echo "FATAL: $VALIDATOR not found"; exit 1; }
[ -f "$REAL_LIVE" ]  || { echo "FATAL: $REAL_LIVE not found"; exit 1; }
command -v bun >/dev/null 2>&1  || { echo "FATAL: bun not found in PATH"; exit 1; }
command -v sha256sum >/dev/null 2>&1 || \
  { command -v shasum >/dev/null 2>&1 || { echo "FATAL: sha256sum/shasum not found"; exit 1; }; }

# ─── Checksum helper (macOS + Linux portable) ─────────────────────────────────
file_hash() {
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

# ─── Throwaway fixture directory ──────────────────────────────────────────────
FIXTURE_DIR=$(mktemp -d "/tmp/orch-apply-test-XXXXXX")
trap 'rm -rf "$FIXTURE_DIR"' EXIT

FIXTURE_LIVE="$FIXTURE_DIR/orch-state.json"

# ─── Minimal valid orch-state fixture ─────────────────────────────────────────
# NOT a copy of the live file.  Satisfies OrchStateSchema: _meta + head +
# task_board (backlog Lane + active_sprints[]) + signal_queue (strict keys).
VALID_FIXTURE='{"_meta":{"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},"head":{"status":"idle","active_task_id":null,"next_agent":null},"task_board":{"backlog":[{"id":"FIXTURE-TASK-1","status":"BACKLOG"}],"active_sprints":[]},"signal_queue":{"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]}}'

# A valid candidate: same structure, bumped updated_at — passes Stage 0 + Stage 1
VALID_CANDIDATE='{"_meta":{"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:01:00Z","updated_by":"fixture-write"},"head":{"status":"idle","active_task_id":null,"next_agent":null},"task_board":{"backlog":[{"id":"FIXTURE-TASK-1","status":"BACKLOG"}],"active_sprints":[]},"signal_queue":{"_updated_at":"2026-06-01T00:01:00Z","_updated_by":"fixture-write","rows":[]}}'

# Helper: write clean fixture to FIXTURE_LIVE
reset_fixture() {
  printf '%s' "$VALID_FIXTURE" > "$FIXTURE_LIVE"
}

# Helper: assert FIXTURE_LIVE byte-equals reference hash
assert_fixture_unchanged() {
  local ref="$1" label="$2"
  local now
  now=$(file_hash "$FIXTURE_LIVE")
  if [ "$ref" = "$now" ]; then
    pass "$label — fixture UNCHANGED"
  else
    fail "$label — fixture CHANGED (expected unchanged)"
  fi
}

# Helper: assert REAL live file unchanged (applies to every test)
assert_real_live_unchanged() {
  local label="$1"
  local now
  now=$(file_hash "$REAL_LIVE")
  if [ "$REAL_HASH_BEFORE" = "$now" ]; then
    pass "$label — REAL live file UNCHANGED"
  else
    fail "$label — REAL live file CHANGED (CRITICAL)"
  fi
}

# =============================================================================
# QA-1: Invalid status "PARKED" → exit 1, fixture + real-live UNCHANGED
# =============================================================================
reset_fixture
HASH_BEFORE=$(file_hash "$FIXTURE_LIVE")

# Candidate with a task whose status is "PARKED" (not in StatusEnum)
BAD_STATUS='{"_meta":{"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},"head":{"status":"idle","active_task_id":null,"next_agent":null},"task_board":{"backlog":[{"id":"FIXTURE-TASK-1","status":"PARKED"}],"active_sprints":[]},"signal_queue":{"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]}}'

EXIT1=0
printf '%s' "$BAD_STATUS" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$FIXTURE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT1=$?

if [ "$EXIT1" -eq 1 ]; then
  pass "QA-1 — PARKED status rejected → exit 1"
else
  fail "QA-1 — expected exit 1, got $EXIT1"
fi
assert_fixture_unchanged "$HASH_BEFORE" "QA-1"
assert_real_live_unchanged "QA-1"

# =============================================================================
# QA-2: Duplicate JSON key → exit 1, fixture + real-live UNCHANGED
# =============================================================================
reset_fixture
HASH_BEFORE=$(file_hash "$FIXTURE_LIVE")

# Candidate with a duplicate top-level key ("_meta" appears twice).
# Stage 0 (raw-byte dup-key scan) must catch this before Stage 1 parse.
DUP_KEY='{"_meta":{"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},"_meta":{"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"DUPLICATE"},"head":{"status":"idle","active_task_id":null,"next_agent":null},"task_board":{"backlog":[{"id":"FIXTURE-TASK-1","status":"BACKLOG"}],"active_sprints":[]},"signal_queue":{"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]}}'

EXIT2=0
printf '%s' "$DUP_KEY" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$FIXTURE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT2=$?

if [ "$EXIT2" -eq 1 ]; then
  pass "QA-2 — duplicate key rejected → exit 1"
else
  fail "QA-2 — expected exit 1, got $EXIT2"
fi
assert_fixture_unchanged "$HASH_BEFORE" "QA-2"
assert_real_live_unchanged "QA-2"

# =============================================================================
# CAS: Concurrent-write mtime mismatch → exit 2, fixture UNCHANGED, temp cleaned
# =============================================================================
# Design (deterministic — avoids same-second mtime collision):
#   1. Write the fixture and pre-set its mtime to T_old (year 2020) via touch -t.
#      mtime_before captured at BG startup = T_old (~1577833200).
#   2. Start orch-apply.sh in the BACKGROUND with a 0.5s delayed stdin feed
#      (process substitution `< <(sleep 0.5; printf ...)`).  The BG starts
#      executing immediately (process substitution opens an anonymous pipe that
#      does NOT block the reader), captures mtime_before = T_old, then blocks
#      on `cat > TMP` waiting for the delayed data.
#   3. Sleep 0.1s (gives BG time to start and capture mtime_before).
#   4. touch the fixture → mtime_after = T_now (~1782xxx, year 2026).
#      6-year gap guarantees T_old ≠ T_now at any second-precision stat(2).
#   5. After the 0.5s delay, the process substitution sends the valid candidate.
#   6. BG: validates (passes), CAS re-check: T_old ≠ T_now → exit 2.
#   7. Assert: exit 2, fixture CONTENT unchanged (no rename), no leftover tmps.
# =============================================================================
reset_fixture
# Force mtime to far past (2020) — T_old is unambiguously != T_now
touch -t 202001010000 "$FIXTURE_LIVE"
HASH_BEFORE=$(file_hash "$FIXTURE_LIVE")

# Launch BG with a 0.5s delayed stdin (process substitution, not a named FIFO).
# The pipe from the process substitution is immediately available → no blocking on open.
CAS_EXIT=0
ORCH_APPLY_LIVE_FILE_OVERRIDE="$FIXTURE_LIVE" bash "$APPLY_SH" \
  < <(sleep 0.5; printf '%s' "$VALID_CANDIDATE") 2>/dev/null &
BG_PID=$!

# Sleep 0.1s: BG has started (fork is near-instant), already captured mtime_before = T_old.
# 0.1s > typical fork+exec (~5-10ms) on any non-degenerate system.
sleep 0.1

# Touch the fixture to set T_now. BG is still blocked on `cat > TMP` waiting for the
# 0.5s delayed data, so mtime_after (checked after validation completes at ~0.5+0.065s)
# will see T_now — confirming the CAS guard catches the concurrent write.
touch "$FIXTURE_LIVE"

# Wait for BG; capture exit code
wait $BG_PID 2>/dev/null; CAS_EXIT=$?

if [ "$CAS_EXIT" = "2" ]; then
  pass "CAS — mtime mismatch detected → exit 2"
else
  fail "CAS — expected exit 2, got $CAS_EXIT (check if bun is slower than 0.2s sleep)"
fi

# Fixture must be UNCHANGED (the rename must not have happened)
# Note: touch changed mtime but not content; hash is content-only
HASH_AFTER=$(file_hash "$FIXTURE_LIVE")
if [ "$HASH_BEFORE" = "$HASH_AFTER" ]; then
  pass "CAS — fixture CONTENT unchanged (no rename occurred)"
else
  fail "CAS — fixture CONTENT changed (rename must not have occurred)"
fi

# The cleanup trap (trap cleanup EXIT) must have removed TMP when orch-apply.sh exited 2.
# Verify: no .orch-apply-*.json temp files remain in the fixture directory.
LEFTOVER=$(find "$FIXTURE_DIR" -name ".orch-apply-*.json" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LEFTOVER" = "0" ]; then
  pass "CAS — trap cleanup removed TMP (no leftover temp files)"
else
  fail "CAS — $LEFTOVER leftover .orch-apply-*.json file(s) found (trap cleanup failed)"
fi
assert_real_live_unchanged "CAS"

# =============================================================================
# E3-EMPTY: Empty stdin → exit 3, fixture UNCHANGED
# =============================================================================
reset_fixture
HASH_BEFORE=$(file_hash "$FIXTURE_LIVE")

EXIT_E3_EMPTY=0
printf '' \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$FIXTURE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_E3_EMPTY=$?

if [ "$EXIT_E3_EMPTY" -eq 3 ]; then
  pass "E3-EMPTY — empty stdin → exit 3"
else
  fail "E3-EMPTY — expected exit 3, got $EXIT_E3_EMPTY"
fi
assert_fixture_unchanged "$HASH_BEFORE" "E3-EMPTY"
assert_real_live_unchanged "E3-EMPTY"

# =============================================================================
# E3-NF: Missing live file → exit 3
# =============================================================================
EXIT_E3_NF=0
printf '%s' "$VALID_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="/nonexistent/no-such-file.json" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_E3_NF=$?

if [ "$EXIT_E3_NF" -eq 3 ]; then
  pass "E3-NF — missing live file → exit 3"
else
  fail "E3-NF — expected exit 3, got $EXIT_E3_NF"
fi
assert_real_live_unchanged "E3-NF"

# =============================================================================
# HAPPY: Valid candidate → exit 0, fixture updated to candidate
# =============================================================================
reset_fixture
HASH_BEFORE=$(file_hash "$FIXTURE_LIVE")

EXIT_HAPPY=0
printf '%s' "$VALID_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$FIXTURE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_HAPPY=$?

if [ "$EXIT_HAPPY" -eq 0 ]; then
  pass "HAPPY — valid candidate → exit 0"
else
  fail "HAPPY — expected exit 0, got $EXIT_HAPPY"
fi

# Fixture MUST have changed (the atomic rename applied the candidate)
HASH_AFTER_HAPPY=$(file_hash "$FIXTURE_LIVE")
if [ "$HASH_BEFORE" != "$HASH_AFTER_HAPPY" ]; then
  pass "HAPPY — fixture updated (rename applied)"
else
  fail "HAPPY — fixture unchanged (rename did not apply?)"
fi

# Confirm candidate content is present
UPDATED_AT=$(jq -r '._meta.updated_at' "$FIXTURE_LIVE" 2>/dev/null || echo "?")
if [ "$UPDATED_AT" = "2026-06-01T00:01:00Z" ]; then
  pass "HAPPY — fixture content matches candidate"
else
  fail "HAPPY — fixture content mismatch (updated_at='$UPDATED_AT')"
fi
assert_real_live_unchanged "HAPPY"

# =============================================================================
# CONSERVATION-GUARD TESTS (FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER)
# =============================================================================
# Brief: docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md §8
#
# Populated fixture: 320 backlog tasks (>=312 per the ticket's literal ask) +
# 340 done_verified tasks (sized so emptying done_verified[] ALONE crosses the
# 50% floor: 320/(320+340) < 0.5 — needed so SHRINK-ALLOWED tests a genuine
# violation, not a no-op) + 100 signal_queue rows (>=97 per the ticket's
# literal ask). Mirrors the empirically-reproduced incident scale (commit
# de595a44: 320 backlog -> 0, 100 signal rows -> 1).
#
# COLLAPSE      — CONFIRMED RED before this fix (§3 of the brief: exit 0,
#                 fixture destroyed); must be GREEN (exit 1, byte-unchanged) after.
# APPEND-HAPPY  — regression guard: a normal single-row append must NOT be blocked.
# SHRINK-ALLOWED — proves the ORCH_APPLY_ALLOW_SHRINK bypass (wired into
#                 scripts/orch-cold-evict.sh + docs/agents/pm/flow/task-archive.md)
#                 is honored.
# =============================================================================
CONSERVATION_LIVE="$FIXTURE_DIR/conservation-live.json"
N_BACKLOG=320
N_DONE_VERIFIED=340
N_SIGNAL=100

build_conservation_fixture() {
  jq -n \
    --argjson n_backlog "$N_BACKLOG" \
    --argjson n_dv "$N_DONE_VERIFIED" \
    --argjson n_signal "$N_SIGNAL" \
    '{
      "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
      "head": {"status":"idle","active_task_id":null,"next_agent":null},
      "task_board": {
        "backlog": [range($n_backlog) | {id: ("POP-BACKLOG-" + (. | tostring)), status: "BACKLOG"}],
        "done_verified": [range($n_dv) | {id: ("POP-DV-" + (. | tostring)), status: "DONE_VERIFIED",
          "verification": {"raw_probe": {"tool": "test", "args": "n/a", "live_value_observed": "n/a", "observed_at": "2026-06-01T00:00:00Z"}}}],
        "active_sprints": []
      },
      "signal_queue": {
        "_updated_at": "2026-06-01T00:00:00Z",
        "_updated_by": "fixture",
        "rows": [range($n_signal) | {id: ("POP-SIGNAL-" + (. | tostring)), summary: "fixture row", severity: "INFO", status: "NEW"}]
      }
    }' > "$CONSERVATION_LIVE"
}
build_conservation_fixture

# Sanity: fixture itself must be schema-valid standalone (same pattern the
# architect used for the live-exploitability repro in the brief §3).
if ! bun "$VALIDATOR" "$CONSERVATION_LIVE" >/dev/null 2>&1; then
  fail "CONSERVATION setup — populated fixture failed standalone validation (test bug, not product bug)"
fi

CONSERVATION_HASH_BEFORE=$(file_hash "$CONSERVATION_LIVE")

# ─────────────────────────────────────────────────────────────────────────
# COLLAPSE — scaffold candidate mirroring commit de595a44's exact shape:
# minimal valid .head, task_board={backlog:[],active_sprints:[]} only
# (done_verified omitted -> defaults to [] downstream), signal_queue.rows =
# [1 fabricated row].
# ─────────────────────────────────────────────────────────────────────────
COLLAPSE_CANDIDATE='{"_meta":{"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:01:00Z","updated_by":"fixture-collapse"},"head":{"status":"idle","active_task_id":null,"next_agent":null},"task_board":{"backlog":[],"active_sprints":[]},"signal_queue":{"_updated_at":"2026-06-01T00:01:00Z","_updated_by":"fixture-collapse","rows":[{"id":"POP-SIGNAL-0","summary":"fixture row","severity":"INFO","status":"NEW"}]}}'

EXIT_COLLAPSE=0
printf '%s' "$COLLAPSE_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$CONSERVATION_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_COLLAPSE=$?

if [ "$EXIT_COLLAPSE" -eq 1 ]; then
  pass "COLLAPSE — full-doc collapse candidate rejected — exit 1"
else
  fail "COLLAPSE — expected exit 1, got $EXIT_COLLAPSE"
fi

CONSERVATION_HASH_AFTER_COLLAPSE=$(file_hash "$CONSERVATION_LIVE")
if [ "$CONSERVATION_HASH_BEFORE" = "$CONSERVATION_HASH_AFTER_COLLAPSE" ]; then
  pass "COLLAPSE — populated fixture UNCHANGED (no rename occurred)"
else
  fail "COLLAPSE — populated fixture CHANGED (CRITICAL — conservation guard did not block the write)"
fi
assert_real_live_unchanged "COLLAPSE"

# ─────────────────────────────────────────────────────────────────────────
# APPEND-HAPPY — regression guard: the circuit-breaker must NOT block a
# normal, legitimate single-row append (e.g. system-auditor's real
# signal-dashboard WRITE).
# ─────────────────────────────────────────────────────────────────────────
APPEND_CANDIDATE=$(jq --arg now "2026-06-01T00:02:00Z" \
  '.signal_queue.rows += [{"id":"POP-SIGNAL-APPENDED","summary":"legit append","severity":"INFO","status":"NEW"}]
   | .signal_queue._updated_at = $now | ._meta.updated_at = $now' \
  "$CONSERVATION_LIVE")

PRE_APPEND_SIGNAL_N=$(jq '.signal_queue.rows | length' "$CONSERVATION_LIVE")
PRE_APPEND_BACKLOG_N=$(jq '.task_board.backlog | length' "$CONSERVATION_LIVE")

EXIT_APPEND=0
printf '%s' "$APPEND_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$CONSERVATION_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_APPEND=$?

if [ "$EXIT_APPEND" -eq 0 ]; then
  pass "APPEND-HAPPY — legit single-row append accepted — exit 0"
else
  fail "APPEND-HAPPY — expected exit 0, got $EXIT_APPEND"
fi

POST_APPEND_SIGNAL_N=$(jq '.signal_queue.rows | length' "$CONSERVATION_LIVE" 2>/dev/null || echo -1)
POST_APPEND_BACKLOG_N=$(jq '.task_board.backlog | length' "$CONSERVATION_LIVE" 2>/dev/null || echo -1)

if [ "$POST_APPEND_SIGNAL_N" = "$((PRE_APPEND_SIGNAL_N + 1))" ]; then
  pass "APPEND-HAPPY — signal_queue.rows.length == pre+1"
else
  fail "APPEND-HAPPY — signal_queue.rows.length expected $((PRE_APPEND_SIGNAL_N + 1)), got $POST_APPEND_SIGNAL_N"
fi

if [ "$POST_APPEND_BACKLOG_N" = "$PRE_APPEND_BACKLOG_N" ]; then
  pass "APPEND-HAPPY — task_board.backlog.length unchanged"
else
  fail "APPEND-HAPPY — task_board.backlog.length expected $PRE_APPEND_BACKLOG_N, got $POST_APPEND_BACKLOG_N"
fi

ALL_LANES_ARRAYS=$(jq '[.task_board.backlog, .task_board.active_sprints, (.task_board.done_verified // [])] | map(type == "array") | all' "$CONSERVATION_LIVE" 2>/dev/null || echo "false")
if [ "$ALL_LANES_ARRAYS" = "true" ]; then
  pass "APPEND-HAPPY — all lanes remain arrays"
else
  fail "APPEND-HAPPY — a lane is no longer an array"
fi

assert_real_live_unchanged "APPEND-HAPPY"

# ─────────────────────────────────────────────────────────────────────────
# SHRINK-ALLOWED — same populated fixture (post-APPEND-HAPPY state) +
# done_verified[] emptied (a genuine >50% task_total shrink on its own:
# 320/(320+340) < 0.5) + ORCH_APPLY_ALLOW_SHRINK set -> proves
# scripts/orch-cold-evict.sh / docs/agents/pm/flow/task-archive.md's bypass
# is honored and will not regress once the guard lands. A no-bypass control
# run proves the fixture genuinely trips the floor (not a vacuous pass).
# ─────────────────────────────────────────────────────────────────────────
SHRINK_CANDIDATE=$(jq --arg now "2026-06-01T00:03:00Z" \
  '.task_board.done_verified = [] | ._meta.updated_at = $now' \
  "$CONSERVATION_LIVE")

EXIT_SHRINK_CONTROL=0
printf '%s' "$SHRINK_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$CONSERVATION_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_SHRINK_CONTROL=$?

if [ "$EXIT_SHRINK_CONTROL" -eq 1 ]; then
  pass "SHRINK-ALLOWED (control, no bypass) — done_verified[] wipe rejected — exit 1"
else
  fail "SHRINK-ALLOWED (control, no bypass) — expected exit 1, got $EXIT_SHRINK_CONTROL (fixture does not actually trip the floor)"
fi

EXIT_SHRINK=0
printf '%s' "$SHRINK_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$CONSERVATION_LIVE" ORCH_APPLY_ALLOW_SHRINK="cold-evict-test" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_SHRINK=$?

if [ "$EXIT_SHRINK" -eq 0 ]; then
  pass "SHRINK-ALLOWED — done_verified[] wipe WITH ORCH_APPLY_ALLOW_SHRINK accepted — exit 0"
else
  fail "SHRINK-ALLOWED — expected exit 0 with bypass, got $EXIT_SHRINK"
fi

POST_SHRINK_DV_N=$(jq '.task_board.done_verified | length' "$CONSERVATION_LIVE" 2>/dev/null || echo -1)
if [ "$POST_SHRINK_DV_N" = "0" ]; then
  pass "SHRINK-ALLOWED — fixture done_verified[] emptied (rename applied)"
else
  fail "SHRINK-ALLOWED — expected done_verified[] length 0, got $POST_SHRINK_DV_N"
fi

assert_real_live_unchanged "SHRINK-ALLOWED"

# =============================================================================
# QA-LANE CONSERVATION TESTS (FIX-ORCHSTATE-CONSERVATION-GUARD-QA-LANE-BLIND)
# =============================================================================
# scripts/orch-conservation-check.mjs FLAT_TASK_LANES omitted 'qa', so
# task_total() never summed task_board.qa[] -- a catastrophic qa[] collapse
# was invisible to the floor-ratio circuit-breaker (qa[] is now actively
# populated by the Review-Lane QA-Drain mechanism, dev-team flow).
#
# Dedicated fixture: 10 backlog rows (baseline, untouched) + 50 qa rows (the
# lane under test) -> task_total=60. Emptying qa[] alone drops task_total to
# 10 (10/60 = 0.167 < 0.5 floor) -- a genuine violation IF AND ONLY IF 'qa'
# is counted; this is the exact regression this fix closes.
#
# QA-COLLAPSE      -- negative control: qa[] wiped -> MUST be rejected (exit 1),
#                     fixture byte-unchanged. RED before the FLAT_TASK_LANES fix
#                     (both live/candidate qa[] silently excluded -> no drop
#                     detected, exit 0) -- GREEN after.
# QA-APPEND-HAPPY  -- regression guard: a normal additive write to qa[] (e.g.
#                     Review-Lane QA-Drain moving a task in) must NOT be blocked.
# =============================================================================
QA_LANE_LIVE="$FIXTURE_DIR/qa-lane-live.json"
N_QA_BACKLOG=10
N_QA=50

build_qa_lane_fixture() {
  jq -n \
    --argjson n_backlog "$N_QA_BACKLOG" \
    --argjson n_qa "$N_QA" \
    '{
      "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
      "head": {"status":"idle","active_task_id":null,"next_agent":null},
      "task_board": {
        "backlog": [range($n_backlog) | {id: ("QA-BACKLOG-" + (. | tostring)), status: "BACKLOG"}],
        "qa": [range($n_qa) | {id: ("QA-ROW-" + (. | tostring)), status: "QA"}],
        "active_sprints": []
      },
      "signal_queue": {
        "_updated_at": "2026-06-01T00:00:00Z",
        "_updated_by": "fixture",
        "rows": []
      }
    }' > "$QA_LANE_LIVE"
}
build_qa_lane_fixture

if ! bun "$VALIDATOR" "$QA_LANE_LIVE" >/dev/null 2>&1; then
  fail "QA-LANE setup — populated fixture failed standalone validation (test bug, not product bug)"
fi

QA_LANE_HASH_BEFORE=$(file_hash "$QA_LANE_LIVE")

# ─────────────────────────────────────────────────────────────────────────
# QA-COLLAPSE -- candidate wipes task_board.qa[] entirely, backlog untouched.
# task_total: live=60 (10 backlog + 50 qa) -> candidate=10 (10 backlog + 0 qa)
# = 0.167 < 0.5 floor. Pre-fix, qa[] was never summed on either side, so
# live/candidate both read as 10 -- no drop detected, exit 0 (the exact gap
# this fix closes). Post-fix, live=60 correctly counts qa[] -> caught.
# ─────────────────────────────────────────────────────────────────────────
QA_COLLAPSE_CANDIDATE=$(jq --arg now "2026-06-01T00:01:00Z" \
  '.task_board.qa = [] | ._meta.updated_at = $now' \
  "$QA_LANE_LIVE")

EXIT_QA_COLLAPSE=0
printf '%s' "$QA_COLLAPSE_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$QA_LANE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_QA_COLLAPSE=$?

if [ "$EXIT_QA_COLLAPSE" -eq 1 ]; then
  pass "QA-COLLAPSE — qa[] wipe rejected — exit 1"
else
  fail "QA-COLLAPSE — expected exit 1, got $EXIT_QA_COLLAPSE (qa[] lane is still blind to the conservation guard)"
fi

QA_LANE_HASH_AFTER_COLLAPSE=$(file_hash "$QA_LANE_LIVE")
if [ "$QA_LANE_HASH_BEFORE" = "$QA_LANE_HASH_AFTER_COLLAPSE" ]; then
  pass "QA-COLLAPSE — populated fixture UNCHANGED (no rename occurred)"
else
  fail "QA-COLLAPSE — populated fixture CHANGED (CRITICAL — conservation guard did not block the qa[] collapse)"
fi
assert_real_live_unchanged "QA-COLLAPSE"

# ─────────────────────────────────────────────────────────────────────────
# QA-APPEND-HAPPY — regression guard: a normal additive write to qa[] (one
# new row, e.g. a task landing in qa[] via the Review-Lane QA-Drain) must
# NOT be blocked by the now qa[]-aware guard.
# ─────────────────────────────────────────────────────────────────────────
QA_APPEND_CANDIDATE=$(jq --arg now "2026-06-01T00:02:00Z" \
  '.task_board.qa += [{"id":"QA-ROW-APPENDED","status":"QA"}] | ._meta.updated_at = $now' \
  "$QA_LANE_LIVE")

PRE_QA_APPEND_N=$(jq '.task_board.qa | length' "$QA_LANE_LIVE")

EXIT_QA_APPEND=0
printf '%s' "$QA_APPEND_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$QA_LANE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_QA_APPEND=$?

if [ "$EXIT_QA_APPEND" -eq 0 ]; then
  pass "QA-APPEND-HAPPY — legit qa[] append accepted — exit 0"
else
  fail "QA-APPEND-HAPPY — expected exit 0, got $EXIT_QA_APPEND"
fi

POST_QA_APPEND_N=$(jq '.task_board.qa | length' "$QA_LANE_LIVE" 2>/dev/null || echo -1)
if [ "$POST_QA_APPEND_N" = "$((PRE_QA_APPEND_N + 1))" ]; then
  pass "QA-APPEND-HAPPY — task_board.qa.length == pre+1"
else
  fail "QA-APPEND-HAPPY — task_board.qa.length expected $((PRE_QA_APPEND_N + 1)), got $POST_QA_APPEND_N"
fi

assert_real_live_unchanged "QA-APPEND-HAPPY"

# =============================================================================
# UPDATED_AT STAMPING TESTS (FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH)
# =============================================================================
# scripts/orch-apply.sh had ZERO timestamp handling — updated_at on task_board
# rows was stamped only by whichever ad-hoc jq caller happened to remember.
# Covers the Stage 1.5 diff-based stamp (scripts/orch-stamp-updated-at.mjs):
#   STAMP-CHANGED   — a row whose content actually changed gets a fresh
#                     updated_at, even though the caller's filter never
#                     mentions a timestamp.
#   STAMP-SIBLING   — an untouched sibling row's existing updated_at
#                     (including an existing null) is left byte-for-byte alone.
#   STAMP-NEWROW    — a brand-new row (no live counterpart by id) is treated
#                     as changed and gets stamped.
#   STAMP-IDEMPOTENT — re-applying an unchanged candidate a second time does
#                     NOT re-stamp (proves the stamp field is excluded from
#                     its own change predicate — no feedback loop / churn).
# =============================================================================
STAMP_LIVE="$FIXTURE_DIR/stamp-live.json"

jq -n '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {
    "backlog": [
      {"id":"STAMP-A","status":"BACKLOG","title":"original title"},
      {"id":"STAMP-B","status":"BACKLOG","title":"sibling untouched","updated_at":"2026-06-01T00:00:00Z"},
      {"id":"STAMP-C","status":"BACKLOG","title":"sibling never stamped"}
    ],
    "active_sprints": []
  },
  "signal_queue": {"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]}
}' > "$STAMP_LIVE"

# ─────────────────────────────────────────────────────────────────────────
# STAMP-CHANGED + STAMP-SIBLING — mutate ONLY STAMP-A's title; the filter
# never mentions updated_at or any timestamp.
# ─────────────────────────────────────────────────────────────────────────
STAMP_CANDIDATE_1=$(jq '(.task_board.backlog[] | select(.id=="STAMP-A")) |= (. + {title:"mutated title"})' "$STAMP_LIVE")

EXIT_STAMP_1=0
printf '%s' "$STAMP_CANDIDATE_1" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$STAMP_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_STAMP_1=$?

if [ "$EXIT_STAMP_1" -eq 0 ]; then
  pass "STAMP-CHANGED — mutated-row candidate accepted — exit 0"
else
  fail "STAMP-CHANGED — expected exit 0, got $EXIT_STAMP_1"
fi

STAMP_A_UPDATED_AT=$(jq -r '.task_board.backlog[] | select(.id=="STAMP-A") | .updated_at' "$STAMP_LIVE")
if [ -n "$STAMP_A_UPDATED_AT" ] && [ "$STAMP_A_UPDATED_AT" != "null" ]; then
  pass "STAMP-CHANGED — STAMP-A.updated_at stamped non-null ($STAMP_A_UPDATED_AT)"
else
  fail "STAMP-CHANGED — STAMP-A.updated_at expected non-null, got '$STAMP_A_UPDATED_AT'"
fi

STAMP_B_UPDATED_AT=$(jq -r '.task_board.backlog[] | select(.id=="STAMP-B") | .updated_at' "$STAMP_LIVE")
if [ "$STAMP_B_UPDATED_AT" = "2026-06-01T00:00:00Z" ]; then
  pass "STAMP-SIBLING — untouched STAMP-B.updated_at unchanged"
else
  fail "STAMP-SIBLING — untouched STAMP-B.updated_at expected baseline, got '$STAMP_B_UPDATED_AT'"
fi

STAMP_C_UPDATED_AT=$(jq -r '.task_board.backlog[] | select(.id=="STAMP-C") | .updated_at' "$STAMP_LIVE")
if [ "$STAMP_C_UPDATED_AT" = "null" ]; then
  pass "STAMP-SIBLING — untouched STAMP-C.updated_at stays null (no backfill)"
else
  fail "STAMP-SIBLING — untouched STAMP-C.updated_at expected null, got '$STAMP_C_UPDATED_AT'"
fi

assert_real_live_unchanged "STAMP-CHANGED"

# ─────────────────────────────────────────────────────────────────────────
# STAMP-NEWROW — append a brand-new row (no id-matching row in the live
# file); it must be treated as changed and stamped.
# ─────────────────────────────────────────────────────────────────────────
STAMP_CANDIDATE_NEW=$(jq '.task_board.backlog += [{"id":"STAMP-NEW","status":"BACKLOG","title":"brand new row"}]' "$STAMP_LIVE")

EXIT_STAMP_NEW=0
printf '%s' "$STAMP_CANDIDATE_NEW" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$STAMP_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_STAMP_NEW=$?

if [ "$EXIT_STAMP_NEW" -eq 0 ]; then
  pass "STAMP-NEWROW — new-row candidate accepted — exit 0"
else
  fail "STAMP-NEWROW — expected exit 0, got $EXIT_STAMP_NEW"
fi

STAMP_NEW_UPDATED_AT=$(jq -r '.task_board.backlog[] | select(.id=="STAMP-NEW") | .updated_at' "$STAMP_LIVE")
if [ -n "$STAMP_NEW_UPDATED_AT" ] && [ "$STAMP_NEW_UPDATED_AT" != "null" ]; then
  pass "STAMP-NEWROW — STAMP-NEW.updated_at stamped non-null ($STAMP_NEW_UPDATED_AT)"
else
  fail "STAMP-NEWROW — STAMP-NEW.updated_at expected non-null, got '$STAMP_NEW_UPDATED_AT'"
fi

assert_real_live_unchanged "STAMP-NEWROW"

# ─────────────────────────────────────────────────────────────────────────
# STAMP-IDEMPOTENT — re-apply the CURRENT fixture content unchanged (a
# no-op filter: `.`). No row's content differs from live -> zero rows
# should be re-stamped, including STAMP-A (must NOT bump past its
# just-landed timestamp from STAMP-CHANGED above).
# ─────────────────────────────────────────────────────────────────────────
STAMP_A_BEFORE_IDEMPOTENT="$STAMP_A_UPDATED_AT"

sleep 1  # force a distinct wall-clock second so a false re-stamp is detectable

EXIT_STAMP_IDEMPOTENT=0
jq '.' "$STAMP_LIVE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$STAMP_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_STAMP_IDEMPOTENT=$?

if [ "$EXIT_STAMP_IDEMPOTENT" -eq 0 ]; then
  pass "STAMP-IDEMPOTENT — unchanged candidate accepted — exit 0"
else
  fail "STAMP-IDEMPOTENT — expected exit 0, got $EXIT_STAMP_IDEMPOTENT"
fi

STAMP_A_AFTER_IDEMPOTENT=$(jq -r '.task_board.backlog[] | select(.id=="STAMP-A") | .updated_at' "$STAMP_LIVE")
if [ "$STAMP_A_AFTER_IDEMPOTENT" = "$STAMP_A_BEFORE_IDEMPOTENT" ]; then
  pass "STAMP-IDEMPOTENT — STAMP-A.updated_at NOT re-stamped on unchanged re-apply"
else
  fail "STAMP-IDEMPOTENT — STAMP-A.updated_at churned: before='$STAMP_A_BEFORE_IDEMPOTENT' after='$STAMP_A_AFTER_IDEMPOTENT'"
fi

assert_real_live_unchanged "STAMP-IDEMPOTENT"

# =============================================================================
# HEAD STAMPING TESTS (FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A)
# =============================================================================
# .head (top-level routing pointer, singular) had ZERO updated_at/updated_by
# stamping — 30+ ad-hoc jq callers replace it with a bare 3-field literal
# ({status,active_task_id,next_agent}) that omits both, and HeadSchema
# declares both .optional()+.passthrough() so it validates clean. This
# extends the SAME Stage 1.5 actuator (scripts/orch-stamp-updated-at.mjs) to
# also cover `.head`, diff-based, mirroring the row mechanism exactly:
#   HEAD-STAMP-CHANGED      — head content changed (caller SUPPLIES
#                             updated_by) -> updated_at freshly stamped,
#                             caller's updated_by preserved verbatim (never
#                             overridden — "comes from the caller").
#   HEAD-STAMP-BACKFILL     — head content changed via the EXACT buggy
#                             3-field-literal antipattern from the root
#                             cause (no updated_at, no updated_by) ->
#                             updated_at freshly stamped AND updated_by
#                             backfilled with the honest actuator fallback
#                             (never a fabricated agent name) — closes the
#                             recurrence gap without touching the 30+ callers.
#   HEAD-STAMP-IDEMPOTENT   — re-applying an unchanged head candidate a
#                             second time does NOT re-stamp either field
#                             (positive control per AC-6 — proves the stamp
#                             fields are excluded from their own change
#                             predicate, no feedback-loop churn).
# =============================================================================
HEAD_STAMP_LIVE="$FIXTURE_DIR/head-stamp-live.json"

jq -n '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":"router","updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture-agent"},
  "task_board": {"backlog": [{"id":"HEAD-STAMP-BACKLOG","status":"BACKLOG"}], "active_sprints": []},
  "signal_queue": {"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]}
}' > "$HEAD_STAMP_LIVE"

# ─────────────────────────────────────────────────────────────────────────
# HEAD-STAMP-CHANGED — candidate changes head.status, SUPPLIES its own
# updated_by (as most real callers do). updated_at must be freshly stamped;
# the caller-supplied updated_by must be preserved verbatim, not overridden.
# ─────────────────────────────────────────────────────────────────────────
HEAD_CANDIDATE_1=$(jq '.head = {status:"in_progress", active_task_id:"HEAD-STAMP-BACKLOG", next_agent:"developer", updated_by:"real-caller-agent"}' "$HEAD_STAMP_LIVE")

EXIT_HEAD_1=0
printf '%s' "$HEAD_CANDIDATE_1" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$HEAD_STAMP_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_HEAD_1=$?

if [ "$EXIT_HEAD_1" -eq 0 ]; then
  pass "HEAD-STAMP-CHANGED — mutated-head candidate accepted — exit 0"
else
  fail "HEAD-STAMP-CHANGED — expected exit 0, got $EXIT_HEAD_1"
fi

HEAD_UPDATED_AT_1=$(jq -r '.head.updated_at' "$HEAD_STAMP_LIVE")
if [ -n "$HEAD_UPDATED_AT_1" ] && [ "$HEAD_UPDATED_AT_1" != "null" ] && [ "$HEAD_UPDATED_AT_1" != "2026-06-01T00:00:00Z" ]; then
  pass "HEAD-STAMP-CHANGED — head.updated_at freshly stamped ($HEAD_UPDATED_AT_1)"
else
  fail "HEAD-STAMP-CHANGED — head.updated_at expected fresh non-baseline value, got '$HEAD_UPDATED_AT_1'"
fi

HEAD_UPDATED_BY_1=$(jq -r '.head.updated_by' "$HEAD_STAMP_LIVE")
if [ "$HEAD_UPDATED_BY_1" = "real-caller-agent" ]; then
  pass "HEAD-STAMP-CHANGED — caller-supplied head.updated_by preserved verbatim"
else
  fail "HEAD-STAMP-CHANGED — expected caller-supplied updated_by 'real-caller-agent', got '$HEAD_UPDATED_BY_1'"
fi

assert_real_live_unchanged "HEAD-STAMP-CHANGED"

# ─────────────────────────────────────────────────────────────────────────
# HEAD-STAMP-BACKFILL — candidate reproduces the EXACT root-cause
# antipattern: a bare whole-object head replace with ONLY 3 fields, no
# updated_at, no updated_by. Must be treated as changed (differs from live's
# 5-field head), get a fresh updated_at, AND get updated_by backfilled with
# the honest actuator fallback (never blank, never a fabricated agent name).
# ─────────────────────────────────────────────────────────────────────────
HEAD_CANDIDATE_2='{"status":"idle","active_task_id":null,"next_agent":"router"}'
HEAD_BACKFILL_CANDIDATE=$(jq --argjson h "$HEAD_CANDIDATE_2" '.head = $h' "$HEAD_STAMP_LIVE")

EXIT_HEAD_2=0
printf '%s' "$HEAD_BACKFILL_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$HEAD_STAMP_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_HEAD_2=$?

if [ "$EXIT_HEAD_2" -eq 0 ]; then
  pass "HEAD-STAMP-BACKFILL — bare 3-field head literal accepted — exit 0"
else
  fail "HEAD-STAMP-BACKFILL — expected exit 0, got $EXIT_HEAD_2"
fi

HEAD_UPDATED_AT_2=$(jq -r '.head.updated_at' "$HEAD_STAMP_LIVE")
if [ -n "$HEAD_UPDATED_AT_2" ] && [ "$HEAD_UPDATED_AT_2" != "null" ]; then
  pass "HEAD-STAMP-BACKFILL — head.updated_at stamped non-null ($HEAD_UPDATED_AT_2)"
else
  fail "HEAD-STAMP-BACKFILL — head.updated_at expected non-null, got '$HEAD_UPDATED_AT_2'"
fi

HEAD_UPDATED_BY_2=$(jq -r '.head.updated_by' "$HEAD_STAMP_LIVE")
if [ -n "$HEAD_UPDATED_BY_2" ] && [ "$HEAD_UPDATED_BY_2" != "null" ]; then
  pass "HEAD-STAMP-BACKFILL — head.updated_by backfilled non-null ($HEAD_UPDATED_BY_2)"
else
  fail "HEAD-STAMP-BACKFILL — head.updated_by expected non-null backfill, got '$HEAD_UPDATED_BY_2'"
fi

assert_real_live_unchanged "HEAD-STAMP-BACKFILL"

# ─────────────────────────────────────────────────────────────────────────
# HEAD-STAMP-IDEMPOTENT — re-apply the CURRENT fixture content unchanged
# (a no-op filter: `.`). Neither head.updated_at nor head.updated_by should
# be re-stamped (positive control per AC-6: unchanged input -> zero churn).
# ─────────────────────────────────────────────────────────────────────────
HEAD_UPDATED_AT_BEFORE_IDEMPOTENT="$HEAD_UPDATED_AT_2"
HEAD_UPDATED_BY_BEFORE_IDEMPOTENT="$HEAD_UPDATED_BY_2"

sleep 1  # force a distinct wall-clock second so a false re-stamp is detectable

EXIT_HEAD_IDEMPOTENT=0
jq '.' "$HEAD_STAMP_LIVE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$HEAD_STAMP_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_HEAD_IDEMPOTENT=$?

if [ "$EXIT_HEAD_IDEMPOTENT" -eq 0 ]; then
  pass "HEAD-STAMP-IDEMPOTENT — unchanged candidate accepted — exit 0"
else
  fail "HEAD-STAMP-IDEMPOTENT — expected exit 0, got $EXIT_HEAD_IDEMPOTENT"
fi

HEAD_UPDATED_AT_AFTER_IDEMPOTENT=$(jq -r '.head.updated_at' "$HEAD_STAMP_LIVE")
if [ "$HEAD_UPDATED_AT_AFTER_IDEMPOTENT" = "$HEAD_UPDATED_AT_BEFORE_IDEMPOTENT" ]; then
  pass "HEAD-STAMP-IDEMPOTENT — head.updated_at NOT re-stamped on unchanged re-apply"
else
  fail "HEAD-STAMP-IDEMPOTENT — head.updated_at churned: before='$HEAD_UPDATED_AT_BEFORE_IDEMPOTENT' after='$HEAD_UPDATED_AT_AFTER_IDEMPOTENT'"
fi

HEAD_UPDATED_BY_AFTER_IDEMPOTENT=$(jq -r '.head.updated_by' "$HEAD_STAMP_LIVE")
if [ "$HEAD_UPDATED_BY_AFTER_IDEMPOTENT" = "$HEAD_UPDATED_BY_BEFORE_IDEMPOTENT" ]; then
  pass "HEAD-STAMP-IDEMPOTENT — head.updated_by NOT re-stamped on unchanged re-apply"
else
  fail "HEAD-STAMP-IDEMPOTENT — head.updated_by churned: before='$HEAD_UPDATED_BY_BEFORE_IDEMPOTENT' after='$HEAD_UPDATED_BY_AFTER_IDEMPOTENT'"
fi

assert_real_live_unchanged "HEAD-STAMP-IDEMPOTENT"

# =============================================================================
# ROW-IDENTITY CONSERVATION TESTS (FIX-ORCHSTATE-SIGNALQUEUE-UNCOMMITTED-
# ROWS-LOST-TO-PEER-FULLDOC-WRITE)
# =============================================================================
# scripts/orch-conservation-check.mjs's magnitude-ratio floor is blind to a
# small, targeted signal_queue.rows[] drop (e.g. 2 of 133 = 98.5% retained,
# nowhere near the 0.5 floor). This is a SEPARATE, INDEPENDENT dimension: any
# live .signal_queue.rows[] id absent from candidate must be accounted for
# (candidate .signal_queue.archive[] OR ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS),
# else REJECTED — and, unlike the magnitude guard, NEVER bypassable by
# ORCH_APPLY_ALLOW_SHRINK (orthogonal claim: "total may shrink a lot" is not
# "any specific row may vanish unaccounted for").
#
# ROW-DROP-REJECTED         — undeclared drop of 1 of 2 live rows -> exit 1,
#                              live UNCHANGED (this is the exact incident shape:
#                              small drop, sails through the magnitude floor).
# ROW-DROP-ALLOW-SHRINK-NO-BYPASS — same undeclared drop WITH
#                              ORCH_APPLY_ALLOW_SHRINK set -> STILL exit 1,
#                              proving orthogonality from the magnitude bypass.
# ROW-DROP-DECLARED-ALLOWED — same drop, WITH the dropped id named in
#                              ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS -> exit 0.
# ROW-DROP-ARCHIVE-ACCOUNTED — same drop, but candidate's own
#                              .signal_queue.archive[] carries the dropped id
#                              -> exit 0 (defense-in-depth path).
# ROW-APPEND-HAPPY           — regression guard: adding a new signal row
#                              (zero drops) must not be affected at all.
# =============================================================================
ROWID_LIVE="$FIXTURE_DIR/rowid-live.json"

jq -n '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {"backlog": [{"id":"ROWID-BACKLOG","status":"BACKLOG"}], "active_sprints": []},
  "signal_queue": {
    "_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture",
    "rows": [
      {"id":"ROWID-SIG-A","summary":"row A","severity":"WARN","status":"NEW"},
      {"id":"ROWID-SIG-B","summary":"row B","severity":"WARN","status":"NEW"}
    ]
  }
}' > "$ROWID_LIVE"

ROWID_HASH_BEFORE=$(file_hash "$ROWID_LIVE")

# ─────────────────────────────────────────────────────────────────────────
# ROW-DROP-REJECTED — candidate silently drops ROWID-SIG-B (not in candidate
# .rows[], not in candidate .archive[], no declaration). task_total/signal_total
# ratio (1/2 = 50%, live=2 < MIN_BASELINE=10) never even reaches the magnitude
# guard — this drop is caught ONLY by the row-identity dimension.
# ─────────────────────────────────────────────────────────────────────────
ROWID_DROP_CANDIDATE=$(jq --arg now "2026-06-01T00:01:00Z" \
  '.signal_queue.rows = [.signal_queue.rows[] | select(.id != "ROWID-SIG-B")] | ._meta.updated_at = $now' \
  "$ROWID_LIVE")

EXIT_ROWID_DROP=0
printf '%s' "$ROWID_DROP_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$ROWID_LIVE" bash "$APPLY_SH" 2>/tmp/rowid-drop-stderr.$$ \
  || EXIT_ROWID_DROP=$?

if [ "$EXIT_ROWID_DROP" -eq 1 ]; then
  pass "ROW-DROP-REJECTED — undeclared signal row drop rejected — exit 1"
else
  fail "ROW-DROP-REJECTED — expected exit 1, got $EXIT_ROWID_DROP"
fi

if grep -q "ROWID-SIG-B" /tmp/rowid-drop-stderr.$$ 2>/dev/null; then
  pass "ROW-DROP-REJECTED — stderr names the dropped id (ROWID-SIG-B)"
else
  fail "ROW-DROP-REJECTED — stderr did not name the dropped id"
fi
rm -f /tmp/rowid-drop-stderr.$$

ROWID_HASH_AFTER_DROP=$(file_hash "$ROWID_LIVE")
if [ "$ROWID_HASH_BEFORE" = "$ROWID_HASH_AFTER_DROP" ]; then
  pass "ROW-DROP-REJECTED — fixture UNCHANGED (no rename occurred)"
else
  fail "ROW-DROP-REJECTED — fixture CHANGED (CRITICAL — undeclared row drop was applied)"
fi
assert_real_live_unchanged "ROW-DROP-REJECTED"

# ─────────────────────────────────────────────────────────────────────────
# ROW-DROP-ALLOW-SHRINK-NO-BYPASS — same undeclared drop, but WITH
# ORCH_APPLY_ALLOW_SHRINK set. Must STILL be exit 1 — proves the magnitude
# bypass does NOT cover the row-identity dimension (orthogonal axis).
# ─────────────────────────────────────────────────────────────────────────
EXIT_ROWID_DROP_SHRINK=0
printf '%s' "$ROWID_DROP_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$ROWID_LIVE" ORCH_APPLY_ALLOW_SHRINK="test-attempted-bypass" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_ROWID_DROP_SHRINK=$?

if [ "$EXIT_ROWID_DROP_SHRINK" -eq 1 ]; then
  pass "ROW-DROP-ALLOW-SHRINK-NO-BYPASS — ORCH_APPLY_ALLOW_SHRINK does NOT bypass row-identity — exit 1"
else
  fail "ROW-DROP-ALLOW-SHRINK-NO-BYPASS — expected exit 1 (bypass must not apply), got $EXIT_ROWID_DROP_SHRINK"
fi

ROWID_HASH_AFTER_SHRINK_ATTEMPT=$(file_hash "$ROWID_LIVE")
if [ "$ROWID_HASH_BEFORE" = "$ROWID_HASH_AFTER_SHRINK_ATTEMPT" ]; then
  pass "ROW-DROP-ALLOW-SHRINK-NO-BYPASS — fixture UNCHANGED"
else
  fail "ROW-DROP-ALLOW-SHRINK-NO-BYPASS — fixture CHANGED (CRITICAL — bypass leaked into row-identity gate)"
fi
assert_real_live_unchanged "ROW-DROP-ALLOW-SHRINK-NO-BYPASS"

# ─────────────────────────────────────────────────────────────────────────
# ROW-DROP-DECLARED-ALLOWED — same drop, but the dropped id is named in
# ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS (exactly how orch-cold-evict.sh wires
# it) -> exit 0, rename applies.
# ─────────────────────────────────────────────────────────────────────────
EXIT_ROWID_DECLARED=0
printf '%s' "$ROWID_DROP_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$ROWID_LIVE" ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS="ROWID-SIG-B" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_ROWID_DECLARED=$?

if [ "$EXIT_ROWID_DECLARED" -eq 0 ]; then
  pass "ROW-DROP-DECLARED-ALLOWED — declared eviction accepted — exit 0"
else
  fail "ROW-DROP-DECLARED-ALLOWED — expected exit 0, got $EXIT_ROWID_DECLARED"
fi

ROWID_POST_DECLARED_N=$(jq '.signal_queue.rows | length' "$ROWID_LIVE" 2>/dev/null || echo -1)
if [ "$ROWID_POST_DECLARED_N" = "1" ]; then
  pass "ROW-DROP-DECLARED-ALLOWED — fixture rows[] now length 1 (rename applied)"
else
  fail "ROW-DROP-DECLARED-ALLOWED — expected rows[] length 1, got $ROWID_POST_DECLARED_N"
fi
assert_real_live_unchanged "ROW-DROP-DECLARED-ALLOWED"

# Reset fixture for the remaining row-identity sub-tests (declared-allowed above mutated it)
jq -n '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {"backlog": [{"id":"ROWID-BACKLOG","status":"BACKLOG"}], "active_sprints": []},
  "signal_queue": {
    "_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture",
    "rows": [
      {"id":"ROWID-SIG-A","summary":"row A","severity":"WARN","status":"NEW"},
      {"id":"ROWID-SIG-B","summary":"row B","severity":"WARN","status":"NEW"}
    ]
  }
}' > "$ROWID_LIVE"

# ─────────────────────────────────────────────────────────────────────────
# ROW-DROP-ARCHIVE-ACCOUNTED — same drop from rows[], but the candidate's own
# .signal_queue.archive[] carries the dropped id (defense-in-depth path,
# independent of the env-var declaration) -> exit 0.
# ─────────────────────────────────────────────────────────────────────────
ROWID_ARCHIVE_CANDIDATE=$(jq --arg now "2026-06-01T00:02:00Z" \
  '.signal_queue.archive = [(.signal_queue.rows[] | select(.id == "ROWID-SIG-B"))]
   | .signal_queue.rows = [.signal_queue.rows[] | select(.id != "ROWID-SIG-B")]
   | ._meta.updated_at = $now' \
  "$ROWID_LIVE")

EXIT_ROWID_ARCHIVE=0
printf '%s' "$ROWID_ARCHIVE_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$ROWID_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_ROWID_ARCHIVE=$?

if [ "$EXIT_ROWID_ARCHIVE" -eq 0 ]; then
  pass "ROW-DROP-ARCHIVE-ACCOUNTED — id present in candidate .archive[] accepted — exit 0"
else
  fail "ROW-DROP-ARCHIVE-ACCOUNTED — expected exit 0, got $EXIT_ROWID_ARCHIVE"
fi
assert_real_live_unchanged "ROW-DROP-ARCHIVE-ACCOUNTED"

# Reset fixture again for the append regression test
jq -n '{
  "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "task_board": {"backlog": [{"id":"ROWID-BACKLOG","status":"BACKLOG"}], "active_sprints": []},
  "signal_queue": {
    "_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture",
    "rows": [
      {"id":"ROWID-SIG-A","summary":"row A","severity":"WARN","status":"NEW"},
      {"id":"ROWID-SIG-B","summary":"row B","severity":"WARN","status":"NEW"}
    ]
  }
}' > "$ROWID_LIVE"

# ─────────────────────────────────────────────────────────────────────────
# ROW-APPEND-HAPPY — regression guard: adding a new signal row (zero drops)
# must be entirely unaffected by the row-identity dimension.
# ─────────────────────────────────────────────────────────────────────────
ROWID_APPEND_CANDIDATE=$(jq --arg now "2026-06-01T00:03:00Z" \
  '.signal_queue.rows += [{"id":"ROWID-SIG-C","summary":"row C","severity":"WARN","status":"NEW"}]
   | ._meta.updated_at = $now' \
  "$ROWID_LIVE")

EXIT_ROWID_APPEND=0
printf '%s' "$ROWID_APPEND_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$ROWID_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_ROWID_APPEND=$?

if [ "$EXIT_ROWID_APPEND" -eq 0 ]; then
  pass "ROW-APPEND-HAPPY — new signal row (zero drops) accepted — exit 0"
else
  fail "ROW-APPEND-HAPPY — expected exit 0, got $EXIT_ROWID_APPEND"
fi

ROWID_POST_APPEND_N=$(jq '.signal_queue.rows | length' "$ROWID_LIVE" 2>/dev/null || echo -1)
if [ "$ROWID_POST_APPEND_N" = "3" ]; then
  pass "ROW-APPEND-HAPPY — fixture rows[] now length 3 (rename applied)"
else
  fail "ROW-APPEND-HAPPY — expected rows[] length 3, got $ROWID_POST_APPEND_N"
fi
assert_real_live_unchanged "ROW-APPEND-HAPPY"

# =============================================================================
# INBOX ROW-IDENTITY TESTS (FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-
# PO-INBOX-DRAIN-CLEAR)
# =============================================================================
# scripts/orch-conservation-check.mjs's magnitude-ratio floor previously folded
# dev_team_idle_chain.pending_triage_inbox[] into signal_total alongside
# signal_queue.rows[] -- but the inbox is a QUEUE meant to drain to zero on every
# legitimate dev-team Step-1 triage pass, not an accumulating log like
# signal_queue.rows[], so a single large legitimate clear tripped the same floor
# built to catch accidental mass-deletion, with the sole bypass
# (ORCH_APPLY_ALLOW_SHRINK) explicitly forbidden to this caller -- forcing
# artificial sequential sub-batching (reproduced live: 29 envelopes / 4 writes
# 2026-08-11, 248 envelopes / 4 writes 2026-08-14).
#
# Fix: the inbox is now EXCLUDED from signal_total entirely (a magnitude floor
# it is not part of can never block it) and given its own independent,
# never-bypassable per-envelope row-identity guard instead (mirrors the
# existing signal_queue.rows[] row-identity dimension one level down, via the
# new ORCH_APPLY_DECLARED_INBOX_TRIAGED env var).
#
# INBOX-FULL-DRAIN-DECLARED (AC-3)  -- the reported incident shape: 29-envelope
#   inbox drained to 0 in ONE write, every dropped id declared via
#   ORCH_APPLY_DECLARED_INBOX_TRIAGED, NO ORCH_APPLY_ALLOW_SHRINK set -- must be
#   exit 0 (previously required 4 artificial sub-batches to clear this size).
# INBOX-DROP-UNDECLARED-REJECTED    -- negative control: the exact same full
#   wipe, undeclared -- must still be exit 1 (proves the guard still catches an
#   accidental full wipe, not just weakened/removed).
# INBOX-DROP-ALLOW-SHRINK-NO-BYPASS -- orthogonality: ORCH_APPLY_ALLOW_SHRINK
#   does NOT bypass the inbox row-identity dimension either.
# INBOX-APPEND-HAPPY                -- regression guard: a normal single-entry
#   inbox append (zero drops) must not be blocked by either dimension.
# =============================================================================
INBOX_LIVE="$FIXTURE_DIR/inbox-live.json"
N_INBOX=29
N_INBOX_SIGNAL_ROWS=13

build_inbox_fixture() {
  jq -n \
    --argjson n_inbox "$N_INBOX" \
    --argjson n_rows "$N_INBOX_SIGNAL_ROWS" \
    '{
      "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-08-14T00:00:00Z","updated_by":"fixture"},
      "head": {"status":"idle","active_task_id":null,"next_agent":null},
      "task_board": {"backlog": [{"id":"INBOX-BACKLOG","status":"BACKLOG"}], "active_sprints": []},
      "signal_queue": {
        "_updated_at":"2026-08-14T00:00:00Z","_updated_by":"fixture",
        "rows": [range($n_rows) | {id: ("INBOX-SIG-" + (. | tostring)), summary: "fixture row", severity: "INFO", status: "NEW"}]
      },
      "dev_team_idle_chain": {
        "pending_triage_inbox": [range($n_inbox) | {envelope_id: ("INBOX-ENV-" + (. | tostring)), source: "file", from: "x", to: "dev-team", type: "y", priority: "LOW", payload: {}, createdAt: "2026-08-14T00:00:00Z"}]
      }
    }' > "$INBOX_LIVE"
}
build_inbox_fixture

if ! bun "$VALIDATOR" "$INBOX_LIVE" >/dev/null 2>&1; then
  fail "INBOX setup — populated fixture failed standalone validation (test bug, not product bug)"
fi

INBOX_HASH_BEFORE=$(file_hash "$INBOX_LIVE")
ALL_INBOX_IDS=$(jq -c '[.dev_team_idle_chain.pending_triage_inbox[].envelope_id]' "$INBOX_LIVE")
ALL_INBOX_IDS_CSV=$(echo "$ALL_INBOX_IDS" | jq -r 'join(",")')

INBOX_DRAIN_CANDIDATE=$(jq --arg now "2026-08-14T00:01:00Z" \
  '.dev_team_idle_chain.pending_triage_inbox = [] | .dev_team_idle_chain._updated_at = $now
   | .dev_team_idle_chain._updated_by = "dev-team" | ._meta.updated_at = $now' \
  "$INBOX_LIVE")

# ─────────────────────────────────────────────────────────────────────────
# INBOX-FULL-DRAIN-DECLARED (AC-3) — 29-envelope inbox drained to 0 in ONE
# write, declared, no ORCH_APPLY_ALLOW_SHRINK — must be exit 0.
# ─────────────────────────────────────────────────────────────────────────
EXIT_INBOX_DRAIN=0
printf '%s' "$INBOX_DRAIN_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$INBOX_LIVE" ORCH_APPLY_DECLARED_INBOX_TRIAGED="$ALL_INBOX_IDS_CSV" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_INBOX_DRAIN=$?

if [ "$EXIT_INBOX_DRAIN" -eq 0 ]; then
  pass "INBOX-FULL-DRAIN-DECLARED (AC-3) — 29-envelope inbox drained to 0 in ONE write, no bypass env var — exit 0"
else
  fail "INBOX-FULL-DRAIN-DECLARED (AC-3) — expected exit 0, got $EXIT_INBOX_DRAIN"
fi

INBOX_POST_DRAIN_N=$(jq '.dev_team_idle_chain.pending_triage_inbox | length' "$INBOX_LIVE" 2>/dev/null || echo -1)
if [ "$INBOX_POST_DRAIN_N" = "0" ]; then
  pass "INBOX-FULL-DRAIN-DECLARED (AC-3) — fixture inbox now empty (rename applied)"
else
  fail "INBOX-FULL-DRAIN-DECLARED (AC-3) — expected inbox length 0, got $INBOX_POST_DRAIN_N"
fi

INBOX_POST_DRAIN_ROWS_N=$(jq '.signal_queue.rows | length' "$INBOX_LIVE" 2>/dev/null || echo -1)
if [ "$INBOX_POST_DRAIN_ROWS_N" = "$N_INBOX_SIGNAL_ROWS" ]; then
  pass "INBOX-FULL-DRAIN-DECLARED (AC-3) — signal_queue.rows[] untouched (still $N_INBOX_SIGNAL_ROWS)"
else
  fail "INBOX-FULL-DRAIN-DECLARED (AC-3) — signal_queue.rows[] expected $N_INBOX_SIGNAL_ROWS, got $INBOX_POST_DRAIN_ROWS_N"
fi
assert_real_live_unchanged "INBOX-FULL-DRAIN-DECLARED"

# Reset fixture for the remaining inbox sub-tests (drain above mutated it)
build_inbox_fixture

# ─────────────────────────────────────────────────────────────────────────
# INBOX-DROP-UNDECLARED-REJECTED — same full wipe, undeclared — must still be
# exit 1 (guard still catches an accidental full wipe, not just weakened).
# ─────────────────────────────────────────────────────────────────────────
EXIT_INBOX_UNDECLARED=0
printf '%s' "$INBOX_DRAIN_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$INBOX_LIVE" bash "$APPLY_SH" 2>/tmp/inbox-undeclared-stderr.$$ \
  || EXIT_INBOX_UNDECLARED=$?

if [ "$EXIT_INBOX_UNDECLARED" -eq 1 ]; then
  pass "INBOX-DROP-UNDECLARED-REJECTED — undeclared full inbox wipe rejected — exit 1"
else
  fail "INBOX-DROP-UNDECLARED-REJECTED — expected exit 1, got $EXIT_INBOX_UNDECLARED"
fi

if grep -q "INBOX-ENV-0" /tmp/inbox-undeclared-stderr.$$ 2>/dev/null; then
  pass "INBOX-DROP-UNDECLARED-REJECTED — stderr names a dropped envelope_id (INBOX-ENV-0)"
else
  fail "INBOX-DROP-UNDECLARED-REJECTED — stderr did not name a dropped envelope_id"
fi
rm -f /tmp/inbox-undeclared-stderr.$$

INBOX_HASH_AFTER_UNDECLARED=$(file_hash "$INBOX_LIVE")
if [ "$INBOX_HASH_BEFORE" = "$INBOX_HASH_AFTER_UNDECLARED" ]; then
  pass "INBOX-DROP-UNDECLARED-REJECTED — fixture UNCHANGED (no rename occurred)"
else
  fail "INBOX-DROP-UNDECLARED-REJECTED — fixture CHANGED (CRITICAL — undeclared inbox wipe was applied)"
fi
assert_real_live_unchanged "INBOX-DROP-UNDECLARED-REJECTED"

# ─────────────────────────────────────────────────────────────────────────
# INBOX-DROP-ALLOW-SHRINK-NO-BYPASS — same undeclared wipe WITH
# ORCH_APPLY_ALLOW_SHRINK set — must STILL be exit 1.
# ─────────────────────────────────────────────────────────────────────────
EXIT_INBOX_SHRINK=0
printf '%s' "$INBOX_DRAIN_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$INBOX_LIVE" ORCH_APPLY_ALLOW_SHRINK="test-attempted-bypass" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_INBOX_SHRINK=$?

if [ "$EXIT_INBOX_SHRINK" -eq 1 ]; then
  pass "INBOX-DROP-ALLOW-SHRINK-NO-BYPASS — ORCH_APPLY_ALLOW_SHRINK does NOT bypass inbox row-identity — exit 1"
else
  fail "INBOX-DROP-ALLOW-SHRINK-NO-BYPASS — expected exit 1 (bypass must not apply), got $EXIT_INBOX_SHRINK"
fi

INBOX_HASH_AFTER_SHRINK=$(file_hash "$INBOX_LIVE")
if [ "$INBOX_HASH_BEFORE" = "$INBOX_HASH_AFTER_SHRINK" ]; then
  pass "INBOX-DROP-ALLOW-SHRINK-NO-BYPASS — fixture UNCHANGED"
else
  fail "INBOX-DROP-ALLOW-SHRINK-NO-BYPASS — fixture CHANGED (CRITICAL — bypass leaked into inbox row-identity gate)"
fi
assert_real_live_unchanged "INBOX-DROP-ALLOW-SHRINK-NO-BYPASS"

# ─────────────────────────────────────────────────────────────────────────
# INBOX-APPEND-HAPPY — regression guard: a normal single-entry inbox append
# (zero drops) must not be blocked by either dimension.
# ─────────────────────────────────────────────────────────────────────────
INBOX_APPEND_CANDIDATE=$(jq --arg now "2026-08-14T00:02:00Z" \
  '.dev_team_idle_chain.pending_triage_inbox += [{"envelope_id":"INBOX-ENV-NEW","source":"file","from":"x","to":"dev-team","type":"y","priority":"LOW","payload":{},"createdAt":"2026-08-14T00:02:00Z"}]
   | .dev_team_idle_chain._updated_at = $now | .dev_team_idle_chain._updated_by = "dev-team"
   | ._meta.updated_at = $now' \
  "$INBOX_LIVE")

EXIT_INBOX_APPEND=0
printf '%s' "$INBOX_APPEND_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$INBOX_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_INBOX_APPEND=$?

if [ "$EXIT_INBOX_APPEND" -eq 0 ]; then
  pass "INBOX-APPEND-HAPPY — new inbox envelope (zero drops) accepted — exit 0"
else
  fail "INBOX-APPEND-HAPPY — expected exit 0, got $EXIT_INBOX_APPEND"
fi

INBOX_POST_APPEND_N=$(jq '.dev_team_idle_chain.pending_triage_inbox | length' "$INBOX_LIVE" 2>/dev/null || echo -1)
if [ "$INBOX_POST_APPEND_N" = "$((N_INBOX + 1))" ]; then
  pass "INBOX-APPEND-HAPPY — inbox length == pre+1"
else
  fail "INBOX-APPEND-HAPPY — inbox length expected $((N_INBOX + 1)), got $INBOX_POST_APPEND_N"
fi
assert_real_live_unchanged "INBOX-APPEND-HAPPY"

# =============================================================================
# CALLER-BASELINE CAS TESTS (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ)
# =============================================================================
# AC-1: orch-apply.sh accepts a caller-observed baseline (env var carrying a
# content hash or mtime, captured by the CALLER immediately before its own jq
# read) and CAS-compares against THAT, instead of a freshly self-captured
# start-of-process value that can already postdate the caller's own read by
# an arbitrary gap — the exact defect this task fixes.
#
# CALLER-BASELINE-STALE-REJECTED (AC-2, positive control) — reproduces the
#   exact T0..T3 interleave from the incident:
#     T0 — "peer B" reads the live file and captures its baseline (hash) BEFORE
#          building its candidate.
#     T1 — a DIFFERENT writer ("peer A") applies a real, unrelated write to the
#          SAME live file via a real orch-apply.sh run (self-captured fallback
#          mode — proves this is a genuine peer write, not a stub).
#     T2 — "peer B" starts orch-apply.sh with its STALE candidate (built from
#          the T0 read) and its T0 baseline.
#     T3 — CAS re-check: live file now reflects T1's write, which differs from
#          the T0 baseline peer B captured -> MUST exit 2. Pre-fix (baseline
#          self-captured at this script's OWN startup, i.e. AFTER T1 already
#          landed) this would read MTIME_BEFORE==MTIME_AFTER and silently
#          apply peer B's stale candidate, clobbering peer A's write — the
#          exact incident.
# CALLER-BASELINE-SEQUENTIAL-HAPPY (AC-2, NEGATIVE CONTROL) — the same
#   caller-baseline mechanism, but a genuinely non-overlapping SEQUENTIAL
#   write (baseline captured immediately before the caller's own write, zero
#   concurrent writers) -> MUST still exit 0. Proves the new mechanism does
#   not spuriously reject a normal write merely because a baseline was
#   supplied.
# CALLER-BASELINE-MTIME-MODE — same stale-reject shape using the mtime
#   baseline variant (ORCH_APPLY_CALLER_BASELINE_MTIME) instead of hash, to
#   prove both AC-1 modes work, not just the hash path.
# CALLER-BASELINE-NOBASELINE-UNCHANGED (AC-1 explicit fallback clause) — a
#   caller supplying NEITHER env var gets EXACTLY today's self-captured
#   behaviour (already exercised end-to-end by every earlier test in this
#   file, none of which sets either new var — this assertion names it
#   explicitly).
# =============================================================================
CALLER_BASELINE_LIVE="$FIXTURE_DIR/caller-baseline-live.json"
printf '%s' "$VALID_FIXTURE" > "$CALLER_BASELINE_LIVE"

# T0 — peer B captures its baseline BEFORE building its candidate.
T0_BASELINE=$(file_hash "$CALLER_BASELINE_LIVE")
# Peer B's candidate, as if built from that T0 read (edits a field, unaware of what comes next).
STALE_CANDIDATE=$(jq --arg now "2026-06-01T00:05:00Z" \
  '.task_board.backlog[0].title = "peer B stale-read edit" | ._meta.updated_at = $now' \
  "$CALLER_BASELINE_LIVE")

# T1 — a DIFFERENT writer (peer A) applies a real, unrelated write via a real orch-apply.sh run.
# (Adds a benign passthrough field rather than changing `.status` — status/lane coherence is a
# separate, already-covered dimension; this test is isolated to the CAS baseline mechanism.)
PEER_A_CANDIDATE=$(jq --arg now "2026-06-01T00:01:00Z" \
  '.task_board.backlog[0].peer_a_note = "peer A landed" | ._meta.updated_at = $now' \
  "$CALLER_BASELINE_LIVE")
EXIT_PEER_A=0
printf '%s' "$PEER_A_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$CALLER_BASELINE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_PEER_A=$?
if [ "$EXIT_PEER_A" -ne 0 ]; then
  fail "CALLER-BASELINE setup — peer A's real write failed (test bug, not product bug), exit $EXIT_PEER_A"
fi

# T2/T3 — peer B applies its STALE candidate (built from T0) with the T0 baseline supplied.
EXIT_STALE=0
printf '%s' "$STALE_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$CALLER_BASELINE_LIVE" ORCH_APPLY_CALLER_BASELINE_HASH="$T0_BASELINE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_STALE=$?

if [ "$EXIT_STALE" -eq 2 ]; then
  pass "CALLER-BASELINE-STALE-REJECTED (AC-2) — stale caller baseline vs peer's intervening write — exit 2"
else
  fail "CALLER-BASELINE-STALE-REJECTED (AC-2) — expected exit 2, got $EXIT_STALE"
fi

POST_STALE_NOTE=$(jq -r '.task_board.backlog[0].peer_a_note' "$CALLER_BASELINE_LIVE")
if [ "$POST_STALE_NOTE" = "peer A landed" ]; then
  pass "CALLER-BASELINE-STALE-REJECTED (AC-2) — peer A's write NOT reverted (peer_a_note still present)"
else
  fail "CALLER-BASELINE-STALE-REJECTED (AC-2) — peer A's write was clobbered (peer_a_note=$POST_STALE_NOTE, expected 'peer A landed')"
fi
assert_real_live_unchanged "CALLER-BASELINE-STALE-REJECTED"

# ─────────────────────────────────────────────────────────────────────────
# CALLER-BASELINE-SEQUENTIAL-HAPPY (AC-2 negative control)
# ─────────────────────────────────────────────────────────────────────────
T0_HAPPY_BASELINE=$(file_hash "$CALLER_BASELINE_LIVE")
HAPPY_CANDIDATE=$(jq --arg now "2026-06-01T00:10:00Z" \
  '.task_board.backlog[0].title = "sequential legit edit" | ._meta.updated_at = $now' \
  "$CALLER_BASELINE_LIVE")

EXIT_SEQ_HAPPY=0
printf '%s' "$HAPPY_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$CALLER_BASELINE_LIVE" ORCH_APPLY_CALLER_BASELINE_HASH="$T0_HAPPY_BASELINE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_SEQ_HAPPY=$?

if [ "$EXIT_SEQ_HAPPY" -eq 0 ]; then
  pass "CALLER-BASELINE-SEQUENTIAL-HAPPY (AC-2 negative control) — non-overlapping sequential write with caller baseline — exit 0"
else
  fail "CALLER-BASELINE-SEQUENTIAL-HAPPY (AC-2 negative control) — expected exit 0, got $EXIT_SEQ_HAPPY"
fi

POST_SEQ_TITLE=$(jq -r '.task_board.backlog[0].title' "$CALLER_BASELINE_LIVE")
if [ "$POST_SEQ_TITLE" = "sequential legit edit" ]; then
  pass "CALLER-BASELINE-SEQUENTIAL-HAPPY — candidate applied (rename occurred)"
else
  fail "CALLER-BASELINE-SEQUENTIAL-HAPPY — candidate not applied (title=$POST_SEQ_TITLE)"
fi
assert_real_live_unchanged "CALLER-BASELINE-SEQUENTIAL-HAPPY"

# ─────────────────────────────────────────────────────────────────────────
# CALLER-BASELINE-MTIME-MODE — mtime variant of the stale-reject shape.
# ─────────────────────────────────────────────────────────────────────────
MTIME_MODE_LIVE="$FIXTURE_DIR/caller-baseline-mtime-live.json"
printf '%s' "$VALID_FIXTURE" > "$MTIME_MODE_LIVE"
touch -t 202001010000 "$MTIME_MODE_LIVE"   # deterministic T_old baseline — avoids same-second flake
T0_MTIME_BASELINE=$(stat -f "%m" "$MTIME_MODE_LIVE" 2>/dev/null || stat -c "%Y" "$MTIME_MODE_LIVE")
STALE_MTIME_CANDIDATE=$(jq --arg now "2026-06-01T00:05:00Z" \
  '.task_board.backlog[0].title = "peer B stale-read edit (mtime mode)" | ._meta.updated_at = $now' \
  "$MTIME_MODE_LIVE")

PEER_A_MTIME_CANDIDATE=$(jq --arg now "2026-06-01T00:01:00Z" \
  '.task_board.backlog[0].peer_a_note = "peer A landed" | ._meta.updated_at = $now' \
  "$MTIME_MODE_LIVE")
EXIT_PEER_A_MTIME=0
printf '%s' "$PEER_A_MTIME_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$MTIME_MODE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_PEER_A_MTIME=$?
if [ "$EXIT_PEER_A_MTIME" -ne 0 ]; then
  fail "CALLER-BASELINE-MTIME-MODE setup — peer A's real write failed (test bug, not product bug), exit $EXIT_PEER_A_MTIME"
fi

EXIT_STALE_MTIME=0
printf '%s' "$STALE_MTIME_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$MTIME_MODE_LIVE" ORCH_APPLY_CALLER_BASELINE_MTIME="$T0_MTIME_BASELINE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_STALE_MTIME=$?

if [ "$EXIT_STALE_MTIME" -eq 2 ]; then
  pass "CALLER-BASELINE-MTIME-MODE — stale mtime baseline vs peer's intervening write — exit 2"
else
  fail "CALLER-BASELINE-MTIME-MODE — expected exit 2, got $EXIT_STALE_MTIME"
fi
assert_real_live_unchanged "CALLER-BASELINE-MTIME-MODE"

# ─────────────────────────────────────────────────────────────────────────
# CALLER-BASELINE-NOBASELINE-UNCHANGED (AC-1 explicit fallback clause)
# ─────────────────────────────────────────────────────────────────────────
NOBASELINE_LIVE="$FIXTURE_DIR/caller-baseline-none-live.json"
printf '%s' "$VALID_FIXTURE" > "$NOBASELINE_LIVE"
EXIT_NOBASELINE=0
printf '%s' "$(jq '.task_board.backlog[0].peer_a_note = "no baseline supplied"' "$NOBASELINE_LIVE")" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$NOBASELINE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_NOBASELINE=$?
if [ "$EXIT_NOBASELINE" -eq 0 ]; then
  pass "CALLER-BASELINE-NOBASELINE-UNCHANGED (AC-1 fallback) — no env var supplied — exit 0, unaffected"
else
  fail "CALLER-BASELINE-NOBASELINE-UNCHANGED (AC-1 fallback) — expected exit 0, got $EXIT_NOBASELINE"
fi
assert_real_live_unchanged "CALLER-BASELINE-NOBASELINE-UNCHANGED"

# =============================================================================
# LANE-PLACEMENT TESTS (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ, AC-3)
# =============================================================================
# scripts/orch-conservation-check.mjs's magnitude-ratio floor is ALSO blind to
# a stale full-doc candidate that reverts a peer's lane-move: task_total nets
# to zero (the row still exists somewhere, just in an earlier lane), so the
# existing magnitude metric never fires. New independent dimension:
# undeclaredBackwardLaneMoves() flags 2+ undeclared rows moving to an
# earlier-pipeline-rank lane in ONE write (reproduces the incident: 5 rows
# silently reverted qa[]/review[] -> an earlier lane in a single stale
# full-doc write).
#
# LANE-BACKWARD-SINGLE-TOLERATED — a genuine SANCTIONED single-row backward
#   move (e.g. QA CHANGES_REQUESTED qa[]->review[]) must NOT be blocked.
# LANE-BACKWARD-MULTI-REJECTED — 2 rows reverting backward in ONE write (the
#   reproduced incident shape) -> exit 1, live UNCHANGED.
# LANE-BACKWARD-DECLARED-ALLOWED — the same 2-row revert, BOTH ids named in
#   ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES -> exit 0.
# LANE-FORWARD-BATCH-HAPPY — regression guard: several rows moving FORWARD in
#   one write (e.g. a QA_CAP batch claim) must be entirely unaffected.
# =============================================================================
LANE_LIVE="$FIXTURE_DIR/lane-placement-live.json"

build_lane_fixture() {
  jq -n '{
    "_meta": {"schema":"v4","ssot":true,"updated_at":"2026-06-01T00:00:00Z","updated_by":"fixture"},
    "head": {"status":"idle","active_task_id":null,"next_agent":null},
    "task_board": {
      "backlog": [{"id":"LANE-BACKLOG-1","status":"BACKLOG"}],
      "review": [{"id":"LANE-REVIEW-1","status":"REVIEW"}, {"id":"LANE-REVIEW-2","status":"REVIEW"}],
      "qa": [{"id":"LANE-QA-1","status":"QA"}, {"id":"LANE-QA-2","status":"QA"}],
      "active_sprints": []
    },
    "signal_queue": {"_updated_at":"2026-06-01T00:00:00Z","_updated_by":"fixture","rows":[]}
  }' > "$LANE_LIVE"
}
build_lane_fixture

if ! bun "$VALIDATOR" "$LANE_LIVE" >/dev/null 2>&1; then
  fail "LANE-PLACEMENT setup — populated fixture failed standalone validation (test bug, not product bug)"
fi

LANE_HASH_BEFORE=$(file_hash "$LANE_LIVE")

# ─────────────────────────────────────────────────────────────────────────
# LANE-BACKWARD-SINGLE-TOLERATED — LANE-QA-1 moves qa[] -> review[] (backward),
# the ONLY row this write touches. Must NOT be blocked.
# ─────────────────────────────────────────────────────────────────────────
SINGLE_BACKWARD_CANDIDATE=$(jq --arg now "2026-06-01T00:01:00Z" \
  '.task_board.qa = [.task_board.qa[] | select(.id != "LANE-QA-1")]
   | .task_board.review += [{"id":"LANE-QA-1","status":"REVIEW"}]
   | ._meta.updated_at = $now' \
  "$LANE_LIVE")

EXIT_SINGLE_BACKWARD=0
printf '%s' "$SINGLE_BACKWARD_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$LANE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_SINGLE_BACKWARD=$?

if [ "$EXIT_SINGLE_BACKWARD" -eq 0 ]; then
  pass "LANE-BACKWARD-SINGLE-TOLERATED — one sanctioned backward move (qa->review) accepted — exit 0"
else
  fail "LANE-BACKWARD-SINGLE-TOLERATED — expected exit 0, got $EXIT_SINGLE_BACKWARD"
fi
assert_real_live_unchanged "LANE-BACKWARD-SINGLE-TOLERATED"

# Reset fixture for the remaining lane-placement sub-tests
build_lane_fixture

# ─────────────────────────────────────────────────────────────────────────
# LANE-BACKWARD-MULTI-REJECTED (AC-3) — TWO rows revert backward in the SAME
# write (LANE-QA-1 qa->review, LANE-REVIEW-1 review->backlog), neither
# declared -> exit 1, live UNCHANGED.
# ─────────────────────────────────────────────────────────────────────────
MULTI_BACKWARD_CANDIDATE=$(jq --arg now "2026-06-01T00:02:00Z" \
  '.task_board.qa = [.task_board.qa[] | select(.id != "LANE-QA-1")]
   | .task_board.review = ([.task_board.review[] | select(.id != "LANE-REVIEW-1")] + [{"id":"LANE-QA-1","status":"REVIEW"}])
   | .task_board.backlog += [{"id":"LANE-REVIEW-1","status":"BACKLOG"}]
   | ._meta.updated_at = $now' \
  "$LANE_LIVE")

EXIT_MULTI_BACKWARD=0
printf '%s' "$MULTI_BACKWARD_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$LANE_LIVE" bash "$APPLY_SH" 2>/tmp/lane-multi-stderr.$$ \
  || EXIT_MULTI_BACKWARD=$?

if [ "$EXIT_MULTI_BACKWARD" -eq 1 ]; then
  pass "LANE-BACKWARD-MULTI-REJECTED (AC-3) — 2 undeclared backward moves in one write rejected — exit 1"
else
  fail "LANE-BACKWARD-MULTI-REJECTED (AC-3) — expected exit 1, got $EXIT_MULTI_BACKWARD"
fi

if grep -q "LANE-QA-1" /tmp/lane-multi-stderr.$$ 2>/dev/null && grep -q "LANE-REVIEW-1" /tmp/lane-multi-stderr.$$ 2>/dev/null; then
  pass "LANE-BACKWARD-MULTI-REJECTED — stderr names both backward-moved ids"
else
  fail "LANE-BACKWARD-MULTI-REJECTED — stderr did not name both backward-moved ids"
fi
rm -f /tmp/lane-multi-stderr.$$

LANE_HASH_AFTER_MULTI=$(file_hash "$LANE_LIVE")
if [ "$LANE_HASH_BEFORE" = "$LANE_HASH_AFTER_MULTI" ]; then
  pass "LANE-BACKWARD-MULTI-REJECTED — fixture UNCHANGED (no rename occurred)"
else
  fail "LANE-BACKWARD-MULTI-REJECTED — fixture CHANGED (CRITICAL — 2-row backward revert was applied)"
fi
assert_real_live_unchanged "LANE-BACKWARD-MULTI-REJECTED"

# ─────────────────────────────────────────────────────────────────────────
# LANE-BACKWARD-DECLARED-ALLOWED — same 2-row revert, BOTH ids declared -> exit 0.
# ─────────────────────────────────────────────────────────────────────────
EXIT_MULTI_DECLARED=0
printf '%s' "$MULTI_BACKWARD_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$LANE_LIVE" ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES="LANE-QA-1,LANE-REVIEW-1" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_MULTI_DECLARED=$?

if [ "$EXIT_MULTI_DECLARED" -eq 0 ]; then
  pass "LANE-BACKWARD-DECLARED-ALLOWED — both ids declared — exit 0"
else
  fail "LANE-BACKWARD-DECLARED-ALLOWED — expected exit 0, got $EXIT_MULTI_DECLARED"
fi
assert_real_live_unchanged "LANE-BACKWARD-DECLARED-ALLOWED"

# Reset fixture for the forward-batch regression test
build_lane_fixture

# ─────────────────────────────────────────────────────────────────────────
# LANE-FORWARD-BATCH-HAPPY — regression guard: BOTH review[] rows move
# FORWARD into qa[] in one write (e.g. a QA_CAP batch claim) — must be
# entirely unaffected by the backward-only guard.
# ─────────────────────────────────────────────────────────────────────────
FORWARD_BATCH_CANDIDATE=$(jq --arg now "2026-06-01T00:03:00Z" \
  '.task_board.qa += [{"id":"LANE-REVIEW-1","status":"QA"}, {"id":"LANE-REVIEW-2","status":"QA"}]
   | .task_board.review = []
   | ._meta.updated_at = $now' \
  "$LANE_LIVE")

EXIT_FORWARD_BATCH=0
printf '%s' "$FORWARD_BATCH_CANDIDATE" \
  | ORCH_APPLY_LIVE_FILE_OVERRIDE="$LANE_LIVE" bash "$APPLY_SH" 2>/dev/null \
  || EXIT_FORWARD_BATCH=$?

if [ "$EXIT_FORWARD_BATCH" -eq 0 ]; then
  pass "LANE-FORWARD-BATCH-HAPPY — 2-row FORWARD batch move (review->qa) accepted — exit 0"
else
  fail "LANE-FORWARD-BATCH-HAPPY — expected exit 0, got $EXIT_FORWARD_BATCH"
fi
assert_real_live_unchanged "LANE-FORWARD-BATCH-HAPPY"

# =============================================================================
# Summary
# =============================================================================
TOTAL=$((PASS+FAIL))
printf '\n─── orch-apply-wrapper-tests results ───\n'
printf 'PASS: %d / %d\n' "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  printf 'FAIL: %d / %d\n' "$FAIL" "$TOTAL"
  exit 1
fi
exit 0
