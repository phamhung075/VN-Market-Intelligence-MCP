#!/usr/bin/env bash
# scripts/db-empty-table-classify.test.sh
#
# Regression test for scripts/db-empty-table-classify.sh
# (FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR).
#
# MANDATORY negative control (T7): a class-(a) table (genuine production/
# scheduled writer) forced to 0 rows MUST still classify severity_ceiling=
# may_stay_critical — proving this fix does not blanket-suppress every
# empty-table finding (which would be indistinguishable from disabling the
# check). T11 replays the actual 2026-08-06T06:57Z auditor-cycle tables
# against the REAL repo + REAL live DB when available (graceful SKIP, not a
# false PASS, when data/live/market.db is absent on the running host).
#
# Run:
#   bash scripts/db-empty-table-classify.test.sh
# Exit 0 = all pass (SKIPs allowed). Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLASSIFY_SH="$SCRIPT_DIR/db-empty-table-classify.sh"

if [ ! -f "$CLASSIFY_SH" ]; then
  echo "ERROR: db-empty-table-classify.sh not found at $CLASSIFY_SH" >&2
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

TMPDIR_TEST=$(mktemp -d /private/tmp/db-empty-table-classify-test-XXXXXX)
cleanup() { wal_fixture_release; rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

# shellcheck source=./db-empty-table-classify.sh
source "$CLASSIFY_SH"
# shellcheck source=./lib/sqlite-wal-hold-open-fixture.sh
source "$SCRIPT_DIR/lib/sqlite-wal-hold-open-fixture.sh"

# ── Fixture DB + fixture source tree (shared, unique table name per case) ──
FIXTURE_DB="$TMPDIR_TEST/fixture.db"
FIXTURE_SRC="$TMPDIR_TEST/src"
mkdir -p \
  "$FIXTURE_SRC/apps/mcp-server/src/__tests__" \
  "$FIXTURE_SRC/apps/mcp-server/src/interface/mcp/tools/fx6" \
  "$FIXTURE_SRC/apps/mcp-server/src/interface/mcp/tools/fx10" \
  "$FIXTURE_SRC/apps/mcp-server/src/scheduler/fx7" \
  "$FIXTURE_SRC/apps/mcp-server/src/scheduler/fx10" \
  "$FIXTURE_SRC/apps/mcp-server/src/scheduler/x" \
  "$FIXTURE_SRC/apps/mcp-server/src/application/usecases" \
  "$FIXTURE_SRC/apps/alert-engine/pkg/infrastructure"

sqlite3 "$FIXTURE_DB" <<'SQL'
CREATE TABLE t5_table_b (id INTEGER);
CREATE TABLE t5b_table_b_nowriter (id INTEGER);
CREATE TABLE t6_table_c (id INTEGER);
CREATE TABLE t7_table_a (id INTEGER);
CREATE TABLE t8_table_a_nonzero (id INTEGER);
INSERT INTO t8_table_a_nonzero VALUES (1),(2),(3);
CREATE TABLE t9_table_excluded_visible (id INTEGER);
CREATE TABLE t10_table_mixed (id INTEGER);
SQL
# t4_table_missing deliberately NOT created (SCHEMA-MISSING fixture).

echo "INSERT INTO t4_table_missing (a) VALUES (1);" > "$FIXTURE_SRC/apps/mcp-server/src/scheduler/x/j1.ts"
echo "INSERT INTO t5_table_b (a) VALUES (1);" > "$FIXTURE_SRC/apps/mcp-server/src/__tests__/fx5.test.ts"
echo "INSERT INTO t5_table_b (a) VALUES (1);" > "$FIXTURE_SRC/apps/alert-engine/pkg/infrastructure/fx5.go"
echo "INSERT INTO t6_table_c (a) VALUES (1);" > "$FIXTURE_SRC/apps/mcp-server/src/interface/mcp/tools/fx6/tool.ts"
echo "INSERT INTO t7_table_a (a) VALUES (1);" > "$FIXTURE_SRC/apps/mcp-server/src/scheduler/fx7/job.ts"
echo "INSERT INTO t8_table_a_nonzero (a) VALUES (1);" > "$FIXTURE_SRC/apps/mcp-server/src/application/usecases/fx8.ts"
echo "INSERT INTO t9_table_excluded_visible (a) VALUES (1);" > "$FIXTURE_SRC/apps/alert-engine/pkg/infrastructure/fx9.go"
echo "INSERT INTO t10_table_mixed (a) VALUES (1);" > "$FIXTURE_SRC/apps/mcp-server/src/interface/mcp/tools/fx10/tool.ts"
echo "INSERT OR REPLACE INTO t10_table_mixed (a) VALUES (2);" > "$FIXTURE_SRC/apps/mcp-server/src/scheduler/fx10/job.ts"

export MARKET_DB_HOST_PATH="$FIXTURE_DB"
export DB_CLASSIFY_SEARCH_ROOT="$FIXTURE_SRC/apps"

# ── T1: usage error — no table arg ──────────────────────────────────────────
OUT1=$(run_db_empty_table_classify 2>&1)
RC1=$?
check "T1 no-arg exit=2" "$([ "$RC1" -eq 2 ] && echo true || echo false)"
check "T1 no-arg ABORT message" "$(printf '%s' "$OUT1" | grep -q 'ABORT usage' && echo true || echo false)"

# ── T2: invalid table name (leading digit) ──────────────────────────────────
OUT2=$(run_db_empty_table_classify "1abc" 2>&1)
RC2=$?
check "T2 invalid-leading-digit exit=2" "$([ "$RC2" -eq 2 ] && echo true || echo false)"

# ── T2b: invalid table name (injection-shaped) ──────────────────────────────
OUT2B=$(run_db_empty_table_classify "foo;drop table x;--" 2>&1)
RC2B=$?
check "T2b invalid-injection-shaped exit=2" "$([ "$RC2B" -eq 2 ] && echo true || echo false)"

# ── T3: DB file missing entirely — PROBE FAILURE, not a silent class ────────
OUT3=$(MARKET_DB_HOST_PATH="$TMPDIR_TEST/does-not-exist.db" run_db_empty_table_classify t7_table_a 2>&1)
RC3=$?
check "T3 missing-db-file exit=1" "$([ "$RC3" -eq 1 ] && echo true || echo false)"
check "T3 missing-db-file PROBE FAILURE message" "$(printf '%s' "$OUT3" | grep -q 'PROBE FAILURE: DB file not found' && echo true || echo false)"

# ── T4: SCHEMA-MISSING dominates even when a writer-site reference exists ──
OUT4=$(run_db_empty_table_classify t4_table_missing)
RC4=$?
check "T4 schema-missing exit=0" "$([ "$RC4" -eq 0 ] && echo true || echo false)"
check "T4 schema-missing exists=false" "$(printf '%s' "$OUT4" | jq -e '.exists == false' >/dev/null && echo true || echo false)"
check "T4 schema-missing row_count=null" "$(printf '%s' "$OUT4" | jq -e '.row_count == null' >/dev/null && echo true || echo false)"
check "T4 schema-missing class=SCHEMA-MISSING" "$(printf '%s' "$OUT4" | jq -e '.class == "SCHEMA-MISSING"' >/dev/null && echo true || echo false)"
check "T4 schema-missing severity_ceiling=always_report" "$(printf '%s' "$OUT4" | jq -e '.severity_ceiling == "always_report"' >/dev/null && echo true || echo false)"

# ── T5: class b — every writer site is test-only / excluded-other-db ──────
OUT5=$(run_db_empty_table_classify t5_table_b)
check "T5 class-b exists=true row_count=0" "$(printf '%s' "$OUT5" | jq -e '.exists == true and .row_count == 0' >/dev/null && echo true || echo false)"
check "T5 class-b class=b" "$(printf '%s' "$OUT5" | jq -e '.class == "b"' >/dev/null && echo true || echo false)"
check "T5 class-b severity_ceiling=info_at_most_never_critical" "$(printf '%s' "$OUT5" | jq -e '.severity_ceiling == "info_at_most_never_critical"' >/dev/null && echo true || echo false)"
check "T5 class-b writer_sites has 2 entries (test + excluded-other-db)" "$(printf '%s' "$OUT5" | jq -e '.writer_sites | length == 2' >/dev/null && echo true || echo false)"

# ── T5b: class b — zero writer sites at all ─────────────────────────────────
OUT5B=$(run_db_empty_table_classify t5b_table_b_nowriter)
check "T5b class-b-nowriter class=b" "$(printf '%s' "$OUT5B" | jq -e '.class == "b"' >/dev/null && echo true || echo false)"
check "T5b class-b-nowriter writer_sites=[]" "$(printf '%s' "$OUT5B" | jq -e '.writer_sites == []' >/dev/null && echo true || echo false)"

# ── T6: class c — sole writer is an on-demand MCP tool ──────────────────────
OUT6=$(run_db_empty_table_classify t6_table_c)
check "T6 class-c class=c" "$(printf '%s' "$OUT6" | jq -e '.class == "c"' >/dev/null && echo true || echo false)"
check "T6 class-c severity_ceiling=info_or_warn_corroborate_to_escalate" "$(printf '%s' "$OUT6" | jq -e '.severity_ceiling == "info_or_warn_corroborate_to_escalate"' >/dev/null && echo true || echo false)"
check "T6 class-c writer_sites kind=on-demand-tool" "$(printf '%s' "$OUT6" | jq -e '.writer_sites[0].kind == "on-demand-tool"' >/dev/null && echo true || echo false)"

# ── T7: MANDATORY NEGATIVE CONTROL — class a forced to 0 rows MUST still
# report severity_ceiling=may_stay_critical (proves this fix does not
# blanket-suppress every empty-table finding). ─────────────────────────────
OUT7=$(run_db_empty_table_classify t7_table_a)
check "T7 NEGATIVE-CONTROL exists=true row_count=0 (forced empty)" "$(printf '%s' "$OUT7" | jq -e '.exists == true and .row_count == 0' >/dev/null && echo true || echo false)"
check "T7 NEGATIVE-CONTROL class=a (NOT suppressed)" "$(printf '%s' "$OUT7" | jq -e '.class == "a"' >/dev/null && echo true || echo false)"
check "T7 NEGATIVE-CONTROL severity_ceiling=may_stay_critical (must still be able to fire CRITICAL)" "$(printf '%s' "$OUT7" | jq -e '.severity_ceiling == "may_stay_critical"' >/dev/null && echo true || echo false)"

# ── T8: class a, non-empty (sanity — row_count is reported, not gated on) ──
OUT8=$(run_db_empty_table_classify t8_table_a_nonzero)
check "T8 class-a-nonzero row_count=3" "$(printf '%s' "$OUT8" | jq -e '.row_count == 3' >/dev/null && echo true || echo false)"
check "T8 class-a-nonzero class=a" "$(printf '%s' "$OUT8" | jq -e '.class == "a"' >/dev/null && echo true || echo false)"

# ── T9: excluded-other-db site stays VISIBLE in writer_sites (transparency)
# even though it never counts toward class. ─────────────────────────────────
OUT9=$(run_db_empty_table_classify t9_table_excluded_visible)
check "T9 excluded-visible class=b (excluded site does not count)" "$(printf '%s' "$OUT9" | jq -e '.class == "b"' >/dev/null && echo true || echo false)"
check "T9 excluded-visible writer_sites still lists the site" "$(printf '%s' "$OUT9" | jq -e '.writer_sites | length == 1 and .[0].kind == "excluded-other-db"' >/dev/null && echo true || echo false)"

# ── T10: mixed tool + production writer — production wins, class=a (a real
# pipeline writer must never be masked by ALSO having an on-demand tool). ──
OUT10=$(run_db_empty_table_classify t10_table_mixed)
check "T10 mixed-writers class=a (production is not masked by a co-existing tool writer)" "$(printf '%s' "$OUT10" | jq -e '.class == "a"' >/dev/null && echo true || echo false)"
check "T10 mixed-writers writer_sites has both kinds" "$(printf '%s' "$OUT10" | jq -e '([.writer_sites[].kind] | sort) == ["on-demand-tool","production"]' >/dev/null && echo true || echo false)"

unset MARKET_DB_HOST_PATH
unset DB_CLASSIFY_SEARCH_ROOT

# ── T11: LIVE REPLAY — the actual 2026-08-06T06:57Z auditor-cycle tables,
# against the REAL repo tree + REAL live DB. Graceful SKIP (not a false
# PASS) when data/live/market.db is absent on the host running this suite. ─
LIVE_DB="$REPO_ROOT/data/live/market.db"
if [ -f "$LIVE_DB" ]; then
  L_PA=$(run_db_empty_table_classify price_alerts)
  check "T11 LIVE price_alerts class=c (confirmed FP #1 must go quiet)" "$(printf '%s' "$L_PA" | jq -e '.class == "c"' >/dev/null && echo true || echo false)"
  check "T11 LIVE price_alerts severity_ceiling != may_stay_critical" "$(printf '%s' "$L_PA" | jq -e '.severity_ceiling != "may_stay_critical"' >/dev/null && echo true || echo false)"

  L_AER=$(run_db_empty_table_classify alert_engine_records)
  check "T11 LIVE alert_engine_records class=b (confirmed FP #2 must go quiet)" "$(printf '%s' "$L_AER" | jq -e '.class == "b"' >/dev/null && echo true || echo false)"
  check "T11 LIVE alert_engine_records severity_ceiling=info_at_most_never_critical" "$(printf '%s' "$L_AER" | jq -e '.severity_ceiling == "info_at_most_never_critical"' >/dev/null && echo true || echo false)"

  L_PDF=$(run_db_empty_table_classify pdf_documents)
  check "T11 LIVE pdf_documents class=SCHEMA-MISSING (distinct from empty-table)" "$(printf '%s' "$L_PDF" | jq -e '.class == "SCHEMA-MISSING" and .exists == false' >/dev/null && echo true || echo false)"

  L_OHLCV=$(run_db_empty_table_classify daily_ohlcv)
  check "T11 LIVE daily_ohlcv class=a (genuine pipeline table still reportable)" "$(printf '%s' "$L_OHLCV" | jq -e '.class == "a" and .severity_ceiling == "may_stay_critical"' >/dev/null && echo true || echo false)"

  L_MP=$(run_db_empty_table_classify market_prices)
  check "T11 LIVE market_prices class=a (second genuine pipeline table still reportable)" "$(printf '%s' "$L_MP" | jq -e '.class == "a" and .severity_ceiling == "may_stay_critical"' >/dev/null && echo true || echo false)"
else
  skip "T11 LIVE replay — $LIVE_DB not present on this host"
fi

# ── T12 (AC-5, QA-BLOCKING, verification-gate evidence): a NON-EMPTY -wal is
# created DELIBERATELY (held-open reader, scripts/lib/sqlite-wal-hold-open-
# fixture.sh) against a fresh fixture DB, and the classifier is proven to
# report the CORRECT, live-committed row_count via the WAL-safe mode=ro
# fallback — NEVER the stale count a bare `immutable=1` open would silently
# return. A raw immutable=1 query against the SAME db at the SAME instant is
# run alongside for direct comparison. ──────────────────────────────────────
WAL_DB="$TMPDIR_TEST/wal-fixture.db"
sqlite3 "$WAL_DB" "PRAGMA journal_mode=WAL; CREATE TABLE t12_table_wal (id INTEGER); INSERT INTO t12_table_wal VALUES (1);" >/dev/null

wal_fixture_hold_open "$WAL_DB" "$TMPDIR_TEST/classify-wal.fifo" "$TMPDIR_TEST/classify-wal-holder.out"
sqlite3 "$WAL_DB" "INSERT INTO t12_table_wal VALUES (2),(3);" >/dev/null

WAL_BYTES_T12="$(wc -c < "${WAL_DB}-wal" 2>/dev/null | tr -d ' ')"
check "T12 -wal is NON-EMPTY at read time (deliberately reproduced, not waited for)" \
  "$([ -n "$WAL_BYTES_T12" ] && [ "$WAL_BYTES_T12" -gt 0 ] && echo true || echo false)"

RAW_IMMUTABLE_T12="$(sqlite3 "file:${WAL_DB}?immutable=1" "SELECT count(*) FROM t12_table_wal;")"
check "T12 raw immutable=1 is STALE (1, blind to the 2 pending-WAL rows)" \
  "$([ "$RAW_IMMUTABLE_T12" = "1" ] && echo true || echo false)"

OUT12=$(MARKET_DB_HOST_PATH="$WAL_DB" DB_CLASSIFY_SEARCH_ROOT="$FIXTURE_SRC/apps" run_db_empty_table_classify t12_table_wal)
check "T12 classifier reports read_mode=ro (fell back off immutable=1)" \
  "$(printf '%s' "$OUT12" | jq -e '.read_mode == "ro"' >/dev/null && echo true || echo false)"
check "T12 classifier row_count is CORRECT (3), NOT the stale immutable=1 value (1)" \
  "$(printf '%s' "$OUT12" | jq -e '.row_count == 3' >/dev/null && echo true || echo false)"

wal_fixture_release

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
