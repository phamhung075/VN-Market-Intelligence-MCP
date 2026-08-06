#!/usr/bin/env bash
# scripts/agents-flow/db-integrity-probe.sh
#
# CADRAT-2 — deterministic SKIP-SPAWN/SPAWN pre-gate for cron-db-data-integrity.md's
# AUDIT_TIER=DATA tick (docs/architecture-briefs/2026-08-04-cadence-rationalization.md
# §8 item 2). Mirrors auditor-tier1-probe.sh's verdict/exit-code shape (0=SKIP-SPAWN,
# 1=SPAWN, FAIL-OPEN) and its atomic tmp-file+mv write pattern — see that script's own
# header for the precedent this one reuses (structure only, not code — that script's
# checks are infra-health; this one is a live-DB COUNT(*) diff).
#
# WHAT IT CHECKS: COUNT(*) on the SAME 17 tables already named in
# .claude/commands/crons/cron-db-data-integrity.md's prompt, against the SAME
# direct host-bind sqlite3 read that cron prompt already documents:
#   sqlite3 "file:<repo>/data/live/market.db?immutable=1" "<SQL>"
# (file:?immutable=1, NEVER sqlite3 -readonly — see that cron doc's own DB ACCESS note:
# a foreign process can't attach a writer-recreated -shm file under -readonly after a
# restart; immutable=1 bypasses WAL/-shm entirely and is always safe here.)
#
# DB ACCESS (FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT, 2026-08-06, AC-1): direct
# host-bind read — NO docker sidecar. 2026-07-15 commit 5ba622eca retired the docker
# named volume `vn-market-intelligence-mcp_market_data` in favour of a host bind mount
# (`./data/live:/app/data`). The old `docker run --rm -v <named-volume>:/data
# keinos/sqlite3 ...` call here made docker silently AUTO-CREATE a fresh empty volume on
# every invocation, so this probe could never emit SKIP-SPAWN (voted SPAWN unconditionally
# for 21 days, unnoticed). Same decision + rationale as db-integrity-counts.sh (see that
# script's header) — do NOT re-create the named volume.
#
# v1 SCOPE NOTE (be honest, don't guess): COUNT(*)-diff ONLY — schema-agnostic, catches
# the dominant "new rows arrived" case, safe without live schema access. This
# UNDER-DETECTS in-place mutation with a stable row count — most notably daily_ohlcv's
# nightly backfill, which REWRITES ~97% of rows in place without changing COUNT(*)
# (memory: reference_daily_ohlcv_updated_at_is_mutation_not_arrival_backfill_rewrites_97pct).
# ACCEPTED for v1: the daily Tier-3 deep-integrity sweep still covers that table on its
# own 24h cadence regardless of this probe's verdict. A MAX(updated_at)-style fast-follow
# is a known next step, NOT implemented here (the exact freshness-column name per table
# was not verified against the live schema — do not guess it).
#
# READS (read-only): (a) its own docs/data/db-integrity-probe-last-snapshot.json,
# (b) the live DB via the sidecar above. NEVER reads docs/data/db-integrity-history.json
# — that file's shape has changed multiple times across scans (too unstable to be a
# deterministic diff source) and stays the system-auditor subagent's own output.
#
# WRITES: ONLY docs/data/db-integrity-probe-last-snapshot.json, tmp-file + mv rename
# (never a raw truncate-write). Written whenever the live sidecar query itself
# SUCCEEDED (seeds/refreshes the baseline on first-run/malformed-snapshot/count-changed)
# — NEVER written when the sidecar query itself failed (nothing new/trustworthy to
# persist; mirrors auditor-tier1-probe.sh's own "never write on a failed check" rule).
# Snapshot shape: {"checked_at":"<ISO-UTC>","tables":{"<table>":{"rowcount":N},...}}
#
# VERDICT/EXIT CONTRACT (mirrors Tier-2/3's --tier=N SKIP-SPAWN/SPAWN shape exactly):
#   stdout: ONE line of valid JSON, FIRST thing printed — no progress output may
#   precede it (memory: feedback_tick_preflight_verdict_is_first_json_key_tail_always_drops_it):
#     {"verdict":"SKIP-SPAWN"|"SPAWN","detail":"<reason>","tables_changed":N,"checked_at":"<ISO-UTC>"}
#   Exit 0 = SKIP-SPAWN: valid prior snapshot AND live query succeeded AND EVERY watched
#     table's live COUNT(*) matches the snapshot exactly (tables_changed=0).
#   Exit 1 = SPAWN (FAIL-OPEN — never suppress a legitimate run on a probe fault) on ANY of:
#     - >=1 table's count changed since the snapshot (tables_changed = count of tables changed)
#     - snapshot file missing (first-run) — tables_changed = count of watched tables
#       (no baseline to compare against, so every table counts as "changed from absent")
#     - snapshot file malformed/unparseable — treated identically to missing
#     - the sidecar query itself failed for any reason (docker unreachable, non-zero
#       exit, or the returned output didn't parse into one "<table>|<count>" line per
#       watched table, in order) — tables_changed = -1 (sentinel "unknown": the live
#       counts themselves could not be read this tick, distinct from a confirmed 0)
#
# Env overrides (test seam — db-integrity-probe.test.sh mocks `sqlite3` as a function
# after sourcing, same pattern as auditor-tier1-probe.test.sh's docker/curl/df stubs):
#   SNAPSHOT_FILE_PATH   — snapshot output path (default: repo docs/data/db-integrity-probe-last-snapshot.json)
#   MARKET_DB_HOST_PATH  — host-bind DB file path (default: <repo>/data/live/market.db — same
#                          env var name as db-integrity-counts.sh / db-empty-table-classify.sh)
#
# HARD CONSTRAINT: read-only. This script NEVER runs an INSERT/UPDATE/DELETE or any
# mutation — sqlite3 is invoked with "file:...?immutable=1" only, same as the
# cron prompt this gates.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SNAPSHOT_FILE="${SNAPSHOT_FILE_PATH:-$REPO_ROOT/docs/data/db-integrity-probe-last-snapshot.json}"
MARKET_DB_HOST_PATH="${MARKET_DB_HOST_PATH:-$REPO_ROOT/data/live/market.db}"

