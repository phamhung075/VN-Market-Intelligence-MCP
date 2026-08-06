#!/usr/bin/env bash
# scripts/db-integrity-dedup-check.test.sh
#
# Regression test for FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED
# (scripts/db-integrity-dedup-check.sh). AC-2's canonical regression case
# (T1 below) + AC-1's "all open lanes, not just backlog" + case-insensitive
# signal-status matching + the terminal-lane exclusion + the missing/malformed
# input degrade-gracefully paths.
#
# Isolated fixture files only — NEVER the live docs/data/orch/orch-state.json
# (mirrors scripts/emit-audit-signal.test.sh's TMPDIR_TEST convention).
#
# Run:
#   bash scripts/db-integrity-dedup-check.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEDUP_SH="$SCRIPT_DIR/db-integrity-dedup-check.sh"

if [ ! -f "$DEDUP_SH" ]; then
  echo "ERROR: db-integrity-dedup-check.sh not found at $DEDUP_SH" >&2
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

TMPDIR_TEST=$(mktemp -d /private/tmp/db-integrity-dedup-check-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

FIXTURE="$TMPDIR_TEST/orch-state.json"
export DB_INTEGRITY_DEDUP_ORCH_STATE_FILE="$FIXTURE"

run_check() { bash "$DEDUP_SH" --table "$1"; }

# ── T1: AC-2 canonical regression — CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR open
# in backlog[] (title uses "OHLCV", never the literal table name) — a fresh
# daily_ohlcv high=0/low=0 finding MUST be scored already_open=true via the
# curated ohlcv synonym, clause (a) task_board linkage. ───────────────────────
cat > "$FIXTURE" <<'JSON'
{
  "task_board": {
    "backlog": [
      { "id": "CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR", "status": "BACKLOG",
        "title": "CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR — recompute/clean the residue rows in daily_ohlcv" }
    ],
    "ready": [], "in_progress": [], "review": [], "qa": [],
    "done": [], "done_verified": []
  },
  "signal_queue": { "rows": [] }
}
JSON
OUT1=$(run_check daily_ohlcv)
check "T1 AC-2 regression already_open=true" "$(echo "$OUT1" | jq -e '.already_open==true' >/dev/null 2>&1 && echo true || echo false)"
check "T1 AC-2 regression matched_task_id correct" "$([ "$(echo "$OUT1" | jq -r .matched_task_id)" = "CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR" ] && echo true || echo false)"

# ── T2: clause (b) — signal_queue linkage, status stored lowercase "triaged"
# (the real live shape, e.g. sys-20260721T003810-2b02) must still count as
# open (case-insensitive status compare). ───────────────────────────────────
cat > "$FIXTURE" <<'JSON'
{
  "task_board": { "backlog": [], "ready": [], "in_progress": [], "review": [], "qa": [], "done": [], "done_verified": [] },
  "signal_queue": { "rows": [
    { "id": "sys-1", "type": "db_integrity_breach", "summary": "alerts: 1 orphaned alert in last 24h (check C-08)", "status": "triaged" }
  ] }
}
JSON
OUT2=$(run_check alerts)
check "T2 lowercase-status signal linkage already_open=true" "$(echo "$OUT2" | jq -e '.already_open==true' >/dev/null 2>&1 && echo true || echo false)"
check "T2 matched_signal_id correct" "$([ "$(echo "$OUT2" | jq -r .matched_signal_id)" = "sys-1" ] && echo true || echo false)"

# ── T3: no match anywhere — fresh table, no board/queue mentions ───────────
cat > "$FIXTURE" <<'JSON'
{
  "task_board": { "backlog": [{"id":"UNRELATED-TASK","status":"BACKLOG","title":"totally unrelated work"}], "ready": [], "in_progress": [], "review": [], "qa": [], "done": [], "done_verified": [] },
  "signal_queue": { "rows": [] }
}
JSON
OUT3=$(run_check scheduler_locks)
check "T3 no-match already_open=false" "$([ "$(echo "$OUT3" | jq -r .already_open)" = "false" ] && echo true || echo false)"

# ── T4: signal row present but TERMINAL status (e.g. DONE) must NOT count as
# open — only NEW/READ/TRIAGED/ACUTE-RESOLVED-ROOT-TRACKED gate the write. ──
cat > "$FIXTURE" <<'JSON'
{
  "task_board": { "backlog": [], "ready": [], "in_progress": [], "review": [], "qa": [], "done": [], "done_verified": [] },
  "signal_queue": { "rows": [
    { "id": "sys-2", "type": "db_integrity_breach", "summary": "alerts: resolved orphan issue", "status": "DONE" }
  ] }
}
JSON
OUT4=$(run_check alerts)
check "T4 terminal signal status does NOT suppress (already_open=false)" "$([ "$(echo "$OUT4" | jq -r .already_open)" = "false" ] && echo true || echo false)"

# ── T5: a matching id/title sitting in a TERMINAL task_board lane (done /
# done_verified) must NOT count as open — only the 5 non-terminal lanes are
# scanned, matching "all open lanes, not just backlog" (AC-1). ─────────────
cat > "$FIXTURE" <<'JSON'
{
  "task_board": {
    "backlog": [], "ready": [], "in_progress": [], "review": [], "qa": [],
    "done": [ { "id": "FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0", "status": "DONE_VERIFIED",
                "title": "FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0 — OHLCV writer root cause" } ],
    "done_verified": []
  },
  "signal_queue": { "rows": [] }
}
JSON
OUT5=$(run_check daily_ohlcv)
check "T5 terminal-lane task match does NOT suppress (already_open=false)" "$([ "$(echo "$OUT5" | jq -r .already_open)" = "false" ] && echo true || echo false)"

# ── T6: missing orch-state file — degrades to already_open=false + error,
# exit 0 (never crashes the caller's sweep). ────────────────────────────────
rm -f "$FIXTURE"
OUT6=$(run_check daily_ohlcv)
RC6=$?
check "T6 missing-file exit=0" "$([ "$RC6" -eq 0 ] && echo true || echo false)"
check "T6 missing-file already_open=false" "$([ "$(echo "$OUT6" | jq -r .already_open)" = "false" ] && echo true || echo false)"
check "T6 missing-file error field set" "$([ "$(echo "$OUT6" | jq -r .error)" != "null" ] && echo true || echo false)"

# ── T7: missing --table arg — usage-error mode, still exit 0 + error field
# (this is a read-only classifier, not a fail-loud probe — see script header). ─
OUT7=$(bash "$DEDUP_SH")
RC7=$?
check "T7 missing-table-arg exit=0" "$([ "$RC7" -eq 0 ] && echo true || echo false)"
check "T7 missing-table-arg error field set" "$([ "$(echo "$OUT7" | jq -r .error)" != "null" ] && echo true || echo false)"

# ── T8: case-insensitivity — uppercase table arg still matches lowercase
# board text, and vice versa. ───────────────────────────────────────────────
cat > "$FIXTURE" <<'JSON'
{
  "task_board": {
    "backlog": [ { "id": "CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR", "status": "BACKLOG", "title": "OHLCV residue" } ],
    "ready": [], "in_progress": [], "review": [], "qa": [], "done": [], "done_verified": []
  },
  "signal_queue": { "rows": [] }
}
JSON
OUT8=$(run_check DAILY_OHLCV)
check "T8 case-insensitive table arg already_open=true" "$([ "$(echo "$OUT8" | jq -r .already_open)" = "true" ] && echo true || echo false)"

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
