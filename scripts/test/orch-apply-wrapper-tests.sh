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
        "done_verified": [range($n_dv) | {id: ("POP-DV-" + (. | tostring)), status: "DONE_VERIFIED"}],
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
