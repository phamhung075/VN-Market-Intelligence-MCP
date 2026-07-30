#!/usr/bin/env bash
# verify-market-db-journal-mode.sh
#
# FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION — AC-3 + AC-4
# regression guard.
#
# WHY THIS EXISTS: schema.ts:115 (apps/mcp-server/src/infrastructure/db/
# schema.ts) sets `PRAGMA journal_mode=DELETE` on market.db as the permanent
# fix for the recurring macOS-Docker-virt SHM torn-write corruption (4 prior
# corruptions — see docs/agent-memory notebooks). journal_mode is a
# PERSISTENT property of the DB FILE, not of a connection: ANY code path
# (a one-shot backfill script, a migration script, a stray `PRAGMA
# journal_mode=WAL`) re-creates the -wal/-shm pair and the setting survives
# past that connection's own lifetime — until the next getDb() call resets
# it back to DELETE, which is too late for the corruption window in between.
#
# A source-level assertion (grepping for "journal_mode" in schema.ts) would
# have MISSED the exact defect this guard was written for: the fix WAS
# already in source; the regression was a *different* runtime code path
# (bctcEvalBackfillRunner.ts) calling PRAGMA at execution time. This probe
# therefore asserts the LIVE, RUNNING container's on-disk state, never source.
#
# Usage:
#   bash scripts/audits/verify-market-db-journal-mode.sh                # live check
#   bash scripts/audits/verify-market-db-journal-mode.sh --self-test    # proves both branches
#   CONTAINER=<name> bash scripts/audits/verify-market-db-journal-mode.sh
#
# Exit code / verdict contract (verdict line is ALWAYS the first stdout line):
#   PASS  -> exit 0   journal_mode=delete AND no live -wal/-shm pair
#   FAIL  -> exit 2   journal_mode!=delete OR a live -wal/-shm pair exists
#   ERROR -> exit 3   docker unavailable / container not found / probe broke
#
# `--self-test` exit code is a DIFFERENT semantic space (0 = harness itself
# proved both branches correctly, 1 = harness defect) — it answers "does the
# gate work", not "is market.db healthy right now".

set -uo pipefail

CONTAINER="${CONTAINER:-vn-market-intelligence-mcp-mcp-server-1}"
DB_PATH_IN_CONTAINER="${DB_PATH_IN_CONTAINER:-/app/data/market.db}"