# Same 17 tables already named in cron-db-data-integrity.md's own prompt — keep in
# sync with that doc if the watched-table list ever changes there.
TABLES=(
  daily_ohlcv market_prices market_prices_history vn_index_cache
  alerts price_alerts alert_engine_records agent_signals signal_outcomes
  financial_reports macro_indicators sbv_rates fred_series_daily
  deep_fetch_queue deep_fetch_stats cron_job_runs scheduler_locks
)

_now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# ── Live counts via a direct host-bind sqlite3 read (ONE invocation, 17-statement SQL) ──
# Prints "<table>|<count>" one per line, in TABLES order, on success (stdout, rc=0).
# Prints nothing and returns 1 on ANY failure: sqlite3 unreachable / DB file missing /
# non-zero exit / output did not parse into exactly len(TABLES) valid "<table>|<count>"
# lines in order.
_query_live_counts() {
  local sql t out rc tbl cnt i=0
  sql=""
  for t in "${TABLES[@]}"; do
    sql="${sql}SELECT '${t}', COUNT(*) FROM ${t};"
  done
  out=$(sqlite3 "file:${MARKET_DB_HOST_PATH}?immutable=1" "$sql" 2>/dev/null)
  rc=$?
  [ "$rc" -ne 0 ] && return 1
  [ -z "$out" ] && return 1

  while IFS='|' read -r tbl cnt; do
    [ -z "$tbl" ] && continue
    [ "$i" -ge "${#TABLES[@]}" ] && return 1
    [ "$tbl" != "${TABLES[$i]}" ] && return 1
    [[ "$cnt" =~ ^[0-9]+$ ]] || return 1
    printf '%s|%s\n' "$tbl" "$cnt"
    i=$((i + 1))
  done <<< "$out"

  [ "$i" -eq "${#TABLES[@]}" ] || return 1
  return 0
}

# ── Snapshot read — rc=0 + stdout=.tables object on a valid {"tables":{...}} shape,
# rc=1 (no stdout) on file missing / invalid JSON / .tables absent-or-not-an-object ──
_read_snapshot() {
  [ -f "$SNAPSHOT_FILE" ] || return 1
  local parsed
  parsed=$(jq -e '.tables | objects' "$SNAPSHOT_FILE" 2>/dev/null) || return 1
  printf '%s' "$parsed"
  return 0
}

