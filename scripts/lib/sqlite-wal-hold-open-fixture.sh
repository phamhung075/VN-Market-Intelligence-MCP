#!/usr/bin/env bash
# scripts/lib/sqlite-wal-hold-open-fixture.sh
#
# Test-only fixture helper shared by the FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT
# regression suites (scripts/lib/sqlite-wal-guard.test.sh, scripts/db-integrity-counts.test.sh,
# scripts/agents-flow/db-integrity-probe.test.sh, scripts/db-empty-table-classify.test.sh) that
# need to DELIBERATELY produce a non-empty `<db>-wal` against a real sqlite3 fixture DB, per the
# board row's verification gate ("create the condition deliberately; do not wait for it. A PASS
# captured during a checkpointed moment is the exact non-evidence that produced this gap").
#
# WHY THIS EXISTS: SQLite auto-checkpoints (truncates -wal back to 0 bytes) whenever the last
# connection to a database closes. A held-open second reader — a background sqlite3 process fed
# commands through a named pipe, kept alive inside an open read transaction — blocks that
# checkpoint from reclaiming WAL content committed by a SEPARATE writer connection afterward.
# bash-3.2-safe (deliberately no `coproc`, which macOS system /bin/bash lacks — confirmed by
# direct trial during authoring: `coproc NAME { ...; }` is a syntax error on bash 3.2.57).
#
# wal_fixture_hold_open <db_path> <fifo_path> <holder_out_path>
#   Creates <fifo_path>, starts `sqlite3 <db_path> < <fifo_path>` in the background reading from
#   it, opens fd 9 for writing to the fifo, and issues `BEGIN; SELECT ...;` to open (and hold) a
#   read transaction. Sets WAL_FIXTURE_HOLDER_PID (global) to the background PID. Caller is then
#   free to commit new writes via a SEPARATE `sqlite3 <db_path> "..."` invocation — those commits
#   land in -wal and stay there (checkpoint blocked) until wal_fixture_release is called.
# wal_fixture_release
#   Sends `COMMIT; .quit` to the holder via fd 9, closes fd 9, and waits for the holder process
#   to exit. Safe to call even if hold_open was never called (WAL_FIXTURE_HOLDER_PID empty).
WAL_FIXTURE_HOLDER_PID=""

wal_fixture_hold_open() {
  local db_path="$1" fifo_path="$2" out_path="$3" any_table
  # `command sqlite3` deliberately bypasses any same-name shell FUNCTION a caller
  # may have defined to stub the real binary elsewhere in its own test file (e.g.
  # db-integrity-probe.test.sh's T1-T6 stub sqlite3() {...} for the mocked-verdict
  # cases) — this fixture always needs the REAL binary, regardless of what the
  # calling test file has overridden `sqlite3` to mean at call time.
  any_table="$(command sqlite3 "$db_path" "SELECT name FROM sqlite_master WHERE type='table' LIMIT 1;" 2>/dev/null)"
  [ -z "$any_table" ] && { echo "wal_fixture_hold_open: no table found in $db_path — cannot hold a read transaction open" >&2; return 1; }
  mkfifo "$fifo_path" 2>/dev/null
  command sqlite3 "$db_path" < "$fifo_path" > "$out_path" 2>&1 &
  WAL_FIXTURE_HOLDER_PID=$!
  exec 9> "$fifo_path"
  printf 'BEGIN;\nSELECT count(*) FROM %s;\n' "$any_table" >&9
  sleep 0.3
  return 0
}

wal_fixture_release() {
  [ -z "$WAL_FIXTURE_HOLDER_PID" ] && return 0
  printf 'COMMIT;\n.quit\n' >&9 2>/dev/null
  exec 9>&- 2>/dev/null
  wait "$WAL_FIXTURE_HOLDER_PID" 2>/dev/null
  WAL_FIXTURE_HOLDER_PID=""
  return 0
}