run_check() {
  command -v docker >/dev/null 2>&1 || {
    echo "MARKET_DB_JOURNAL_MODE verdict=ERROR reason=docker_not_on_path"
    return 3
  }

  if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "MARKET_DB_JOURNAL_MODE verdict=ERROR reason=container_not_found container=$CONTAINER"
    return 3
  fi

  # Read-only query through the running container's OWN bun runtime — never
  # mutates the pragma, so the probe itself cannot introduce the regression
  # it is checking for.
  local journal_mode
  journal_mode=$(docker exec "$CONTAINER" bun -e "
    const { Database } = require('bun:sqlite');
    try {
      const db = new Database('$DB_PATH_IN_CONTAINER', { readonly: true });
      const row = db.prepare('PRAGMA journal_mode').get();
      console.log(row.journal_mode);
    } catch (e) {
      console.log('ERROR:' + e.message);
    }
  " 2>/dev/null)

  if [ -z "$journal_mode" ] || [[ "$journal_mode" == ERROR:* ]]; then
    echo "MARKET_DB_JOURNAL_MODE verdict=ERROR reason=probe_query_failed detail=${journal_mode:-empty} container=$CONTAINER db=$DB_PATH_IN_CONTAINER"
    return 3
  fi

  # AC-4: a live -wal/-shm pair sitting NEXT TO the exact DB path. Deliberately
  # exact-filename match only — historical backup/corrupt-snapshot copies
  # (e.g. market.db.corrupt-<ts>-wal) are NOT the live pair and must not
  # false-positive this guard.
  local wal_present="false"
  local shm_present="false"
  docker exec "$CONTAINER" test -f "${DB_PATH_IN_CONTAINER}-wal" 2>/dev/null && wal_present="true"
  docker exec "$CONTAINER" test -f "${DB_PATH_IN_CONTAINER}-shm" 2>/dev/null && shm_present="true"

  local verdict="PASS"
  local reason="journal_mode=delete, no live -wal/-shm pair"

  if [ "$journal_mode" != "delete" ]; then
    verdict="FAIL"
    reason="journal_mode=$journal_mode (expected delete) — WAL re-arm vector active"
  elif [ "$wal_present" = "true" ] || [ "$shm_present" = "true" ]; then
    verdict="FAIL"
    reason="live -wal/-shm pair present next to market.db (wal=$wal_present shm=$shm_present)"
  fi

  echo "MARKET_DB_JOURNAL_MODE verdict=$verdict journal_mode=$journal_mode wal_present=$wal_present shm_present=$shm_present container=$CONTAINER db=$DB_PATH_IN_CONTAINER reason=\"$reason\""

  [ "$verdict" = "PASS" ] && return 0
  return 2
}

self_test() {
  echo "[self-test] proving FAIL branch (WAL) and PASS branch (DELETE) are both detected..."

  command -v docker >/dev/null 2>&1 || { echo "SELF_TEST verdict=ERROR reason=docker_not_on_path"; return 3; }
  docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "SELF_TEST verdict=ERROR reason=container_not_found container=$CONTAINER"; return 3; }

  local wal_db="/tmp/journal-mode-selftest-wal.db"
  local delete_db="/tmp/journal-mode-selftest-delete.db"

  docker exec "$CONTAINER" sh -c "rm -f '$wal_db' '${wal_db}-wal' '${wal_db}-shm' '$delete_db' '${delete_db}-wal' '${delete_db}-shm'" 2>/dev/null || true

  docker exec "$CONTAINER" bun -e "
    const { Database } = require('bun:sqlite');
    const db = new Database('$wal_db');
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('CREATE TABLE IF NOT EXISTS t(x)');
  " >/dev/null 2>&1

  docker exec "$CONTAINER" bun -e "
    const { Database } = require('bun:sqlite');
    const db = new Database('$delete_db');
    db.exec('PRAGMA journal_mode=DELETE');
    db.exec('CREATE TABLE IF NOT EXISTS t(x)');
  " >/dev/null 2>&1

  local fail_line fail_exit pass_line pass_exit
  fail_line=$(CONTAINER="$CONTAINER" DB_PATH_IN_CONTAINER="$wal_db" bash "$0" 2>&1)
  fail_exit=$?
  pass_line=$(CONTAINER="$CONTAINER" DB_PATH_IN_CONTAINER="$delete_db" bash "$0" 2>&1)
  pass_exit=$?

  docker exec "$CONTAINER" sh -c "rm -f '$wal_db' '${wal_db}-wal' '${wal_db}-shm' '$delete_db' '${delete_db}-wal' '${delete_db}-shm'" 2>/dev/null || true

  echo "[self-test] WAL fixture -> $fail_line (exit=$fail_exit)"
  echo "[self-test] DELETE fixture -> $pass_line (exit=$pass_exit)"

  if [ "$fail_exit" -eq 2 ] && [ "$pass_exit" -eq 0 ]; then
    echo "SELF_TEST verdict=PASS detail=\"WAL fixture correctly FAILs (exit=2), DELETE fixture correctly PASSes (exit=0)\""
    return 0
  fi
  echo "SELF_TEST verdict=FAIL detail=\"WAL fixture exit=$fail_exit (want 2), DELETE fixture exit=$pass_exit (want 0)\""
  return 1
}

case "${1:-}" in
  --self-test)
    self_test
    exit $?
    ;;
  --help|-h)
    sed -n '2,33p' "$0"
    exit 0
    ;;
  *)
    run_check
    exit $?
    ;;
esac
