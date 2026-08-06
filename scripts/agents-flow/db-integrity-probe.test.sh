#!/usr/bin/env bash
# scripts/agents-flow/db-integrity-probe.test.sh
#
# Regression test for CADRAT-2 — exercises the SKIP-SPAWN / SPAWN verdict paths of
# db-integrity-probe.sh via a stubbed `sqlite3` (function-override after sourcing,
# same pattern as auditor-tier1-probe.test.sh's docker/curl/df stubs), so NO real
# DB call is made. The real script's DB access is READ-ONLY, direct host-bind
# (file:...?immutable=1, FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT) — this test
# never runs a real sqlite3 invocation against a live file.
#
# Run:
#   bash scripts/agents-flow/db-integrity-probe.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: CADRAT-2-DB-INTEGRITY-PROBE-PREGATE-AND-SCHEDULE-SPLIT
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROBE_SH="$SCRIPT_DIR/db-integrity-probe.sh"

if [ ! -f "$PROBE_SH" ]; then
  echo "ERROR: probe script not found at $PROBE_SH" >&2
  exit 1
fi

# shellcheck source=../lib/sqlite-wal-hold-open-fixture.sh
source "$SCRIPT_DIR/../lib/sqlite-wal-hold-open-fixture.sh"

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

# ── Isolated tmp fixture (snapshot output path) ───────────────────────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/db-integrity-probe-test-XXXXXX)
cleanup() { wal_fixture_release; rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

export SNAPSHOT_FILE_PATH="$TMPDIR_TEST/db-integrity-probe-last-snapshot.json"

# The 17 watched tables, in the SAME order the real script queries them (mirrors
# cron-db-data-integrity.md's own prompt list) — used to build stubbed sqlite3 output.
TABLES_LIST="daily_ohlcv market_prices market_prices_history vn_index_cache alerts price_alerts alert_engine_records agent_signals signal_outcomes financial_reports macro_indicators sbv_rates fred_series_daily deep_fetch_queue deep_fetch_stats cron_job_runs scheduler_locks"

# ── Source the script under test (guard prevents auto-exec: $0 != BASH_SOURCE) ──
# shellcheck source=./db-integrity-probe.sh
source "$PROBE_SH"

# ── Stub sqlite3 — override the real command pulled in by the script ─────────
# STUB_SIDECAR controls the canned live-query response:
#   ok          — all 17 tables, counts from $STUB_COUNTS (space-separated, same
#                 order as TABLES_LIST; default all "100")
#   short       — only 5 of 17 lines returned (parse-mismatch fault)
#   bad_order   — tables out of order (parse-mismatch fault)
#   garbage     — non-numeric count on one line (parse-mismatch fault)
#   fail        — sqlite3 itself returns non-zero (DB-unreachable fault)
#   empty       — sqlite3 returns rc=0 but empty stdout (DB-unreachable fault)
sqlite3() {
  case "${STUB_SIDECAR:-ok}" in
    fail) return 7 ;;
    empty) return 0 ;;
    ok)
      local i=0 t counts
      read -ra counts <<< "${STUB_COUNTS:-100 100 100 100 100 100 100 100 100 100 100 100 100 100 100 100 100}"
      for t in $TABLES_LIST; do
        printf '%s|%s\n' "$t" "${counts[$i]}"
        i=$((i + 1))
      done
      return 0
      ;;
    short)
      printf 'daily_ohlcv|100\nmarket_prices|100\nmarket_prices_history|100\nvn_index_cache|100\nalerts|100\n'
      return 0
      ;;
    bad_order)
      printf 'market_prices|100\ndaily_ohlcv|100\n'
      local rest=0
      for t in $TABLES_LIST; do
        [ "$rest" -lt 2 ] && { rest=$((rest + 1)); continue; }
        printf '%s|100\n' "$t"
      done
      return 0
      ;;
    garbage)
      local i=0 t
      for t in $TABLES_LIST; do
        if [ "$t" = "alerts" ]; then
          printf '%s|NOT-A-NUMBER\n' "$t"
        else
          printf '%s|100\n' "$t"
        fi
        i=$((i + 1))
      done
      return 0
      ;;
  esac
}

run_case() {
  STUB_SIDECAR="ok"
  STUB_COUNTS="100 100 100 100 100 100 100 100 100 100 100 100 100 100 100 100 100"
  rm -f "$SNAPSHOT_FILE_PATH"
}

_seed_snapshot() {
  # Seeds a valid snapshot with all 17 tables at rowcount=100, checked_at=now.
  jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
    { checked_at: $ts,
      tables: (
        ["daily_ohlcv","market_prices","market_prices_history","vn_index_cache",
         "alerts","price_alerts","alert_engine_records","agent_signals","signal_outcomes",
         "financial_reports","macro_indicators","sbv_rates","fred_series_daily",
         "deep_fetch_queue","deep_fetch_stats","cron_job_runs","scheduler_locks"]
        | map({key: ., value: {rowcount: 100}}) | from_entries
      )
    }' > "$SNAPSHOT_FILE_PATH"
}

