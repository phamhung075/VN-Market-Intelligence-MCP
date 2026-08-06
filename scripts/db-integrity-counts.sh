#!/usr/bin/env bash
# db-integrity-counts.sh — DETERMINISTIC live-DB anomaly counts for the DB-data-integrity sweep.
# Removes LLM hallucination from the regression monitor: the cron-db-data-integrity sweep MUST
# use THIS script's JSON output verbatim for the history counts, never an LLM-recalled number.
# Read-only, direct host-bind sqlite3; never mutates the DB. Pointer: .claude/commands/crons/cron-db-data-integrity.md
#
# DB ACCESS (FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT, 2026-08-06, AC-1): direct host-bind
# read — NO docker. 2026-07-15 commit 5ba622eca retired the docker named volume
# `vn-market-intelligence-mcp_market_data` in favour of a host bind mount (`./data/live:/app/data`
# in every service). This script's old `docker run --rm -v <named-volume>:/data keinos/sqlite3 ...`
# call was never migrated: docker silently AUTO-CREATED a fresh empty volume on every invocation
# and the query failed to open /data/market.db — PROBE FAILURE on every real invocation for 21 days,
# unnoticed because the failure fail-opened (see git history pre-2026-08-06 of this file). Candidate
# (ii) (re-mount the sidecar against the host dir, `-v "$PWD/data/live:/data:ro"`) was rejected —
# candidate (i) below removes docker entirely, which is strictly simpler and already the SHIPPED,
# empirically-verified pattern in scripts/db-empty-table-classify.sh (this repo's own most recent
# precedent, added the SAME day this bug was first reported). Verified 2026-08-06: a direct host
# read via `sqlite3 "file:data/live/market.db?immutable=1"` returns BYTE-IDENTICAL counts (6/6
# spot-checked columns) to the mcp-server container's own `bun:sqlite` reader on `/app/data/market.db`
# — two independent planes agree (memory: feedback_same_db_tools_diverge_rowcount). Do NOT
# re-create the named volume. CAUTION (see WAL-CONDITIONAL SAFETY note below, added
# 2026-08-06 PO QA-BLOCKING pass): that byte-identical measurement was a single
# snapshot taken when `-wal` happened to be 0 bytes — it proves this open pattern
# CAN be correct, not that it always is; do not re-cite it as general proof.
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
# SCOPING-HONESTY FIELD (FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED,
# AC-4): `context.ohlc_violation_distinct_dates` added below — a deterministic
# COUNT(DISTINCT date) over the exact same OHLC-violation predicate as
# `ohlc_violations_count`. This exists because a 2026-08-05 sweep (notebook
# c17, commit 35104ef89) narrated "All 336 violations are from 2026-05-15
# (concentrated date)" when the real GROUP BY spans 20 distinct dates — an
# agent-authored scoping claim with no matching query result anywhere in the
# record. Same remedy as the pre-existing "NO HALLUCINATED COUNTS" rule
# (.claude/commands/crons/cron-db-data-integrity.md): the sweep MUST use this
# field verbatim for any date-scoping claim ("concentrated", "single date",
# "all from one date", etc.) instead of eyeballing a sampled row.
#
# OPEN PATTERN: file:?immutable=1 IFF -wal is absent/0 bytes, else file:?mode=ro
# (NEVER sqlite3 -readonly — a foreign process attaching a writer-owned -shm under
# -readonly can hit SQLITE_READONLY(8) -> query returns NOTHING -> all counts
# silently null).
#
# WAL-CONDITIONAL SAFETY (FIX-DB-INTEGRITY-SIDECAR-NAMED-VOLUME-DRIFT, 2026-08-06,
# PO QA-BLOCKING AC-5/AC-6): `immutable=1` bypasses WAL/-shm ENTIRELY, so it is
# safe ONLY when `<db>-wal` is absent or 0 bytes at read time. Measured FALSE live
# with -wal at 1.5MB pending: immutable=1 returned daily_ohlcv=775891 (21 rows
# short, no error) AND journal_mode='delete' (stale header) while the DB was
# actually 'wal' and the true count was 775912 — a second reader on
# `file:...?mode=ro` at the SAME instant read both correctly. See
# scripts/lib/sqlite-wal-guard.sh for the full measurement + the guard this
# script now sources; never re-introduce a bare hardcoded `?immutable=1` here.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB="${MARKET_DB_HOST_PATH:-$REPO_ROOT/data/live/market.db}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# shellcheck source=./lib/sqlite-wal-guard.sh
source "$REPO_ROOT/scripts/lib/sqlite-wal-guard.sh"
READ_URI="$(wal_guard_read_uri "$DB")"
READ_MODE="$(wal_guard_read_mode "$DB")"

# One sqlite3 invocation, all canonical anomaly COUNT(*)s, pipe-separated row.
# READ_URI: immutable=1 fast path, or mode=ro WAL-safe fallback (see guard above).
# PROBE-FAILURE GUARD: capture exit code explicitly; disable set -e around the probe so we can
# emit a loud diagnostic instead of a silent exit-1 (set -e exits before we can store $?).
PROBE_STDERR="$(mktemp)"
set +e
ROW="$(sqlite3 "$READ_URI" "
SELECT
  (SELECT count(*) FROM daily_ohlcv WHERE high<open OR high<close OR high<low OR low>open OR low>close),
  (SELECT count(*) FROM daily_ohlcv WHERE open>0 AND close>0 AND (close/open>100.0 OR open/close>100.0)),
  (SELECT count(*) FROM vn_index_cache),
  (SELECT count(*) FROM financial_reports WHERE extraction_confidence<0.2),
  (SELECT count(*) FROM daily_ohlcv),
  (SELECT COALESCE(max(date),'')  FROM daily_ohlcv),
  (SELECT COALESCE(max(updated_at),'') FROM market_prices),
  (SELECT count(*) FROM daily_ohlcv WHERE (high<open OR high<close OR low>open OR low>close) AND date >= date('now','-2 day')),
  (SELECT count(DISTINCT date) FROM daily_ohlcv WHERE high<open OR high<close OR high<low OR low>open OR low>close);
" 2>"${PROBE_STDERR}")"
PROBE_EXIT=$?
set -e

# PROBE-FAILURE GUARD: if the sqlite3 command failed OR the row is empty, exit loud.
# Previously '|| true' + num() silently coerced probe failures to null — that masked outages.
if [ $PROBE_EXIT -ne 0 ]; then
  STDERR_MSG="$(cat "${PROBE_STDERR}" 2>/dev/null || true)"
  rm -f "${PROBE_STDERR}"
  echo "[DB-INTEGRITY-COUNTS] PROBE FAILURE (exit ${PROBE_EXIT}, DB=${DB}, read_mode=${READ_MODE}): ${STDERR_MSG}" >&2
  exit 1
fi
rm -f "${PROBE_STDERR}"
if [ -z "${ROW// }" ]; then
  echo "[DB-INTEGRITY-COUNTS] PROBE FAILURE: sqlite returned empty result — DB path wrong (${DB}, read_mode=${READ_MODE})" >&2
  exit 1
fi

IFS='|' read -r OHLC SCALE VNIDX LOWCONF TOTAL NEWEST MPFRESH FRESHVIOL VIOLDATES <<EOF
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
  "read_mode": "${READ_MODE}",
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
    "fresh_ohlc_violations_last_2d": $(num "${FRESHVIOL:-}"),
    "ohlc_violation_distinct_dates": $(num "${VIOLDATES:-}")
  }
}
JSON