# ── Snapshot write — atomic tmp-file + mv rename (mirrors auditor-tier1-probe.sh) ──
# counts_tsv: newline-separated "<table>|<count>" lines (this run's live counts).
_write_snapshot() {
  local ts="$1" counts_tsv="$2" tmp tables_json
  tables_json=$(printf '%s\n' "$counts_tsv" | jq -R -s '
    split("\n") | map(select(length > 0) | split("|")) |
    map({key: .[0], value: {rowcount: (.[1] | tonumber)}}) | from_entries
  ' 2>/dev/null)
  [ -z "$tables_json" ] && return 1
  tmp="$(mktemp "${SNAPSHOT_FILE}.tmp.XXXXXX" 2>/dev/null)" || tmp="${SNAPSHOT_FILE}.tmp.$$"
  jq -n --arg ts "$ts" --argjson tables "$tables_json" '{checked_at:$ts, tables:$tables}' > "$tmp" 2>/dev/null
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp" 2>/dev/null
    return 1
  fi
  chmod 644 "$tmp" 2>/dev/null
  mv -f "$tmp" "$SNAPSHOT_FILE" 2>/dev/null
}

run_probe() {
  local ts live_out rc snapshot_json changed=0 table cnt prev

  ts=$(_now_iso)

  live_out=$(_query_live_counts); rc=$?
  if [ "$rc" -ne 0 ]; then
    # AC-4 (FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT): FAIL-OPEN (exit 1, verdict=SPAWN)
    # is the CORRECT, documented CADRAT-2 contract here — never suppress a legitimate sweep
    # on a probe fault. What was missing was LOUDNESS: this branch used to emit ONLY the
    # stdout JSON, so a genuinely-broken DB access path (e.g. the 21-day named-volume drift)
    # was indistinguishable in logs from the routine "counts changed" SPAWN case. Add a
    # bug-channel-worthy stderr line so a live access defect is visible on its own, even
    # though the verdict/exit code contract itself is unchanged.
    echo "[DB-INTEGRITY-PROBE] QUERY FAILURE — live DB unreachable (sqlite3 non-zero exit, empty output, or malformed row-count for one or more of the ${#TABLES[@]} watched tables) DB=${MARKET_DB_HOST_PATH} — falling open to SPAWN; the full sweep's own db-integrity-counts.sh call will fail loud if the DB is still unreachable" >&2
    jq -nc --arg v "SPAWN" \
      --arg d "live DB query failed (sqlite3 unreachable, DB file missing, non-zero exit, or output did not parse into 1 line per watched table) — snapshot left untouched" \
      --argjson tc -1 --arg ts "$ts" \
      '{verdict:$v, detail:$d, tables_changed:$tc, checked_at:$ts}'
    return 1
  fi

  snapshot_json=$(_read_snapshot); rc=$?
  if [ "$rc" -ne 0 ]; then
    _write_snapshot "$ts" "$live_out"
    jq -nc --arg v "SPAWN" \
      --arg d "snapshot missing or malformed (first-run) — seeded fresh snapshot from this tick's live counts" \
      --argjson tc "${#TABLES[@]}" --arg ts "$ts" \
      '{verdict:$v, detail:$d, tables_changed:$tc, checked_at:$ts}'
    return 1
  fi

  while IFS='|' read -r table cnt; do
    [ -z "$table" ] && continue
    prev=$(printf '%s' "$snapshot_json" | jq -r --arg t "$table" '.[$t].rowcount // "MISSING"' 2>/dev/null)
    [ "$prev" != "$cnt" ] && changed=$((changed + 1))
  done <<< "$live_out"

  if [ "$changed" -eq 0 ]; then
    jq -nc --arg v "SKIP-SPAWN" \
      --arg d "all ${#TABLES[@]} watched tables' COUNT(*) match the last snapshot exactly" \
      --argjson tc 0 --arg ts "$ts" \
      '{verdict:$v, detail:$d, tables_changed:$tc, checked_at:$ts}'
    return 0
  fi

  _write_snapshot "$ts" "$live_out"
  jq -nc --arg v "SPAWN" \
    --arg d "${changed} of ${#TABLES[@]} watched table(s) changed COUNT(*) since last snapshot — refreshed snapshot" \
    --argjson tc "$changed" --arg ts "$ts" \
    '{verdict:$v, detail:$d, tables_changed:$tc, checked_at:$ts}'
  return 1
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_probe
  exit $?
fi
