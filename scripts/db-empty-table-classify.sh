#!/usr/bin/env bash
# scripts/db-empty-table-classify.sh — deterministic writer-provenance +
# missing-vs-empty classifier for ONE table, mirroring scripts/db-integrity-
# counts.sh's pattern (run-once, JSON stdout, fail-loud probe guard,
# zero LLM judgment required at cycle time).
#
# FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR (PO item 2, preferred
# fix over the free-text-only item 1 transcription in
# .claude/commands/crons/cron-db-data-integrity.md).
#
# Removes the false-positive class where system-auditor's DB-DATA sweep
# reported ANY 0-row table as CRITICAL "pipeline non-functional" with no
# check of whether the table has a production (scheduled/pipeline) writer
# at all. Confirmed FPs 2026-08-06: price_alerts (sole writer is an
# on-demand user-facing MCP tool — emptiness is the expected steady state),
# alert_engine_records (0 rows in market.db; the only *_test.go writer is
# test-only AND the one apparent non-test writer, apps/alert-engine/pkg/
# infrastructure/sqlite.go, provably writes to a SEPARATE physical db file
# — see EXCLUDE-OTHER-DB note below, empirically confirmed: alert_engine.db
# has no alert_engine_records table at all). Also closes the SCHEMA-MISSING-
# vs-EMPTY-TABLE conflation (pdf_documents was reported "failed, actual=0"
# when the table does not exist in market.db at all).
#
# Policy source (read-only reference; do not fork the rule here without
# updating there too): docs/agents/system-auditor/flow/data-writer-provenance.md §1-2
#
# USAGE:
#   bash scripts/db-empty-table-classify.sh <table>
#
# OUTPUT (stdout, one JSON object, on success — exit 0):
#   {
#     "table": "<table>",
#     "exists": true|false,
#     "row_count": <int>|null,          # null when exists=false (COUNT never run)
#     "class": "a"|"b"|"c"|"SCHEMA-MISSING",
#     "severity_ceiling": "may_stay_critical"
#                        | "info_at_most_never_critical"
#                        | "info_or_warn_corroborate_to_escalate"
#                        | "always_report",
#     "writer_sites": [ { "path": "...", "line": <int>, "kind":
#         "production" | "on-demand-tool" | "test" | "excluded-other-db" }, ... ]
#   }
#
# EXIT CODES: 0 = classified (any class). 1 = PROBE FAILURE (DB file
# unreadable / query error — never silently coerced to a class). 2 = usage
# error (missing/invalid table name argument).
#
# CLASSIFICATION (mechanical — walks writer_sites, no LLM judgment at cycle
# time; mirrors docs/agents/system-auditor/flow/data-writer-provenance.md §1):
#   SCHEMA-MISSING — `SELECT 1 FROM sqlite_master WHERE type='table' AND
#     name=<table>` returns no row. Table does not exist. ALWAYS reported —
#     never silenced by the writer-provenance discriminator below (a missing
#     table is a schema/migration gap regardless of who would write to it).
#   (a) — >=1 writer_sites[] entry with kind=="production" (a non-test
#     INSERT INTO <table> site whose path is NOT exclusively an on-demand
#     MCP tool and is NOT a documented other-db writer). severity_ceiling=
#     may_stay_critical — 0 rows here is a real outage (negative control:
#     daily_ohlcv/market_prices must classify "a" and STAY reportable).
#   (b) — zero "production" AND zero "on-demand-tool" sites (every site
#     found, if any, is "test" or "excluded-other-db", or none exist at
#     all). No production writer exists against THIS db -> table is
#     expected empty by construction. severity_ceiling=info_at_most_never_critical.
#   (c) — zero "production" sites but >=1 "on-demand-tool" site (every real
#     writer is reached only via an MCP tool a user invokes on demand, path
#     under apps/**/interface/mcp/tools/**). severity_ceiling=
#     info_or_warn_corroborate_to_escalate ("nobody used the feature yet"
#     != "pipeline broken").
#
# EXCLUDE-OTHER-DB (kind="excluded-other-db", DB_CLASSIFY_EXCLUDE_DIRS,
# default "apps/alert-engine"): a small, EMPIRICALLY VERIFIED allowlist of
# service directories whose own docker-compose DB_PATH/DSN targets a
# DIFFERENT physical sqlite file than the audited market.db, so an
# `INSERT INTO <table>` grep-hit under that directory is architecturally
# incapable of writing the row this script is checking for — counting it
# would silently re-open the exact false-positive class this script exists
# to close. Verified case: apps/alert-engine/pkg/infrastructure/config.go:12
# ("DBPath ... market.db (readonly reads)") + :30-35 (ALERT_ENGINE_DB_PATH
# is its OWN, separate DSN) — `sqlite3 alert_engine.db "select count(*)
# from alert_engine_records"` errors "no such table", proving zero writes
# ever reach it there; the table exists only (empty) in market.db. This is
# a documented STRUCTURAL fact about DB topology (analogous to the
# INDEX_TICKERS-excluded / EXCLUDE_TASK_IDS precedents elsewhere in
# scripts/), not a business-data hardcode — extend the list ONLY after the
# same empirical DSN-topology check, never as a blanket guess.
#
# DB ACCESS — direct host-bind sqlite3 (NOT the docker keinos/sqlite3
# sidecar db-integrity-counts.sh still mounts against the named volume).
# The named volume (vn-market-intelligence-mcp_market_data) was retired by
# commit 5ba622eca (2026-07-15) in favour of a host bind mount (./data/live
# -> /app/data in every service, see docker-compose.yml) — that sidecar
# path is currently non-functional and tracked separately
# (FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT, not this task's scope: this
# task does not touch db-integrity-counts.sh's DB ACCESS block). This is
# NEW code, so it is not built on the known-broken default: it reads the
# host-bind file directly with the SAME file:...?immutable=1 safety flag
# (bypasses WAL/-shm, always safe for a read-only observer). Override via
# MARKET_DB_HOST_PATH (tests / a future path change).
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays. Only plain indexed vars / while-read loops / case statements.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# _classify_site_kind <path> <exclude_dirs_space_separated>
_classify_site_kind() {
  local path="$1" exclude_dirs="$2" d
  case "$path" in
    *_test.go|*.test.ts) echo "test"; return ;;
  esac
  case "$path" in
    */__tests__/*) echo "test"; return ;;
  esac
  for d in $exclude_dirs; do
    case "$path" in
      *"$d"*) echo "excluded-other-db"; return ;;
    esac
  done
  case "$path" in
    */interface/mcp/tools/*) echo "on-demand-tool"; return ;;
  esac
  echo "production"
}

run_db_empty_table_classify() {
  local table="${1:-}"

  if [ -z "$table" ]; then
    echo "[db-empty-table-classify] ABORT usage: db-empty-table-classify.sh <table>" >&2
    return 2
  fi
  case "$table" in
    [A-Za-z_]*) : ;;
    *)
      echo "[db-empty-table-classify] ABORT invalid-table-name '${table}' (must start with a letter/underscore)" >&2
      return 2
      ;;
  esac
  case "$table" in
    *[!A-Za-z0-9_]*)
      echo "[db-empty-table-classify] ABORT invalid-table-name '${table}' (alnum/underscore only)" >&2
      return 2
      ;;
  esac

  local db_host_path="${MARKET_DB_HOST_PATH:-$REPO_ROOT/data/live/market.db}"
  local search_root="${DB_CLASSIFY_SEARCH_ROOT:-$REPO_ROOT/apps}"
  local exclude_dirs="${DB_CLASSIFY_EXCLUDE_DIRS:-apps/alert-engine}"

  if [ ! -f "$db_host_path" ]; then
    echo "[db-empty-table-classify] PROBE FAILURE: DB file not found at ${db_host_path}" >&2
    return 1
  fi

  # ── Step 1: SCHEMA-MISSING vs EMPTY-TABLE (run BEFORE any COUNT/severity) ──
  # NOTE: this script's top-level never sets `-e` (errexit) — deliberately.
  # Every risky command below is run bare and its exit status captured
  # immediately into a local var; do NOT introduce a `set -e`/`set +e` pair
  # here, it would leak errexit into Step 2's `grep` (which legitimately
  # returns 1 on "zero matches", not an error) and abort the function
  # silently with no PROBE FAILURE message (regression fixed during
  # authoring — see negative-control test T-SCHEMAMISS).
  local probe_stderr exists_raw probe_exit
  probe_stderr="$(mktemp)"
  exists_raw="$(sqlite3 "file:${db_host_path}?immutable=1" \
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}' LIMIT 1;" 2>"$probe_stderr")"
  probe_exit=$?
  if [ $probe_exit -ne 0 ]; then
    local err_msg
    err_msg="$(cat "$probe_stderr" 2>/dev/null || true)"
    rm -f "$probe_stderr"
    echo "[db-empty-table-classify] PROBE FAILURE (sqlite_master, exit ${probe_exit}): ${err_msg}" >&2
    return 1
  fi
  rm -f "$probe_stderr"

  local exists row_count_json
  if [ "$exists_raw" = "1" ]; then
    exists="true"
    probe_stderr="$(mktemp)"
    local rc_raw
    rc_raw="$(sqlite3 "file:${db_host_path}?immutable=1" "SELECT count(*) FROM \"${table}\";" 2>"$probe_stderr")"
    probe_exit=$?
    if [ $probe_exit -ne 0 ]; then
      err_msg="$(cat "$probe_stderr" 2>/dev/null || true)"
      rm -f "$probe_stderr"
      echo "[db-empty-table-classify] PROBE FAILURE (row-count, exit ${probe_exit}): ${err_msg}" >&2
      return 1
    fi
    rm -f "$probe_stderr"
    case "$rc_raw" in
      ''|*[!0-9]*)
        echo "[db-empty-table-classify] PROBE FAILURE: row-count query returned non-numeric '${rc_raw}'" >&2
        return 1
        ;;
    esac
    row_count_json="$rc_raw"
  else
    exists="false"
    row_count_json="null"
  fi

  # ── Step 2: writer-provenance discriminator (static grep, no DB needed) ───
  local pattern="INSERT([[:space:]]+OR[[:space:]]+[A-Za-z]+)?[[:space:]]+INTO[[:space:]]+${table}\\b"
  local files_tmp
  files_tmp="$(mktemp)"
  grep -rliE "$pattern" "$search_root" \
    --include='*.ts' --include='*.go' \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
    > "$files_tmp" 2>/dev/null
  # grep exit 1 (no matches) is expected/benign here — NOT a probe failure.

  local site_lines="" production_count=0 tool_count=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    local ln kind
    ln="$(grep -niE "$pattern" "$f" 2>/dev/null | head -1 | cut -d: -f1)"
    [ -z "$ln" ] && ln="0"
    kind="$(_classify_site_kind "$f" "$exclude_dirs")"
    case "$kind" in
      production) production_count=$((production_count + 1)) ;;
      on-demand-tool) tool_count=$((tool_count + 1)) ;;
    esac
    site_lines="${site_lines}${f}	${ln}	${kind}
"
  done < "$files_tmp"
  rm -f "$files_tmp"

  local sites_json
  sites_json="$(printf '%s' "$site_lines" | jq -R -s '
    split("\n") | map(select(length > 0)) | map(split("\t")) |
    map({path: .[0], line: ((.[1] // "0") | tonumber), kind: .[2]})
  ')"

  # ── Step 3: assign class + severity ceiling (mechanical, per §1 table) ────
  local class severity_ceiling
  if [ "$exists" = "false" ]; then
    class="SCHEMA-MISSING"
    severity_ceiling="always_report"
  elif [ "$production_count" -gt 0 ]; then
    class="a"
    severity_ceiling="may_stay_critical"
  elif [ "$tool_count" -gt 0 ]; then
    class="c"
    severity_ceiling="info_or_warn_corroborate_to_escalate"
  else
    class="b"
    severity_ceiling="info_at_most_never_critical"
  fi

  jq -n \
    --arg table "$table" \
    --argjson exists "$exists" \
    --argjson row_count "$row_count_json" \
    --arg class "$class" \
    --arg severity_ceiling "$severity_ceiling" \
    --argjson writer_sites "$sites_json" \
    '{table: $table, exists: $exists, row_count: $row_count, class: $class, severity_ceiling: $severity_ceiling, writer_sites: $writer_sites}'
  return 0
}

# ── Standalone CLI mode (only when executed directly, not sourced) ──────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_db_empty_table_classify "$@"
  exit $?
fi
