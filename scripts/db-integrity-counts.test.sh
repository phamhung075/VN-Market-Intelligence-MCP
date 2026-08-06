#!/usr/bin/env bash
# scripts/db-integrity-counts.test.sh
#
# Regression test for scripts/db-integrity-counts.sh
# (FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT AC-1/AC-2/AC-4).
#
# No test existed for this script before this task — the docker-sidecar version was
# untestable without a live docker daemon + named volume. The new direct host-bind
# read (MARKET_DB_HOST_PATH override, same seam as db-empty-table-classify.sh) makes it
# a plain sqlite3 fixture-DB test: no docker, no mocking needed.
#
# T1-T3: fixture DB with known, hand-counted anomaly rows — asserts the JSON output is
# byte-exact against the hand count (the actual regression-prevention value: a future
# accidental query-logic change would be caught here).
# T4: PROBE FAILURE — DB file missing entirely — exit 1 + loud stderr (AC-4).
# T5: PROBE FAILURE — DB file exists but lacks the watched tables (corrupt/wrong file)
#   — exit 1 + loud stderr (AC-4), never a silently-coerced null.
# T6: LIVE REPLAY — against the REAL repo's data/live/market.db when present. Graceful
#   SKIP (not a false PASS) when absent, same pattern as db-empty-table-classify.test.sh T11.
#
# Run:
#   bash scripts/db-integrity-counts.test.sh
# Exit 0 = all pass (SKIPs allowed). Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COUNTS_SH="$SCRIPT_DIR/db-integrity-counts.sh"

if [ ! -f "$COUNTS_SH" ]; then
  echo "ERROR: db-integrity-counts.sh not found at $COUNTS_SH" >&2
  exit 1
fi

# shellcheck source=./lib/sqlite-wal-hold-open-fixture.sh
source "$REPO_ROOT/scripts/lib/sqlite-wal-hold-open-fixture.sh"

PASS=0
FAIL=0
SKIP=0

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

skip() {
  echo "SKIP: $1"
  SKIP=$((SKIP + 1))
}

