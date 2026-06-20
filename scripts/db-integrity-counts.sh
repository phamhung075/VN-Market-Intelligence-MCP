#!/usr/bin/env bash
# db-integrity-counts.sh — DETERMINISTIC live-DB anomaly counts for the DB-data-integrity sweep.
# Removes LLM hallucination from the regression monitor: the cron-db-data-integrity sweep MUST
# use THIS script's JSON output verbatim for the history counts, never an LLM-recalled number.
# Read-only sidecar; never mutates the DB. Pointer: .claude/commands/crons/cron-db-data-integrity.md
set -euo pipefail

VOL="${MARKET_DB_VOLUME:-vn-market-intelligence-mcp_market_data}"
DB="${MARKET_DB_PATH:-/data/market.db}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# One sidecar invocation, all canonical anomaly COUNT(*)s, pipe-separated row.
ROW="$(docker run --rm -v "${VOL}":/data keinos/sqlite3 sqlite3 -readonly "${DB}" "
SELECT
  (SELECT count(*) FROM daily_ohlcv WHERE high<open OR high<close OR high<low OR low>open OR low>close),
  (SELECT count(*) FROM daily_ohlcv WHERE open>0 AND close>0 AND (close/open>100.0 OR open/close>100.0)),
  (SELECT count(*) FROM vn_index_cache),
  (SELECT count(*) FROM financial_reports WHERE extraction_confidence<0.2),
  (SELECT count(*) FROM daily_ohlcv),
  (SELECT COALESCE(max(date),'')  FROM daily_ohlcv),
  (SELECT COALESCE(max(updated_at),'') FROM market_prices),
  (SELECT count(*) FROM daily_ohlcv WHERE (high<open OR high<close OR low>open OR low>close) AND date >= date('now','-2 day'));
" 2>/dev/null || true)"

IFS='|' read -r OHLC SCALE VNIDX LOWCONF TOTAL NEWEST MPFRESH FRESHVIOL <<EOF
${ROW}
EOF

num() { case "$1" in ''|*[!0-9]*) echo null ;; *) echo "$1" ;; esac; }

cat <<JSON
{
  "scan_ts": "${TS}",
  "source": "scripts/db-integrity-counts.sh (deterministic — verbatim sqlite output)",
  "counts": {
    "db1_ohlc_violations": $(num "${OHLC:-}"),
    "db2_scale_gt100x": $(num "${SCALE:-}"),
    "db3_vnindex_cache_rows": $(num "${VNIDX:-}"),
    "c04_low_confidence_reports": $(num "${LOWCONF:-}")
  },
  "context": {
    "daily_ohlcv_total": $(num "${TOTAL:-}"),
    "daily_ohlcv_newest_date": "${NEWEST:-}",
    "market_prices_freshness": "${MPFRESH:-}",
    "fresh_ohlc_violations_last_2d": $(num "${FRESHVIOL:-}")
  }
}
JSON
