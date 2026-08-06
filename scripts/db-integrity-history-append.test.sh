#!/usr/bin/env bash
# scripts/db-integrity-history-append.test.sh
#
# Regression test for FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED
# (scripts/db-integrity-history-append.sh's new dedup-precheck + signal-write
# ownership, AC-1/AC-2/AC-5). Isolated scratch fixtures only — never the live
# docs/data files (mirrors scripts/emit-audit-signal.test.sh's convention;
# this script subprocess-calls the REAL scripts/db-integrity-dedup-check.sh
# and scripts/emit-audit-signal.sh against those scratch fixtures, exercising
# the REAL scripts/orch-apply.sh write path exactly like production).
#
# Run:
#   bash scripts/db-integrity-history-append.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPEND_SH="$SCRIPT_DIR/db-integrity-history-append.sh"

if [ ! -f "$APPEND_SH" ]; then
  echo "ERROR: db-integrity-history-append.sh not found at $APPEND_SH" >&2
  exit 1
fi

PASS=0
FAIL=0
check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"; PASS=$((PASS + 1))
  else
    echo "FAIL: $label"; FAIL=$((FAIL + 1))
  fi
}

TMPDIR_TEST=$(mktemp -d /private/tmp/db-integrity-history-append-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

HIST_FILE="$TMPDIR_TEST/db-integrity-history.json"
ORCH_FILE="$TMPDIR_TEST/orch-state.json"
LEDGER_FILE="$TMPDIR_TEST/auditor-dedup-ledger.json"

export DB_INTEGRITY_HISTORY="$HIST_FILE"
export DB_INTEGRITY_DEDUP_ORCH_STATE_FILE="$ORCH_FILE"
export EMIT_SIGNAL_ORCH_STATE_FILE="$ORCH_FILE"
export ORCH_APPLY_LIVE_FILE_OVERRIDE="$ORCH_FILE"
export EMIT_SIGNAL_LEDGER_FILE="$LEDGER_FILE"

# real scripts/orch-apply.sh runs the FULL Zod schema validator
# (apps/mcp-server/src/infrastructure/orchStateSchema.ts) — head (required),
# signal_queue._updated_at/_updated_by (required), task_board.backlog +
# task_board.active_sprints (required; every OTHER flat lane defaults to []),
# .strict() on both task_board and the root object (unknown keys REJECTED).
# This minimal base satisfies the schema by construction; a fixture COPIED
# from the live orch-state.json was tried first and rejected during this
# test's own development — the live file's OWN pre-existing, unrelated data
# (e.g. a `blocks` reference in done_verified[] that no longer resolves) can
# fail Stage-1 validation on ANY given day regardless of anything this test
# does, which would make the test flaky/non-deterministic over time. A
# hand-rolled minimal object side-steps that entirely and is also strictly
# faster (no live-file parse).
MINIMAL_BASE='{
  "head": {"status":"idle","active_task_id":null,"next_agent":null},
  "signal_queue": {"_updated_at":"2026-01-01T00:00:00Z","_updated_by":"test","rows":[]},
  "task_board": {"backlog":[], "active_sprints":[]}
}'

reset_case() {
  printf '[]\n' > "$HIST_FILE"
  printf '%s' "$MINIMAL_BASE" > "$ORCH_FILE"
  rm -f "$LEDGER_FILE"
}

write_orch_fixture() {
  # $1 = jq filter applied to a fresh copy of $MINIMAL_BASE
  printf '%s' "$MINIMAL_BASE" | jq "$1" > "$ORCH_FILE"
}

signal_row_count() { jq '.signal_queue.rows | length' "$ORCH_FILE" 2>/dev/null || echo 0; }
last_finding() { jq -c '.[-1].findings[0]' "$HIST_FILE"; }
history_len() { jq 'length' "$HIST_FILE" 2>/dev/null || echo 0; }

# $MINIMAL_BASE is already empty on every lane — this identity filter exists
# only so call sites read uniformly ("$CLEAR_OPEN_LANES | .task_board.backlog=[...]")
# whether or not they need to add anything on top of the bare minimum.
CLEAR_OPEN_LANES='.'

