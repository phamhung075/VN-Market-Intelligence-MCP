#!/usr/bin/env bash
# scripts/lib/sqlite-wal-guard.sh
#
# FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT (2026-08-06, PO QA-BLOCKING AC-5/AC-6/AC-7).
# Shared WAL-safety guard, sourced by scripts/db-integrity-counts.sh,
# scripts/agents-flow/db-integrity-probe.sh and scripts/db-empty-table-classify.sh —
# every read-only observer that opens market.db with `file:...?immutable=1`.
#
# THE MEASURED DEFECT (po_qa_block_note on the board row, live market.db,
# 2026-08-06T12:2xZ): `immutable=1` bypasses WAL/-shm ENTIRELY — it reads only the
# main DB file's on-disk header + pages, never the -wal file. With
# data/live/market.db-wal at 1,545,032 bytes of pending un-checkpointed writes,
# `sqlite3 "file:data/live/market.db?immutable=1"` returned daily_ohlcv=775891 AND
# pragma_journal_mode='delete' (the stale on-disk header), while a second reader on
# `file:data/live/market.db?mode=ro` at the SAME instant returned the correct
# daily_ohlcv=775912 and pragma_journal_mode='wal'. No error, no warning — a silent
# 21-row undercount and an inverted journal-mode reading, from the exact tool whose
# job is to catch DB drift. Reproduced deterministically in this task's own test
# suite (scripts/lib/sqlite-wal-guard.test.sh) via a held-open reader that blocks
# checkpoint, so this is not a one-off — it recurs any time market.db has pending
# WAL content, which FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-DSN-... establishes happens
# routinely from live Go writers oscillating journal_mode DELETE<->WAL.
#
# THE RULE: `immutable=1` is safe IFF `<db>-wal` is absent or 0 bytes at read time.
# A single checkpointed-moment snapshot (e.g. "byte-identical counts, 6/6 columns")
# can NEVER establish general safety — it only proves the DB happened to be
# checkpointed when that one measurement was taken (2026-06-25 and 2026-08-06's
# AC-2 evidence are both instances of this; 2026-07-31 and this task's own
# po_qa_block_note measurement are the other branch). Both branches are consistent
# with the conditional rule below; neither is consistent with an unconditional one.
#
# NEVER read journal_mode through `immutable=1`, anywhere (AC-7) — it returns the
# persisted on-disk header value, not the live mode. If a script ever needs
# journal_mode, use the running container's own reader, same path as
# scripts/audits/verify-market-db-journal-mode.sh.
#
# --- wal_guard_wal_bytes <db_path> -------------------------------------------
# Prints the byte size of "<db_path>-wal", or 0 if absent/unreadable. Never
# fails (a stat/read error is treated as "no pending WAL to worry about" —
# the caller's own sqlite3 invocation is the real probe-failure surface, not
# this file-size check).
wal_guard_wal_bytes() {
  local wal="${1}-wal" size
  [ -f "$wal" ] || { echo 0; return 0; }
  size=$(wc -c < "$wal" 2>/dev/null | tr -d ' ')
  case "$size" in
    ''|*[!0-9]*) echo 0 ;;
    *) echo "$size" ;;
  esac
}

# --- wal_guard_read_mode <db_path> -------------------------------------------
# Prints "immutable" (fast path, -wal absent/0 bytes — AC-1's original,
# verified-safe pattern, unchanged) or "ro" (WAL-safe fallback — -wal has
# pending content, so immutable=1 would silently go blind; `mode=ro` attaches
# to the live -shm/-wal like any other same-uid reader and was verified live
# by PO to return the correct WAL-merged view at the exact instant
# immutable=1 went stale).
wal_guard_read_mode() {
  if [ "$(wal_guard_wal_bytes "$1")" -gt 0 ]; then
    echo "ro"
  else
    echo "immutable"
  fi
}

# --- wal_guard_read_uri <db_path> --------------------------------------------
# Prints the sqlite3 URI to open for a read-only query THIS INSTANT, per
# wal_guard_read_mode above: "file:<db>?immutable=1" or "file:<db>?mode=ro".
# Callers swap their old hardcoded `"file:${DB}?immutable=1"` string for
# `"$(wal_guard_read_uri "$DB")"` and nothing else changes — the returned URI
# still fails exactly like a bad immutable=1 open would (non-zero exit / empty
# output) if the DB is genuinely unreachable, so every existing PROBE FAILURE /
# fail-loud guard downstream of the sqlite3 call is unaffected.
wal_guard_read_uri() {
  if [ "$(wal_guard_read_mode "$1")" = "ro" ]; then
    echo "file:${1}?mode=ro"
  else
    echo "file:${1}?immutable=1"
  fi
}