# ── T1: SKIP-SPAWN — valid snapshot, every count matches exactly ─────────────
run_case
_seed_snapshot
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
CHANGED=$(printf '%s' "$OUT" | jq -r '.tables_changed')
check "T1 SKIP-SPAWN verdict on no-change" "$([ "$VERDICT" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T1 exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T1 tables_changed=0" "$([ "$CHANGED" = "0" ] && echo true || echo false)"
check "T1 verdict JSON is the ONLY stdout line" "$([ "$(printf '%s' "$OUT" | wc -l | tr -d ' ')" = "0" ] && echo true || echo false)"
check "T1 checked_at is ISO8601" "$(printf '%s' "$OUT" | jq -r '.checked_at' | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' && echo true || echo false)"

# ── T2: SPAWN trigger #1 — count-changed (1 of 17 tables differs) ────────────
run_case
_seed_snapshot
STUB_COUNTS="101 100 100 100 100 100 100 100 100 100 100 100 100 100 100 100 100"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
CHANGED=$(printf '%s' "$OUT" | jq -r '.tables_changed')
check "T2 SPAWN verdict on count-changed" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"
check "T2 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T2 tables_changed=1" "$([ "$CHANGED" = "1" ] && echo true || echo false)"
check "T2 snapshot REFRESHED to the new count" "$([ "$(jq -r '.tables.daily_ohlcv.rowcount' "$SNAPSHOT_FILE_PATH")" = "101" ] && echo true || echo false)"

# ── T3: SPAWN trigger #2 — snapshot-missing (first-run, no snapshot file at all) ──
run_case
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
CHANGED=$(printf '%s' "$OUT" | jq -r '.tables_changed')
check "T3 SPAWN verdict on snapshot-missing (first-run)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"
check "T3 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T3 tables_changed=17 (all tables, no baseline)" "$([ "$CHANGED" = "17" ] && echo true || echo false)"
check "T3 snapshot SEEDED (file now exists, valid)" "$([ -f "$SNAPSHOT_FILE_PATH" ] && jq -e '.tables.daily_ohlcv.rowcount' "$SNAPSHOT_FILE_PATH" >/dev/null 2>&1 && echo true || echo false)"

# ── T4: SPAWN trigger #3 — snapshot-malformed (invalid JSON) ─────────────────
run_case
echo 'not valid json {{{' > "$SNAPSHOT_FILE_PATH"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
CHANGED=$(printf '%s' "$OUT" | jq -r '.tables_changed')
check "T4 SPAWN verdict on snapshot-malformed" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"
check "T4 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T4 tables_changed=17 (treated as no-baseline)" "$([ "$CHANGED" = "17" ] && echo true || echo false)"
check "T4 snapshot RE-SEEDED with valid JSON" "$(jq -e '.tables.daily_ohlcv.rowcount' "$SNAPSHOT_FILE_PATH" >/dev/null 2>&1 && echo true || echo false)"

# ── T4b: SPAWN trigger #3b — snapshot-malformed (valid JSON, missing .tables key) ──
run_case
echo '{"checked_at":"2026-08-01T00:00:00Z"}' > "$SNAPSHOT_FILE_PATH"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T4b SPAWN verdict on snapshot missing .tables key" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"

# ── T5: SPAWN trigger #4 — live-query-failure (sqlite3 returns non-zero) ─────────
run_case
_seed_snapshot
BEFORE_MTIME=$(stat -f '%m' "$SNAPSHOT_FILE_PATH" 2>/dev/null || stat -c '%Y' "$SNAPSHOT_FILE_PATH" 2>/dev/null)
STUB_SIDECAR="fail"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
CHANGED=$(printf '%s' "$OUT" | jq -r '.tables_changed')
AFTER_MTIME=$(stat -f '%m' "$SNAPSHOT_FILE_PATH" 2>/dev/null || stat -c '%Y' "$SNAPSHOT_FILE_PATH" 2>/dev/null)
check "T5 SPAWN verdict on live-query-failure (sqlite3 non-zero exit)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"
check "T5 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T5 tables_changed=-1 (unknown sentinel)" "$([ "$CHANGED" = "-1" ] && echo true || echo false)"
check "T5 snapshot LEFT UNTOUCHED (mtime unchanged)" "$([ "$BEFORE_MTIME" = "$AFTER_MTIME" ] && echo true || echo false)"

# ── T5b: SPAWN trigger #4b — live-query-failure (sqlite3 rc=0 but empty stdout) ──
run_case
_seed_snapshot
STUB_SIDECAR="empty"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T5b SPAWN verdict on live-query-failure (empty output)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"

# ── T5c: SPAWN trigger #4c — live-query-failure (parse mismatch: too few lines) ──
run_case
_seed_snapshot
STUB_SIDECAR="short"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T5c SPAWN verdict on live-query-failure (only 5/17 lines returned)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"

# ── T5d: SPAWN trigger #4d — live-query-failure (parse mismatch: out-of-order tables) ──
run_case
_seed_snapshot
STUB_SIDECAR="bad_order"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T5d SPAWN verdict on live-query-failure (tables out of order)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"