# ── T1: non-REAL finding (verdict=CLEAN) — passthrough unchanged, zero
# dedup-check/emit subprocess side effects, signal_id stays null. ──────────
reset_case
write_orch_fixture "$CLEAR_OPEN_LANES"
BEFORE_ROWS=$(signal_row_count)
OUT1=$(echo '{"tables_checked":1,"findings":[{"table":"daily_ohlcv","class":"DUP","verdict":"CLEAN","signal_id":null}]}' | bash "$APPEND_SH")
RC1=$?
AFTER_ROWS=$(signal_row_count)
check "T1 non-REAL exit=0" "$([ "$RC1" -eq 0 ] && echo true || echo false)"
check "T1 non-REAL history appended" "$([ "$(history_len)" -eq 1 ] && echo true || echo false)"
check "T1 non-REAL signal_id stays null" "$([ "$(last_finding | jq -r .signal_id)" = "null" ] && echo true || echo false)"
check "T1 non-REAL zero signal_queue rows written" "$([ "$BEFORE_ROWS" -eq "$AFTER_ROWS" ] && echo true || echo false)"

# ── T2: AC-2 canonical regression — REAL finding on daily_ohlcv, board already
# carries CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR (title uses "OHLCV", never the
# literal table name) — MUST be recorded already-open, NOT appended to
# .signal_queue.rows[]. ──────────────────────────────────────────────────────
reset_case
write_orch_fixture "$CLEAR_OPEN_LANES | .task_board.backlog=[{\"id\":\"CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR\",\"status\":\"BACKLOG\",\"title\":\"CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR — recompute/clean the residue rows\"}]"
BEFORE_ROWS2=$(signal_row_count)
OUT2=$(echo '{"tables_checked":1,"findings":[{"table":"daily_ohlcv","class":"INCORRECT","detail":"336 rows high=0/low=0","verdict":"REAL","severity":"CRITICAL","signal_id":null}]}' | bash "$APPEND_SH")
RC2=$?
AFTER_ROWS2=$(signal_row_count)
check "T2 AC-2 regression exit=0" "$([ "$RC2" -eq 0 ] && echo true || echo false)"
check "T2 AC-2 regression signal_id already-open" "$(last_finding | jq -r .signal_id | grep -q '^already-open:' && echo true || echo false)"
check "T2 AC-2 regression dedup_check embedded raw" "$(last_finding | jq -e '.dedup_check.already_open==true' >/dev/null 2>&1 && echo true || echo false)"
check "T2 AC-2 regression NO signal_queue row written" "$([ "$BEFORE_ROWS2" -eq "$AFTER_ROWS2" ] && echo true || echo false)"
check "T2 AC-2 regression OUTPUT-CONTRACT signal_write_failed=false" "$(echo "$OUT2" | jq -e '.signal_write_failed==false' >/dev/null 2>&1 && echo true || echo false)"

