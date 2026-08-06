#!/usr/bin/env bash
# scripts/lib/sqlite-wal-guard.test.sh
#
# Regression test for scripts/lib/sqlite-wal-guard.sh
# (FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT AC-5/AC-6/AC-7).
#
# T1-T2: -wal absent / 0-byte-but-present -> "immutable" fast path (AC-1 unchanged).
# T3-T4 (THE VERIFICATION-GATE EVIDENCE): a NON-EMPTY -wal is created DELIBERATELY
#   (a background sqlite3 reader is held open via a named pipe so the writer's
#   own connection-close auto-checkpoint cannot fire — bash 3.2-safe, no coproc)
#   and the guard is proven to (a) pick "ro", and (b) actually return the
#   CORRECT, live-committed row count via that path, while a raw hardcoded
#   `immutable=1` open on the SAME db at the SAME instant returns the STALE
#   pre-commit count — i.e. this reproduces the exact po_qa_block_note defect
#   and shows the guard closes it. A PASS captured only in a checkpointed
#   moment would NOT be this evidence (memory: verification_gate on the board
#   row) — T3/T4 are captured with -wal genuinely non-empty, asserted directly.
# T5 (AC-7 regression): none of the 3 guarded caller scripts read journal_mode
#   at all (the only safe way to read it is the container's own bun:sqlite
#   reader, scripts/audits/verify-market-db-journal-mode.sh — never via this
#   guard's immutable/ro sqlite3 CLI paths).
#
# Run:
#   bash scripts/lib/sqlite-wal-guard.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GUARD_SH="$SCRIPT_DIR/sqlite-wal-guard.sh"
FIXTURE_SH="$SCRIPT_DIR/sqlite-wal-hold-open-fixture.sh"

if [ ! -f "$GUARD_SH" ]; then
  echo "ERROR: sqlite-wal-guard.sh not found at $GUARD_SH" >&2
  exit 1
fi

# shellcheck source=./sqlite-wal-guard.sh
source "$GUARD_SH"
# shellcheck source=./sqlite-wal-hold-open-fixture.sh
source "$FIXTURE_SH"

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

TMPDIR_TEST=$(mktemp -d /private/tmp/sqlite-wal-guard-test-XXXXXX)
cleanup() {
  wal_fixture_release
  rm -rf "$TMPDIR_TEST"
}
trap cleanup EXIT

DB="$TMPDIR_TEST/fixture.db"

# ── T1: no DB / no -wal at all yet ──────────────────────────────────────────
check "T1 wal_guard_wal_bytes=0 when no db/-wal file exists" \
  "$([ "$(wal_guard_wal_bytes "$DB")" = "0" ] && echo true || echo false)"
check "T1 wal_guard_read_mode=immutable when no -wal file exists" \
  "$([ "$(wal_guard_read_mode "$DB")" = "immutable" ] && echo true || echo false)"
check "T1 wal_guard_read_uri uses immutable=1 when no -wal file exists" \
  "$([ "$(wal_guard_read_uri "$DB")" = "file:${DB}?immutable=1" ] && echo true || echo false)"

# ── T2: DB created, -wal checkpointed to 0 bytes on connection close (the
# normal steady state — sqlite3 auto-checkpoints on last-connection-close). ──
sqlite3 "$DB" "PRAGMA journal_mode=WAL; CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1),(2),(3);" >/dev/null
WAL_BYTES_T2="$(wal_guard_wal_bytes "$DB")"
check "T2 -wal is present but checkpointed to 0 bytes after clean close" "$([ -f "${DB}-wal" ] && echo true || echo false)"
check "T2 wal_guard_wal_bytes=0 (checkpointed)" "$([ "$WAL_BYTES_T2" = "0" ] && echo true || echo false)"
check "T2 wal_guard_read_mode=immutable on a checkpointed WAL-mode db" \
  "$([ "$(wal_guard_read_mode "$DB")" = "immutable" ] && echo true || echo false)"
check "T2 immutable=1 count is correct when -wal is 0 bytes (baseline sanity)" \
  "$([ "$(sqlite3 "file:${DB}?immutable=1" "SELECT count(*) FROM t;")" = "3" ] && echo true || echo false)"

# ── T3/T4: DELIBERATELY create a non-empty -wal (verification-gate evidence),
# via the shared held-open-reader fixture (scripts/lib/sqlite-wal-hold-open-
# fixture.sh) — blocks the connection-close auto-checkpoint from truncating
# -wal after the next write. bash-3.2-safe (no coproc). ─────────────────────
wal_fixture_hold_open "$DB" "$TMPDIR_TEST/holder.fifo" "$TMPDIR_TEST/holder.out"

# A SEPARATE connection commits new rows — in WAL mode this write lands in
# -wal, not the main file, and the held-open reader above blocks the
# checkpoint from reclaiming it.
sqlite3 "$DB" "INSERT INTO t VALUES (4),(5);" >/dev/null

WAL_BYTES_T3="$(wal_guard_wal_bytes "$DB")"
check "T3 -wal is now NON-EMPTY (deliberately reproduced, not waited for)" \
  "$([ "$WAL_BYTES_T3" -gt 0 ] && echo true || echo false)"
check "T3 wal_guard_read_mode=ro when -wal is non-empty" \
  "$([ "$(wal_guard_read_mode "$DB")" = "ro" ] && echo true || echo false)"
check "T3 wal_guard_read_uri falls back to mode=ro when -wal is non-empty" \
  "$([ "$(wal_guard_read_uri "$DB")" = "file:${DB}?mode=ro" ] && echo true || echo false)"

# THE regression proof: raw immutable=1 (bypassing the guard entirely) returns
# the STALE pre-commit count; the guard's own chosen URI returns the CORRECT,
# live count. Both queries run against the identical file, at the identical
# instant (the held-open reader is still blocking checkpoint).
RAW_IMMUTABLE_COUNT="$(sqlite3 "file:${DB}?immutable=1" "SELECT count(*) FROM t;")"
GUARDED_COUNT="$(sqlite3 "$(wal_guard_read_uri "$DB")" "SELECT count(*) FROM t;")"
check "T4 raw immutable=1 is STALE (3, missing the 2 pending-WAL rows) — reproduces po_qa_block_note" \
  "$([ "$RAW_IMMUTABLE_COUNT" = "3" ] && echo true || echo false)"
check "T4 guard's chosen read path returns the CORRECT live count (5) — the fix" \
  "$([ "$GUARDED_COUNT" = "5" ] && echo true || echo false)"

# Release the held-open reader.
wal_fixture_release

# ── T5 (AC-7): none of the 3 guarded caller scripts read journal_mode at all
# — the only safe path is the container's own bun:sqlite reader
# (scripts/audits/verify-market-db-journal-mode.sh), never this guard. Strips
# `#`-comment lines first — those legitimately DISCUSS the measured
# journal_mode defect in prose (AC-6); only executable code counts here. ────
for f in \
  "$REPO_ROOT/scripts/db-integrity-counts.sh" \
  "$REPO_ROOT/scripts/agents-flow/db-integrity-probe.sh" \
  "$REPO_ROOT/scripts/db-empty-table-classify.sh"
do
  check "T5 AC-7: $(basename "$f") never queries journal_mode in executable code" \
    "$(! grep -v '^[[:space:]]*#' "$f" | grep -qi 'journal_mode' && echo true || echo false)"
done

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
