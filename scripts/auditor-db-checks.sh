#!/usr/bin/env bash
# scripts/auditor-db-checks.sh — SSOT for Tier-2/3 system-auditor DB predicates that need
# more than a bare COUNT(*) threshold (rate-with-volume-floor, multi-column population
# filters). Extends scripts/db-integrity-counts.sh's exact discipline (deterministic,
# read-only, host-bind sqlite3, JSON stdout — see that script's own header for the fuller
# rationale of the read mechanism this one reuses verbatim).
#
# UC-ASL-P3 (auditor-signal-loop-P3, BACKLOG): the umbrella task to eventually port every
# Tier-2/3 predicate out of raw inline SQL in docs/agents/system-auditor/flow/main.md and
# into this file. This C-04 check is the FIRST predicate ported — added by
# FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE (spec dated 2026-08-08, implemented 2026-08-23,
# see docs/handoffs/FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE-spec.md §1-2 for the full
# derivation). Future checks land as additional `checks.<id>` keys in the same JSON payload,
# computed by the same single sqlite3 invocation below (extend the SELECT list + the IFS
# read, do not add a second process).
#
# C-04 predicate history (FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE spec,
# docs/handoffs/FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE-spec.md §1-2, full derivation):
#   D1 (recency): financial_reports.parsed_at is re-stamped on EVERY write (insert OR
#     reparse) — ON CONFLICT ... DO UPDATE SET parsed_at = excluded.parsed_at
#     (parseBctcReport.ts). A bulk historical reparse therefore re-enters old, already-known
#     rows into any parsed_at-anchored recency window. published_at is the immutable
#     counterpart — deliberately excluded from that same DO UPDATE SET clause
#     (FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP) so it survives every reparse
#     untouched. Anchor on COALESCE(published_at, parsed_at) — published_at when known,
#     parsed_at only as the same fallback the app's own write path already uses
#     (parseBctcReport.ts: `const publishedAt = callerPublishedAt ?? parsedAt`) for the
#     minority of rows inserted before an SSC-scraped publish date was available.
#   D2 (population): validation_status IN ('pending','pending_extraction') rows are
#     never-extracted shell rows (ensureFinancialReportShellRow.ts inserts them with
#     extraction_confidence bound to 0, not the schema's silent DEFAULT 1.0) — "not yet
#     extracted" is a different condition than "extracted at low confidence" and must not
#     share a population with genuinely low-confidence extractions.
#   Threshold: RATE with a minimum-volume floor, not an absolute count — an absolute count
#     cannot stay sensitive on a small batch while staying silent on a large healthy one
#     (a real 89-row batch was measured at 6.74% low-confidence, i.e. 6 rows > any count
#     threshold small enough to matter on a 5-row batch).
#
# DB ACCESS: same host-bind + WAL-guard mechanism as db-integrity-counts.sh (read this
# script's header for the fuller rationale — do NOT reintroduce docker-exec here).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB="${MARKET_DB_HOST_PATH:-$REPO_ROOT/data/live/market.db}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# C-04 tunables — env-overridable for testing only, NOT a caller-settable designated
# parameter in the system-auditor flow sense (dev-standards.md AUD-CP-1): these are the
# spec-internal threshold values this file IS the authority for.
C04_RATE_THRESHOLD_PCT="${C04_RATE_THRESHOLD_PCT:-15}"
C04_VOLUME_FLOOR="${C04_VOLUME_FLOOR:-20}"
C04_WINDOW="${C04_WINDOW:--7 days}"

# shellcheck source=./lib/sqlite-wal-guard.sh
source "$REPO_ROOT/scripts/lib/sqlite-wal-guard.sh"
READ_URI="$(wal_guard_read_uri "$DB")"
READ_MODE="$(wal_guard_read_mode "$DB")"

PROBE_STDERR="$(mktemp)"
set +e
ROW="$(sqlite3 "$READ_URI" "
SELECT
  (SELECT count(*) FROM financial_reports
     WHERE validation_status NOT IN ('pending','pending_extraction')
       AND datetime(COALESCE(published_at, parsed_at)) > datetime('now','${C04_WINDOW}')),
  (SELECT count(*) FROM financial_reports
     WHERE validation_status NOT IN ('pending','pending_extraction')
       AND extraction_confidence IS NOT NULL AND extraction_confidence < 0.2
       AND datetime(COALESCE(published_at, parsed_at)) > datetime('now','${C04_WINDOW}'));
