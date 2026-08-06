#!/usr/bin/env bash
# db-integrity-counts.sh — DETERMINISTIC live-DB anomaly counts for the DB-data-integrity sweep.
# Removes LLM hallucination from the regression monitor: the cron-db-data-integrity sweep MUST
# use THIS script's JSON output verbatim for the history counts, never an LLM-recalled number.
# Read-only sidecar; never mutates the DB. Pointer: .claude/commands/crons/cron-db-data-integrity.md
#
# FIELD-NAME NOTE (FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR item 3,
# docs/agents/system-auditor/flow/data-writer-provenance.md §3): the `counts` keys below were
# renamed FROM the informal `db1_ohlc_violations` / `db2_scale_gt100x` / `db3_vnindex_cache_rows`
# / `c04_low_confidence_reports` labels — `c04` in particular visually collided with
# system-auditor's OFFICIAL Tier-3 `C-04`/`C-08` checks (a DIFFERENT check family entirely; those
# reported financial_reports actual=30 / alerts actual=42 against live raw counts of 257 / 144 —
# an unrelated, still-open predicate issue tracked by FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE,
# NOT touched here). Rename ONLY — no predicate/threshold/query logic changed by this pass.
# Any caller keyed on the OLD field names must be updated to the new ones (repo-wide grep at
# rename time found exactly 2 consumers, both prose docs, both updated in the same commit:
# .claude/commands/crons/cron-db-data-integrity.md, .claude/skills/cron-standalone-team/register.md.
# scripts/db-integrity-history-append.sh embeds `$counts.counts` generically — unaffected).
#
# OPEN PATTERN: file:?immutable=1 (NOT sqlite3 -readonly).
# Rationale: after the mcp-server writer restarts and recreates market.db-shm with its uid,
# a sidecar with a different uid cannot attach the writer-owned -shm to build the WAL index
# -> SQLITE_READONLY(8) -> query returns NOTHING -> all counts silently null.
# file:?immutable=1 bypasses WAL/-shm entirely and reads the main DB file directly, which is
# always safe for a read-only observer that never needs to see in-flight WAL pages.
set -euo pipefail

VOL="${MARKET_DB_VOLUME:-vn-market-intelligence-mcp_market_data}"
DB="${MARKET_DB_PATH:-/data/market.db}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# One sidecar invocation, all canonical anomaly COUNT(*)s, pipe-separated row.
# immutable=1: bypass WAL/-shm (safe for read-only observer; avoids uid mismatch on -shm).
# PROBE-FAILURE GUARD: capture exit code explicitly; disable set -e around the probe so we can
# emit a loud diagnostic instead of a silent exit-1 (set -e exits before we can store $?).
PROBE_STDERR="$(mktemp)"
set +e
ROW="$(docker run --rm -v "${VOL}":/data keinos/sqlite3 sqlite3 "file:${DB}?immutable=1" "
SELECT
  (SELECT count(*) FROM daily_ohlcv WHERE high<open OR high<close OR high<low OR low>open OR low>close),
  (SELECT count(*) FROM daily_ohlcv WHERE open>0 AND close>0 AND (close/open>100.0 OR open/close>100.0)),
  (SELECT count(*) FROM vn_index_cache),
  (SELECT count(*) FROM financial_reports WHERE extraction_confidence<0.2),
  (SELECT count(*) FROM daily_ohlcv),
  (SELECT COALESCE(max(date),'')  FROM daily_ohlcv),
  (SELECT COALESCE(max(updated_at),'') FROM market_prices),
  (SELECT count(*) FROM daily_ohlcv WHERE (high<open OR high<close OR low>open OR low>close) AND date >= date('now','-2 day'));
" 2>"${PROBE_STDERR}")"
PROBE_EXIT=$?
set -e

# PROBE-FAILURE GUARD: if the docker/sqlite command failed OR the row is empty, exit loud.
# Previously '|| true' + num() silently coerced probe failures to null — that masked outages.
if [ $PROBE_EXIT -ne 0 ]; then
  STDERR_MSG="$(cat "${PROBE_STDERR}" 2>/dev/null || true)"
  rm -f "${PROBE_STDERR}"
  echo "[DB-INTEGRITY-COUNTS] PROBE FAILURE (exit ${PROBE_EXIT}): ${STDERR_MSG}" >&2
  exit 1
fi
rm -f "${PROBE_STDERR}"
if [ -z "${ROW// }" ]; then
  echo "[DB-INTEGRITY-COUNTS] PROBE FAILURE: sqlite returned empty result — DB path wrong or volume not mounted" >&2
  exit 1
fi

IFS='|' read -r OHLC SCALE VNIDX LOWCONF TOTAL NEWEST MPFRESH FRESHVIOL <<EOF
${ROW}
EOF

# num() — returns the integer or null; a null in the canonical-4 (OHLC/SCALE/VNIDX/LOWCONF)
# is a PROBE FAILURE, not a valid metric. The guard below enforces this.
num() { case "$1" in ''|*[!0-9]*) echo null ;; *) echo "$1" ;; esac; }

# Validate the four canonical counts are non-null integers (empty = probe failure, not zero-anomaly).
for VAR_NAME in OHLC SCALE VNIDX LOWCONF TOTAL; do
  VAL="${!VAR_NAME:-}"
  case "$VAL" in
    ''|*[!0-9]*)
      echo "[DB-INTEGRITY-COUNTS] PROBE FAILURE: canonical count ${VAR_NAME} is non-numeric ('${VAL}') — aborting (was: ROW='${ROW}')" >&2
      exit 1
      ;;
  esac
done

cat <<JSON
{
  "scan_ts": "${TS}",
  "source": "scripts/db-integrity-counts.sh (deterministic — verbatim sqlite output)",
  "counts": {
    "ohlc_violations_count": $(num "${OHLC:-}"),
    "scale_gt100x_count": $(num "${SCALE:-}"),
    "vnindex_cache_rows_count": $(num "${VNIDX:-}"),
    "low_confidence_reports_count": $(num "${LOWCONF:-}")
  },
  "context": {
    "daily_ohlcv_total": $(num "${TOTAL:-}"),
    "daily_ohlcv_newest_date": "${NEWEST:-}",
    "market_prices_freshness": "${MPFRESH:-}",
    "fresh_ohlc_violations_last_2d": $(num "${FRESHVIOL:-}")
  }
}
JSON
