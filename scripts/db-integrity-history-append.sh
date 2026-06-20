#!/usr/bin/env bash
# db-integrity-history-append.sh — DETERMINISTIC append to the DB-integrity history array.
# Removes the LLM from the read-append-write step (it kept OVERWRITING the file to 1 entry while
# narrating "entry #N, last 200 kept"). The sweep agent passes ONLY the part it legitimately
# discovers — {tables_checked, findings:[...]} — as a JSON object on stdin; THIS script stamps
# scan_ts (date -u), embeds the deterministic canonical counts (scripts/db-integrity-counts.sh),
# appends to the rolling array, caps at 200, writes atomically, and HARD-ASSERTS the length grew.
# Read-only on the DB (via the counts helper). Pointer: .claude/commands/crons/cron-db-data-integrity.md
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HIST="${DB_INTEGRITY_HISTORY:-docs/signals/db-integrity-history.json}"
CAP="${HISTORY_CAP:-200}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- LLM-supplied entry body from stdin (findings/tables_checked); default to empty object ---
BODY="$(cat || true)"
[ -z "${BODY// }" ] && BODY='{}'
echo "$BODY" | jq -e 'type=="object"' >/dev/null 2>&1 || {
  echo "[HISTORY-APPEND] FAIL: stdin is not a JSON object" >&2; exit 2; }

# --- deterministic canonical counts (verbatim from the counts helper) ---
COUNTS="$(bash "${HERE}/db-integrity-counts.sh" 2>/dev/null || echo '{}')"
echo "$COUNTS" | jq -e 'type=="object"' >/dev/null 2>&1 || COUNTS='{}'

# --- ensure the history file is a JSON array; recover from missing/corrupt without data loss risk ---
if [ -s "$HIST" ] && jq -e 'type=="array"' "$HIST" >/dev/null 2>&1; then
  BEFORE="$(jq 'length' "$HIST")"
else
  # never silently discard a non-empty non-array file — back it up, then start fresh
  if [ -s "$HIST" ]; then cp "$HIST" "${HIST}.corrupt.$(date -u +%Y%m%dT%H%M%SZ).bak"; fi
  printf '[]\n' > "$HIST"
  BEFORE=0
fi

EXPECTED=$(( BEFORE + 1 )); [ "$EXPECTED" -gt "$CAP" ] && EXPECTED="$CAP"

TMP="$(mktemp)"
jq \
  --arg ts "$TS" \
  --argjson body "$BODY" \
  --argjson counts "$COUNTS" \
  --argjson cap "$CAP" '
  . + [ $body + {
        scan_ts: $ts,
        counts: ($counts.counts // null),
        context: ($counts.context // null)
      } ]
  | (if length > $cap then .[length - $cap :] else . end)
' "$HIST" > "$TMP"

AFTER="$(jq 'length' "$TMP" 2>/dev/null || echo 0)"
if [ "$AFTER" != "$EXPECTED" ]; then
  echo "[HISTORY-APPEND] FAIL: length ${BEFORE} -> ${AFTER}, expected ${EXPECTED} (would OVERWRITE) — not written" >&2
  rm -f "$TMP"; exit 3
fi

mv "$TMP" "$HIST"   # atomic replace

cat <<JSON
{ "ok": true, "scan_ts": "${TS}", "history_len_before": ${BEFORE}, "history_len_after": ${AFTER}, "cap": ${CAP} }
JSON