# ── T3: REAL finding, table with NO open match — writes a genuine NEW row via
# emit-audit-signal.sh --e3-only, with `to`/`payload_ref` HARDCODED (AC-5),
# never left to the finding/agent to supply. ────────────────────────────────
reset_case
write_orch_fixture "$CLEAR_OPEN_LANES"
BEFORE_ROWS3=$(signal_row_count)
OUT3=$(echo '{"tables_checked":1,"findings":[{"table":"scheduler_locks","class":"FAIL","detail":"lock stuck","verdict":"REAL","severity":"HIGH","signal_id":null}]}' | bash "$APPEND_SH")
RC3=$?
AFTER_ROWS3=$(signal_row_count)
NEW_SID=$(last_finding | jq -r .signal_id)
check "T3 fresh-table exit=0" "$([ "$RC3" -eq 0 ] && echo true || echo false)"
check "T3 fresh-table one new signal_queue row" "$([ "$AFTER_ROWS3" -eq $((BEFORE_ROWS3 + 1)) ] && echo true || echo false)"
check "T3 fresh-table signal_id is a real row id (not already-open/WRITE-FAILED)" "$([ "$NEW_SID" != "null" ] && [ "${NEW_SID#already-open}" = "$NEW_SID" ] && [ "$NEW_SID" != "WRITE-FAILED" ] && echo true || echo false)"
check "T3 fresh-table row.to == dev-team (AC-5 hardcoded)" "$([ "$(jq -r --arg id "$NEW_SID" '.signal_queue.rows[] | select(.id==$id) | .to' "$ORCH_FILE")" = "dev-team" ] && echo true || echo false)"
check "T3 fresh-table row.payload_ref == db-integrity-history.json (AC-5 hardcoded)" "$([ "$(jq -r --arg id "$NEW_SID" '.signal_queue.rows[] | select(.id==$id) | .payload_ref' "$ORCH_FILE")" = "docs/data/db-integrity-history.json" ] && echo true || echo false)"
check "T3 fresh-table row.status == NEW" "$([ "$(jq -r --arg id "$NEW_SID" '.signal_queue.rows[] | select(.id==$id) | .status' "$ORCH_FILE")" = "NEW" ] && echo true || echo false)"
check "T3 fresh-table OUTPUT signals_written has 1 entry" "$(echo "$OUT3" | jq -e '(.signals_written | length) == 1' >/dev/null 2>&1 && echo true || echo false)"

# ── T4: emit-audit-signal.sh write failure (simulated by pointing EMIT at a
# nonexistent stand-in via a broken ORCH_APPLY override) — signal_id becomes
# WRITE-FAILED, exit code is the NEW 4 (history still appended, never lost). ─
reset_case
write_orch_fixture "$CLEAR_OPEN_LANES"
# Point orch-apply's live-file override at a directory (not a file) so every
# write attempt fails deterministically without touching any real script logic.
BROKEN_DIR="$TMPDIR_TEST/not-a-file"
mkdir -p "$BROKEN_DIR"
BEFORE_HIST4=$(history_len)
OUT4=$(ORCH_APPLY_LIVE_FILE_OVERRIDE="$BROKEN_DIR" EMIT_SIGNAL_ORCH_STATE_FILE="$ORCH_FILE" \
  bash -c "echo '{\"tables_checked\":1,\"findings\":[{\"table\":\"scheduler_locks\",\"class\":\"FAIL\",\"detail\":\"x\",\"verdict\":\"REAL\",\"severity\":\"HIGH\",\"signal_id\":null}]}' | bash '$APPEND_SH'")
RC4=$?
check "T4 write-failure exit=4" "$([ "$RC4" -eq 4 ] && echo true || echo false)"
check "T4 write-failure signal_id is WRITE-FAILED" "$(bash -c "jq -c '.[-1].findings[0]' '$HIST_FILE'" | jq -r .signal_id | grep -q '^WRITE-FAILED$' && echo true || echo false)"
check "T4 write-failure history STILL appended (never lost)" "$([ "$(history_len)" -eq $((BEFORE_HIST4 + 1)) ] && echo true || echo false)"
check "T4 write-failure OUTPUT signal_write_failed=true" "$(echo "$OUT4" | jq -e '.signal_write_failed==true' >/dev/null 2>&1 && echo true || echo false)"

# ── T5: malformed stdin — pre-existing contract unchanged (exit 2). ────────
reset_case
OUT5=$(echo 'not json' | bash "$APPEND_SH" 2>&1)
RC5=$?
check "T5 malformed-stdin exit=2 (unchanged pre-existing contract)" "$([ "$RC5" -eq 2 ] && echo true || echo false)"

# ── T6: two REAL findings in ONE call — one already-open, one fresh — each
# handled independently; SIGNALS_WRITTEN captures only the fresh one. ──────
reset_case
write_orch_fixture "$CLEAR_OPEN_LANES | .task_board.backlog=[{\"id\":\"CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR\",\"status\":\"BACKLOG\",\"title\":\"OHLCV residue clean\"}]"
BEFORE_ROWS6=$(signal_row_count)
OUT6=$(echo '{"tables_checked":2,"findings":[
  {"table":"daily_ohlcv","class":"INCORRECT","detail":"residue","verdict":"REAL","severity":"CRITICAL","signal_id":null},
  {"table":"scheduler_locks","class":"FAIL","detail":"stuck lock","verdict":"REAL","severity":"HIGH","signal_id":null}
]}' | bash "$APPEND_SH")
RC6=$?
AFTER_ROWS6=$(signal_row_count)
F1_SID=$(jq -r '.[-1].findings[0].signal_id' "$HIST_FILE")
F2_SID=$(jq -r '.[-1].findings[1].signal_id' "$HIST_FILE")
check "T6 mixed-findings exit=0" "$([ "$RC6" -eq 0 ] && echo true || echo false)"
check "T6 mixed-findings finding[0] already-open" "$(printf '%s' "$F1_SID" | grep -q '^already-open:' && echo true || echo false)"
check "T6 mixed-findings finding[1] real new row id" "$([ "$F2_SID" != "null" ] && [ "${F2_SID#already-open}" = "$F2_SID" ] && echo true || echo false)"
check "T6 mixed-findings exactly ONE new signal_queue row" "$([ "$AFTER_ROWS6" -eq $((BEFORE_ROWS6 + 1)) ] && echo true || echo false)"
check "T6 mixed-findings OUTPUT signals_written has exactly 1 entry" "$(echo "$OUT6" | jq -e '(.signals_written | length) == 1' >/dev/null 2>&1 && echo true || echo false)"

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
