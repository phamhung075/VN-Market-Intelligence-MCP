#!/usr/bin/env bash
# scripts/auditor-db-checks.test.sh
#
# Regression test for scripts/auditor-db-checks.sh
# (FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE — spec: docs/handoffs/
# FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE-spec.md §5/§6).
#
# Fixture pattern mirrors scripts/db-integrity-counts.test.sh's MARKET_DB_HOST_PATH
# override seam — no docker, no mocking needed.
#
# T1: negative-control synthetic cohort (spec §5 step 3) — 20 extracted rows, 4 at
#     confidence<0.2 (20% > 15% bar) -> WARN.
# T2: companion check — flooding the fixture with pending_extraction shell rows must
#     NOT change extracted_total_window (population filter holds under volume, spec §5
#     step 4a).
# T3: companion check — lowering the low-confidence rows to 2/20 (10% < 15%) -> PASS
#     (spec §5 step 4b — a rate check must be able to say "healthy" too).
# T4: companion check — 10 extracted rows, 100% low-confidence, below the 20-row floor
#     -> PASS (spec §5 step 4c — thin populations never trip regardless of rate).
# T5: replay of the real 2026-07-19/20 historical incident shape (spec §1.2/§6) — 89
#     extracted rows, 6 low-confidence (6.74%) -> PASS (the exact batch that minted this
#     task's false-positive report under the OLD predicate must be healthy under the new one).
# T6: recency fix — a row with a stale published_at but a recently-touched parsed_at
#     (the exact reparse-mutation shape, spec §1.3) must NOT count toward
#     extracted_total_window (COALESCE reads published_at, ignores the parsed_at re-stamp).
# T7: D2 boundary — a genuine extraction failure (validation_status='failed',
#     extraction_confidence=0.0, spec §1.5's live POW 2026-Q1 case) DOES count (excluding by
#     validation_status, not by a confidence>0 cutoff, must not create this false negative).
# T8 (AC-4 parity with db-integrity-counts.sh): PROBE FAILURE — DB file missing — exit 1 +
#     loud stderr, never a silent null/zero.
# T9: PROBE FAILURE — DB file exists but lacks the watched table — exit 1 + loud stderr.
# T10: LIVE REPLAY — real data/live/market.db when present. Graceful SKIP when absent.
#
# Run:
#   bash scripts/auditor-db-checks.test.sh
# Exit 0 = all pass (SKIPs allowed). Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECKS_SH="$SCRIPT_DIR/auditor-db-checks.sh"

if [ ! -f "$CHECKS_SH" ]; then
  echo "ERROR: auditor-db-checks.sh not found at $CHECKS_SH" >&2
  exit 1
fi

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