# ── T5e: SPAWN trigger #4e — live-query-failure (parse mismatch: non-numeric count) ──
run_case
_seed_snapshot
STUB_SIDECAR="garbage"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T5e SPAWN verdict on live-query-failure (non-numeric count)" "$([ "$VERDICT" = "SPAWN" ] && echo true || echo false)"

# ── T6: multi-table change count is accurate (3 of 17 changed) ───────────────
run_case
_seed_snapshot
STUB_COUNTS="101 100 100 102 100 100 100 100 100 100 100 100 100 100 100 100 103"
OUT=$(run_probe); RC=$?
CHANGED=$(printf '%s' "$OUT" | jq -r '.tables_changed')
check "T6 tables_changed=3 (multi-table diff counted accurately)" "$([ "$CHANGED" = "3" ] && echo true || echo false)"

# ── T7 (AC-5, QA-BLOCKING, verification-gate evidence): REAL subprocess
# invocation (bash "$PROBE_SH", NOT the sourced/mocked `sqlite3` function
# above — a fresh `bash <file>` process never inherits this shell's function
# overrides) against a genuine fixture DB with a NON-EMPTY -wal, DELIBERATELY
# created via the held-open-reader fixture. Proves the live script detects a
# real committed change that a bare `immutable=1` open would have silently
# missed (the exact "voted SKIP-SPAWN on real drift" failure mode this
# script exists to prevent). ─────────────────────────────────────────────────
# NOTE: every direct sqlite3 call in this T7 block uses `command sqlite3` —
# T1-T6 above defined a shell FUNCTION named sqlite3() to stub the real
# binary; `command` bypasses it so this fixture setup hits the real sqlite3.
WAL_FIXTURE_DB="$TMPDIR_TEST/wal-fixture.db"
WAL_SNAPSHOT="$TMPDIR_TEST/wal-fixture-snapshot.json"
{
  echo "PRAGMA journal_mode=WAL;"
  for t in $TABLES_LIST; do
    echo "CREATE TABLE ${t} (x INTEGER); INSERT INTO ${t} VALUES (1);"
  done
} | command sqlite3 "$WAL_FIXTURE_DB" >/dev/null

jq -n --arg ts "2026-08-01T00:00:00Z" --arg tables_list "$TABLES_LIST" '
  { checked_at: $ts,
    tables: ($tables_list | split(" ") | map({key: ., value: {rowcount: 1}}) | from_entries)
  }' > "$WAL_SNAPSHOT"

wal_fixture_hold_open "$WAL_FIXTURE_DB" "$TMPDIR_TEST/probe-wal.fifo" "$TMPDIR_TEST/probe-wal-holder.out"
# Separate connection commits a real change to daily_ohlcv (rowcount 1 -> 2) —
# lands in -wal, checkpoint blocked by the held-open reader above.
command sqlite3 "$WAL_FIXTURE_DB" "INSERT INTO daily_ohlcv VALUES (2);" >/dev/null

WAL_BYTES_T7="$(wc -c < "${WAL_FIXTURE_DB}-wal" 2>/dev/null | tr -d ' ')"
check "T7 -wal is NON-EMPTY at read time (deliberately reproduced, not waited for)" \
  "$([ -n "$WAL_BYTES_T7" ] && [ "$WAL_BYTES_T7" -gt 0 ] && echo true || echo false)"

RAW_IMMUTABLE_DOHLCV="$(command sqlite3 "file:${WAL_FIXTURE_DB}?immutable=1" "SELECT count(*) FROM daily_ohlcv;")"
check "T7 raw immutable=1 is STALE (1, blind to the pending-WAL insert)" \
  "$([ "$RAW_IMMUTABLE_DOHLCV" = "1" ] && echo true || echo false)"

OUT7=$(MARKET_DB_HOST_PATH="$WAL_FIXTURE_DB" SNAPSHOT_FILE_PATH="$WAL_SNAPSHOT" bash "$PROBE_SH")
RC7=$?
VERDICT7=$(printf '%s' "$OUT7" | jq -r '.verdict')
CHANGED7=$(printf '%s' "$OUT7" | jq -r '.tables_changed')
READ_MODE7=$(printf '%s' "$OUT7" | jq -r '.read_mode')

check "T7 live script reports read_mode=ro (fell back off immutable=1)" \
  "$([ "$READ_MODE7" = "ro" ] && echo true || echo false)"
check "T7 live script correctly detects the real change (verdict=SPAWN, NOT SKIP-SPAWN)" \
  "$([ "$VERDICT7" = "SPAWN" ] && echo true || echo false)"
check "T7 live script tables_changed=1 (daily_ohlcv only — the WAL-blind bug would report 0)" \
  "$([ "$CHANGED7" = "1" ] && echo true || echo false)"
check "T7 exit=1 (SPAWN contract, unchanged)" "$([ "$RC7" -eq 1 ] && echo true || echo false)"

wal_fixture_release

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