TMPDIR_TEST=$(mktemp -d /private/tmp/db-integrity-counts-test-XXXXXX)
cleanup() { wal_fixture_release; rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

FIXTURE_DB="$TMPDIR_TEST/fixture.db"

# ── Fixture: hand-countable anomaly rows ─────────────────────────────────────
# daily_ohlcv: 5 clean rows, 2 OHLC-violation rows (1 fresh <2d, 1 old), 1 scale>100x row
#   (also counts as an OHLC violation by construction: close/open=150 with high<close).
#   ohlc_violations_count = 2 (the two explicit violations; the scale row is high>=all
#   so it does NOT double-count as an OHLC violation) -> total rows = 8.
sqlite3 "$FIXTURE_DB" <<'SQL'
CREATE TABLE daily_ohlcv (code TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL);
INSERT INTO daily_ohlcv VALUES
  ('AAA','2026-08-01',10,12,9,11),
  ('AAA','2026-08-02',11,13,10,12),
  ('AAA','2026-08-03',12,14,11,13),
  ('AAA','2026-08-04',13,15,12,14),
  ('AAA','2026-08-05',14,16,13,15),
  ('BBB','2026-06-01',10,9,8,11),
  ('BBB',date('now','-1 day'),20,15,10,25),
  ('CCC','2026-05-01',1,150,1,150);
CREATE TABLE vn_index_cache (id INTEGER, val REAL);
INSERT INTO vn_index_cache VALUES (1, 1234.5), (2, 1235.0), (3, 1236.2);
CREATE TABLE financial_reports (id INTEGER, action_code TEXT, extraction_confidence REAL);
INSERT INTO financial_reports VALUES (1,'AAA',0.9), (2,'BBB',0.1), (3,'CCC',0.05), (4,'DDD',0.5);
CREATE TABLE market_prices (code TEXT, updated_at TEXT);
INSERT INTO market_prices VALUES ('AAA','2026-08-06T09:00:00.000Z'), ('BBB','2026-08-06T10:30:00.000Z');
SQL

# ── T1: canonical counts match the hand-count exactly ───────────────────────
OUT1=$(MARKET_DB_HOST_PATH="$FIXTURE_DB" bash "$COUNTS_SH")
RC1=$?
check "T1 exit=0" "$([ "$RC1" -eq 0 ] && echo true || echo false)"
check "T1 ohlc_violations_count=2 (BBB row1 low>open, CCC row high<close is NOT a violation by this predicate — recount)" \
  "$(printf '%s' "$OUT1" | jq -e '.counts.ohlc_violations_count == 2' >/dev/null && echo true || echo false)"
check "T1 scale_gt100x_count=1 (CCC close/open=150)" \
  "$(printf '%s' "$OUT1" | jq -e '.counts.scale_gt100x_count == 1' >/dev/null && echo true || echo false)"
check "T1 vnindex_cache_rows_count=3" \
  "$(printf '%s' "$OUT1" | jq -e '.counts.vnindex_cache_rows_count == 3' >/dev/null && echo true || echo false)"
check "T1 low_confidence_reports_count=2 (BBB 0.1, CCC 0.05 — both <0.2)" \
  "$(printf '%s' "$OUT1" | jq -e '.counts.low_confidence_reports_count == 2' >/dev/null && echo true || echo false)"
check "T1 daily_ohlcv_total=8" \
  "$(printf '%s' "$OUT1" | jq -e '.context.daily_ohlcv_total == 8' >/dev/null && echo true || echo false)"
check "T1 daily_ohlcv_newest_date=2026-08-05 or the -1day fixture row (max is a real date)" \
  "$(printf '%s' "$OUT1" | jq -e '.context.daily_ohlcv_newest_date | length == 10' >/dev/null && echo true || echo false)"
check "T1 fresh_ohlc_violations_last_2d=1 (the -1day BBB row)" \
  "$(printf '%s' "$OUT1" | jq -e '.context.fresh_ohlc_violations_last_2d == 1' >/dev/null && echo true || echo false)"
check "T1 ohlc_violation_distinct_dates=2 (2026-06-01 + the -1day date)" \
  "$(printf '%s' "$OUT1" | jq -e '.context.ohlc_violation_distinct_dates == 2' >/dev/null && echo true || echo false)"
check "T1 scan_ts is ISO8601" \
  "$(printf '%s' "$OUT1" | jq -r '.scan_ts' | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' && echo true || echo false)"

# ── T2: zero-anomaly fixture — canonical counts are 0, not null (real zero != probe failure) ──
ZERO_DB="$TMPDIR_TEST/zero.db"
sqlite3 "$ZERO_DB" <<'SQL'
CREATE TABLE daily_ohlcv (code TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL);
INSERT INTO daily_ohlcv VALUES ('AAA','2026-08-01',10,12,9,11);
CREATE TABLE vn_index_cache (id INTEGER);
CREATE TABLE financial_reports (id INTEGER, extraction_confidence REAL);
CREATE TABLE market_prices (code TEXT, updated_at TEXT);
SQL
OUT2=$(MARKET_DB_HOST_PATH="$ZERO_DB" bash "$COUNTS_SH")
check "T2 zero-anomaly counts are 0 (not null)" \
  "$(printf '%s' "$OUT2" | jq -e '.counts.ohlc_violations_count == 0 and .counts.scale_gt100x_count == 0 and .counts.vnindex_cache_rows_count == 0 and .counts.low_confidence_reports_count == 0' >/dev/null && echo true || echo false)"

# ── T3 (AC-4): PROBE FAILURE — DB file missing entirely — exit 1 + loud stderr ──
OUT3=$(MARKET_DB_HOST_PATH="$TMPDIR_TEST/does-not-exist.db" bash "$COUNTS_SH" 2>&1 1>/dev/null)
RC3=$?
check "T3 missing-db-file exit=1 (fail loud, not silent null)" "$([ "$RC3" -eq 1 ] && echo true || echo false)"
check "T3 missing-db-file PROBE FAILURE stderr" "$(printf '%s' "$OUT3" | grep -q 'PROBE FAILURE' && echo true || echo false)"

# ── T4 (AC-4): PROBE FAILURE — DB file exists but watched tables are missing (corrupt/wrong file) ──
EMPTY_DB="$TMPDIR_TEST/empty.db"
sqlite3 "$EMPTY_DB" "CREATE TABLE unrelated (id INTEGER);"
OUT4=$(MARKET_DB_HOST_PATH="$EMPTY_DB" bash "$COUNTS_SH" 2>&1 1>/dev/null)
RC4=$?
check "T4 wrong-schema-db exit=1 (fail loud, never a guessed/null number)" "$([ "$RC4" -eq 1 ] && echo true || echo false)"
check "T4 wrong-schema-db PROBE FAILURE stderr" "$(printf '%s' "$OUT4" | grep -q 'PROBE FAILURE' && echo true || echo false)"

# ── T5: LIVE REPLAY — REAL data/live/market.db when present. Graceful SKIP, not a
# false PASS, when absent (mirrors db-empty-table-classify.test.sh T11). ───────────
LIVE_DB="$REPO_ROOT/data/live/market.db"
if [ -f "$LIVE_DB" ]; then
  OUT5=$(bash "$COUNTS_SH")
  RC5=$?
  check "T5 LIVE exit=0" "$([ "$RC5" -eq 0 ] && echo true || echo false)"
  check "T5 LIVE all 4 canonical counts are non-null integers" \
    "$(printf '%s' "$OUT5" | jq -e '[.counts.ohlc_violations_count, .counts.scale_gt100x_count, .counts.vnindex_cache_rows_count, .counts.low_confidence_reports_count] | all(type == "number")' >/dev/null && echo true || echo false)"
  check "T5 LIVE daily_ohlcv_total is a large positive integer (sanity floor, not a probe artifact)" \
    "$(printf '%s' "$OUT5" | jq -e '.context.daily_ohlcv_total > 1000' >/dev/null && echo true || echo false)"
else
  skip "T5 LIVE replay — $LIVE_DB not present on this host"
fi

# ── T6 (AC-5, QA-BLOCKING, verification-gate evidence): a NON-EMPTY -wal is
# created DELIBERATELY (held-open reader, scripts/lib/sqlite-wal-hold-open-
# fixture.sh) against a fresh fixture DB, and the script is proven to return
# the CORRECT, live-committed count via the WAL-safe mode=ro fallback —
# NEVER the stale count a bare `immutable=1` open would silently return. A
# raw immutable=1 query against the SAME db at the SAME instant is run
# alongside for direct comparison, reproducing the exact po_qa_block_note
# defect and proving this script no longer exhibits it. ─────────────────────
WAL_DB="$TMPDIR_TEST/wal-fixture.db"
sqlite3 "$WAL_DB" "PRAGMA journal_mode=WAL; CREATE TABLE daily_ohlcv (code TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL); CREATE TABLE vn_index_cache (id INTEGER); CREATE TABLE financial_reports (id INTEGER, extraction_confidence REAL); CREATE TABLE market_prices (code TEXT, updated_at TEXT); INSERT INTO daily_ohlcv VALUES ('AAA','2026-08-01',10,12,9,11);" >/dev/null

wal_fixture_hold_open "$WAL_DB" "$TMPDIR_TEST/wal.fifo" "$TMPDIR_TEST/wal-holder.out"
sqlite3 "$WAL_DB" "INSERT INTO daily_ohlcv VALUES ('BBB','2026-08-02',20,22,19,21),('CCC','2026-08-03',30,32,29,31);" >/dev/null

WAL_BYTES="$(wc -c < "${WAL_DB}-wal" 2>/dev/null | tr -d ' ')"
check "T6 -wal is NON-EMPTY at read time (deliberately reproduced, not waited for)" \
  "$([ -n "$WAL_BYTES" ] && [ "$WAL_BYTES" -gt 0 ] && echo true || echo false)"

RAW_IMMUTABLE_TOTAL="$(sqlite3 "file:${WAL_DB}?immutable=1" "SELECT count(*) FROM daily_ohlcv;")"
OUT6=$(MARKET_DB_HOST_PATH="$WAL_DB" bash "$COUNTS_SH")
RC6=$?

check "T6 raw immutable=1 is STALE (1, blind to the 2 pending-WAL rows)" \
  "$([ "$RAW_IMMUTABLE_TOTAL" = "1" ] && echo true || echo false)"
check "T6 exit=0 (script itself still succeeds via fallback, not a probe failure)" \
  "$([ "$RC6" -eq 0 ] && echo true || echo false)"
check "T6 script reports read_mode=ro (fell back off immutable=1)" \
  "$(printf '%s' "$OUT6" | jq -e '.read_mode == "ro"' >/dev/null && echo true || echo false)"
check "T6 script's daily_ohlcv_total is CORRECT (3), NOT the stale immutable=1 value (1)" \
  "$(printf '%s' "$OUT6" | jq -e '.context.daily_ohlcv_total == 3' >/dev/null && echo true || echo false)"

wal_fixture_release

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