" 2>"${PROBE_STDERR}")"
PROBE_EXIT=$?
set -e

if [ $PROBE_EXIT -ne 0 ]; then
  STDERR_MSG="$(cat "${PROBE_STDERR}" 2>/dev/null || true)"
  rm -f "${PROBE_STDERR}"
  echo "[AUDITOR-DB-CHECKS] PROBE FAILURE (exit ${PROBE_EXIT}, DB=${DB}, read_mode=${READ_MODE}): ${STDERR_MSG}" >&2
  exit 1
fi
rm -f "${PROBE_STDERR}"
if [ -z "${ROW// }" ]; then
  echo "[AUDITOR-DB-CHECKS] PROBE FAILURE: sqlite returned empty result — DB path wrong (${DB}, read_mode=${READ_MODE})" >&2
  exit 1
fi

IFS='|' read -r EXTRACTED_TOTAL LOWCONF_COUNT <<EOF
${ROW}
EOF

case "$EXTRACTED_TOTAL" in
  ''|*[!0-9]*)
    echo "[AUDITOR-DB-CHECKS] PROBE FAILURE: extracted_total_window non-numeric ('${EXTRACTED_TOTAL}') — aborting (ROW='${ROW}')" >&2
    exit 1
    ;;
esac
case "$LOWCONF_COUNT" in
  ''|*[!0-9]*)
    echo "[AUDITOR-DB-CHECKS] PROBE FAILURE: lowconf_count_window non-numeric ('${LOWCONF_COUNT}') — aborting (ROW='${ROW}')" >&2
    exit 1
    ;;
esac

# Rate as a percentage, 2dp; 0.00 (not null/div-by-zero) when population is 0 — floor
# below already makes the verdict PASS regardless when EXTRACTED_TOTAL < floor.
# LC_NUMERIC=C is MANDATORY on both awk calls below (FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE,
# 2026-08-23, caught live on this host: LC_NUMERIC=fr_FR.UTF-8 makes awk's printf "%.2f" emit a
# COMMA decimal separator ("0,00" not "0.00"), which corrupts the JSON payload below (a bare
# number token with an embedded comma is not valid JSON) and silently breaks every downstream
# consumer that parses this script's stdout — always force the C locale for numeric formatting).
if [ "$EXTRACTED_TOTAL" -gt 0 ]; then
  RATE_PCT="$(LC_NUMERIC=C awk -v n="$LOWCONF_COUNT" -v d="$EXTRACTED_TOTAL" 'BEGIN{printf "%.2f", (n*100.0)/d}')"
else
  RATE_PCT="0.00"
fi

VERDICT="PASS"
if [ "$EXTRACTED_TOTAL" -ge "$C04_VOLUME_FLOOR" ]; then
  TRIP="$(LC_NUMERIC=C awk -v r="$RATE_PCT" -v t="$C04_RATE_THRESHOLD_PCT" 'BEGIN{print (r>t)?"1":"0"}')"
  if [ "$TRIP" = "1" ]; then
    VERDICT="WARN"
  fi
fi

cat <<JSON
{
  "scan_ts": "${TS}",
  "source": "scripts/auditor-db-checks.sh (deterministic — verbatim sqlite output; SSOT per UC-ASL-P3)",
  "read_mode": "${READ_MODE}",
  "checks": {
    "c04": {
      "window": "${C04_WINDOW}",
      "recency_column": "COALESCE(published_at, parsed_at)",
      "population_filter": "validation_status NOT IN ('pending','pending_extraction')",
      "extracted_total_window": ${EXTRACTED_TOTAL},
      "lowconf_count_window": ${LOWCONF_COUNT},
      "lowconf_rate_pct": ${RATE_PCT},
      "volume_floor": ${C04_VOLUME_FLOOR},
      "rate_threshold_pct": ${C04_RATE_THRESHOLD_PCT},
      "verdict": "${VERDICT}"
    }
  }
}
JSON