TMPDIR_TEST=$(mktemp -d /private/tmp/auditor-db-checks-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

mk_schema() {
  sqlite3 "$1" <<'SQL'
CREATE TABLE financial_reports (
  id TEXT PRIMARY KEY,
  action_code TEXT,
  validation_status TEXT,
  extraction_confidence REAL,
  parsed_at TEXT,
  published_at TEXT
);
SQL
}

# ── T1: negative control — 20 extracted, 4 low-confidence (20%) -> WARN ─────
T1_DB="$TMPDIR_TEST/t1.db"
mk_schema "$T1_DB"
{
  for i in $(seq 1 4); do
    echo "INSERT INTO financial_reports VALUES ('lc$i','AAA','passed',0.05,datetime('now'),datetime('now'));"
  done
  for i in $(seq 1 16); do
    echo "INSERT INTO financial_reports VALUES ('ok$i','AAA','passed',0.9,datetime('now'),datetime('now'));"
  done
} | sqlite3 "$T1_DB"
OUT1=$(MARKET_DB_HOST_PATH="$T1_DB" bash "$CHECKS_SH")
RC1=$?
check "T1 exit=0" "$([ "$RC1" -eq 0 ] && echo true || echo false)"
check "T1 output is valid JSON" "$(printf '%s' "$OUT1" | jq -e . >/dev/null 2>&1 && echo true || echo false)"
check "T1 extracted_total_window=20" "$(printf '%s' "$OUT1" | jq -e '.checks.c04.extracted_total_window == 20' >/dev/null && echo true || echo false)"
check "T1 lowconf_count_window=4" "$(printf '%s' "$OUT1" | jq -e '.checks.c04.lowconf_count_window == 4' >/dev/null && echo true || echo false)"
check "T1 lowconf_rate_pct=20.00" "$(printf '%s' "$OUT1" | jq -e '.checks.c04.lowconf_rate_pct == 20' >/dev/null && echo true || echo false)"
check "T1 verdict=WARN (20% > 15% bar, >=20-row floor met)" "$(printf '%s' "$OUT1" | jq -er '.checks.c04.verdict' 2>/dev/null | grep -qx WARN && echo true || echo false)"

# ── T2: pending_extraction flood must NOT dilute/change extracted_total_window ──
sqlite3 "$T1_DB" "$(for i in $(seq 1 100); do echo "INSERT INTO financial_reports VALUES ('shell$i','ZZZ','pending_extraction',0,datetime('now'),NULL);"; done)"
OUT2=$(MARKET_DB_HOST_PATH="$T1_DB" bash "$CHECKS_SH")
check "T2 extracted_total_window UNCHANGED at 20 despite 100 pending_extraction rows" \
  "$(printf '%s' "$OUT2" | jq -e '.checks.c04.extracted_total_window == 20' >/dev/null && echo true || echo false)"
check "T2 verdict still WARN (population filter holds under shell-row volume)" \
  "$(printf '%s' "$OUT2" | jq -er '.checks.c04.verdict' 2>/dev/null | grep -qx WARN && echo true || echo false)"

# ── T3: lower low-confidence rows to 2/20 (10% < 15%) -> PASS ───────────────
T3_DB="$TMPDIR_TEST/t3.db"
mk_schema "$T3_DB"
{
  for i in $(seq 1 2); do
    echo "INSERT INTO financial_reports VALUES ('lc$i','AAA','passed',0.05,datetime('now'),datetime('now'));"
  done
  for i in $(seq 1 18); do
    echo "INSERT INTO financial_reports VALUES ('ok$i','AAA','passed',0.9,datetime('now'),datetime('now'));"
  done
} | sqlite3 "$T3_DB"
OUT3=$(MARKET_DB_HOST_PATH="$T3_DB" bash "$CHECKS_SH")
check "T3 extracted_total_window=20" "$(printf '%s' "$OUT3" | jq -e '.checks.c04.extracted_total_window == 20' >/dev/null && echo true || echo false)"
check "T3 lowconf_rate_pct=10.00" "$(printf '%s' "$OUT3" | jq -e '.checks.c04.lowconf_rate_pct == 10' >/dev/null && echo true || echo false)"
check "T3 verdict=PASS (10% under the 15% bar — check can say healthy)" \
  "$(printf '%s' "$OUT3" | jq -er '.checks.c04.verdict' 2>/dev/null | grep -qx PASS && echo true || echo false)"

# ── T4: 10 extracted rows, 100% low-confidence, below 20-row floor -> PASS ──
T4_DB="$TMPDIR_TEST/t4.db"
mk_schema "$T4_DB"
sqlite3 "$T4_DB" "$(for i in $(seq 1 10); do echo "INSERT INTO financial_reports VALUES ('lc$i','AAA','low_confidence',0.01,datetime('now'),datetime('now'));"; done)"
OUT4=$(MARKET_DB_HOST_PATH="$T4_DB" bash "$CHECKS_SH")
check "T4 extracted_total_window=10 (below the 20-row floor)" "$(printf '%s' "$OUT4" | jq -e '.checks.c04.extracted_total_window == 10' >/dev/null && echo true || echo false)"
check "T4 lowconf_rate_pct=100.00" "$(printf '%s' "$OUT4" | jq -e '.checks.c04.lowconf_rate_pct == 100' >/dev/null && echo true || echo false)"
check "T4 verdict=PASS (floor holds: thin population never trips regardless of rate)" \
  "$(printf '%s' "$OUT4" | jq -er '.checks.c04.verdict' 2>/dev/null | grep -qx PASS && echo true || echo false)"

# ── T5: replay of the real 2026-07-19/20 incident shape — 89 extracted, 6 low-confidence
# (6.74%) -> PASS (must NOT re-fire on the exact batch that minted this task) ───────────
T5_DB="$TMPDIR_TEST/t5.db"
mk_schema "$T5_DB"
{
  for i in $(seq 1 6); do
    echo "INSERT INTO financial_reports VALUES ('lc$i','AAA','low_confidence',0.1,datetime('now'),datetime('now'));"
  done
  for i in $(seq 1 83); do
    echo "INSERT INTO financial_reports VALUES ('ok$i','AAA','passed',0.9,datetime('now'),datetime('now'));"
  done
} | sqlite3 "$T5_DB"
OUT5=$(MARKET_DB_HOST_PATH="$T5_DB" bash "$CHECKS_SH")
check "T5 extracted_total_window=89" "$(printf '%s' "$OUT5" | jq -e '.checks.c04.extracted_total_window == 89' >/dev/null && echo true || echo false)"
check "T5 lowconf_count_window=6" "$(printf '%s' "$OUT5" | jq -e '.checks.c04.lowconf_count_window == 6' >/dev/null && echo true || echo false)"
check "T5 verdict=PASS (6.74% under the 15% bar — historical false-positive batch now healthy)" \
  "$(printf '%s' "$OUT5" | jq -er '.checks.c04.verdict' 2>/dev/null | grep -qx PASS && echo true || echo false)"

# ── T6: recency fix — stale published_at, fresh parsed_at (reparse-mutation shape) must
# NOT count (COALESCE reads published_at, ignores the parsed_at re-stamp) ──────────────
T6_DB="$TMPDIR_TEST/t6.db"
mk_schema "$T6_DB"
sqlite3 "$T6_DB" "INSERT INTO financial_reports VALUES ('old1','AAA','low_confidence',0.05,datetime('now'),datetime('now','-30 days'));"
OUT6=$(MARKET_DB_HOST_PATH="$T6_DB" bash "$CHECKS_SH")
check "T6 extracted_total_window=0 (published_at 30d stale excludes it despite parsed_at=now)" \
  "$(printf '%s' "$OUT6" | jq -e '.checks.c04.extracted_total_window == 0' >/dev/null && echo true || echo false)"
check "T6 verdict=PASS" "$(printf '%s' "$OUT6" | jq -er '.checks.c04.verdict' 2>/dev/null | grep -qx PASS && echo true || echo false)"

# ── T7: D2 boundary — genuine 'failed' extraction (confidence=0.0) DOES count, NOT
# excluded by a confidence>0 cutoff (spec §1.5/§2.3, live POW 2026-Q1 shape) ───────────
T7_DB="$TMPDIR_TEST/t7.db"
mk_schema "$T7_DB"
{
  echo "INSERT INTO financial_reports VALUES ('failed1','POW','failed',0.0,datetime('now'),datetime('now'));"
  for i in $(seq 1 19); do
    echo "INSERT INTO financial_reports VALUES ('ok$i','AAA','passed',0.9,datetime('now'),datetime('now'));"
  done
} | sqlite3 "$T7_DB"
OUT7=$(MARKET_DB_HOST_PATH="$T7_DB" bash "$CHECKS_SH")
check "T7 extracted_total_window=20 (the failed/0.0 row counts toward the population)" \
  "$(printf '%s' "$OUT7" | jq -e '.checks.c04.extracted_total_window == 20' >/dev/null && echo true || echo false)"
check "T7 lowconf_count_window=1 (the failed/0.0 row counts as low-confidence, not excluded)" \
  "$(printf '%s' "$OUT7" | jq -e '.checks.c04.lowconf_count_window == 1' >/dev/null && echo true || echo false)"

# ── T8 (AC-4 parity): PROBE FAILURE — DB file missing entirely — exit 1 + loud stderr ──
OUT8=$(MARKET_DB_HOST_PATH="$TMPDIR_TEST/does-not-exist.db" bash "$CHECKS_SH" 2>&1 1>/dev/null)
RC8=$?
check "T8 missing-db-file exit=1 (fail loud, not silent null)" "$([ "$RC8" -eq 1 ] && echo true || echo false)"
check "T8 missing-db-file PROBE FAILURE stderr" "$(printf '%s' "$OUT8" | grep -q 'PROBE FAILURE' && echo true || echo false)"

# ── T9: PROBE FAILURE — DB file exists but lacks financial_reports — exit 1 + loud stderr ──
EMPTY_DB="$TMPDIR_TEST/empty.db"
sqlite3 "$EMPTY_DB" "CREATE TABLE unrelated (id INTEGER);"
OUT9=$(MARKET_DB_HOST_PATH="$EMPTY_DB" bash "$CHECKS_SH" 2>&1 1>/dev/null)
RC9=$?
check "T9 wrong-schema-db exit=1 (fail loud, never a guessed/null number)" "$([ "$RC9" -eq 1 ] && echo true || echo false)"
check "T9 wrong-schema-db PROBE FAILURE stderr" "$(printf '%s' "$OUT9" | grep -q 'PROBE FAILURE' && echo true || echo false)"

# ── T10: LIVE REPLAY — REAL data/live/market.db when present. Graceful SKIP, not a
# false PASS, when absent (mirrors db-integrity-counts.test.sh T5). ────────────────────
LIVE_DB="$REPO_ROOT/data/live/market.db"
if [ -f "$LIVE_DB" ]; then
  OUT10=$(bash "$CHECKS_SH")
  RC10=$?
  check "T10 LIVE exit=0" "$([ "$RC10" -eq 0 ] && echo true || echo false)"
  check "T10 LIVE output is valid JSON (locale-safe decimal formatting)" \
    "$(printf '%s' "$OUT10" | jq -e . >/dev/null 2>&1 && echo true || echo false)"
  check "T10 LIVE extracted_total_window/lowconf_count_window are numbers" \
    "$(printf '%s' "$OUT10" | jq -e '[.checks.c04.extracted_total_window, .checks.c04.lowconf_count_window] | all(type == "number")' >/dev/null && echo true || echo false)"
  check "T10 LIVE verdict is PASS or WARN" \
    "$(printf '%s' "$OUT10" | jq -er '.checks.c04.verdict' 2>/dev/null | grep -qE '^(PASS|WARN)$' && echo true || echo false)"
else
  skip "T10 LIVE replay — $LIVE_DB not present on this host"
fi

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
