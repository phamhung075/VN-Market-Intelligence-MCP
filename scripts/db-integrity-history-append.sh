#!/usr/bin/env bash
# db-integrity-history-append.sh — DETERMINISTIC append to the DB-integrity history array.
# Removes the LLM from the read-append-write step (it kept OVERWRITING the file to 1 entry while
# narrating "entry #N, last 200 kept"). The sweep agent passes ONLY the part it legitimately
# discovers — {tables_checked, findings:[...]} — as a JSON object on stdin; THIS script stamps
# scan_ts (date -u), embeds the deterministic canonical counts (scripts/db-integrity-counts.sh),
# appends to the rolling array, caps at 200, writes atomically, and HARD-ASSERTS the length grew.
# Read-only on the DB (via the counts helper). Pointer: .claude/commands/crons/cron-db-data-integrity.md
#
# FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED (AC-1/AC-2/AC-5): this script is now ALSO
# the sole actuator for the .signal_queue.rows[] write on every `verdict=="REAL"` finding — folded
# in here specifically because this is "the same helper that already owns the append" (AC-1's own
# words): the cron prompt already calls this script unconditionally every cycle to record its scan,
# so there is no longer a SEPARATE, skippable, prose-only REPORT step for a context-short agent to
# forget or hand-judge. Root cause this closes: the DEDUP-ENFORCEMENT clause in that same cron prompt
# was pure prose — nothing ever evaluated `.task_board`/`.signal_queue.rows[]` before a signal write,
# so the identical 336 daily_ohlcv rows were re-signalled 3x (2026-08-05T07:06Z, 2026-08-05T08:18:46Z,
# 2026-08-06T07:21:27Z) under TWO different dedup_key/type strings for the SAME underlying residue.
# For EACH finding with verdict=="REAL" (table required):
#   1. bash db-integrity-dedup-check.sh --table <table> (deterministic, see that script's own header
#      for the table+curated-synonym match semantics and the AC-3 false-positive-risk analysis that
#      shaped it — a naive per-token match was tried first and rejected, live, before this shipped).
#   2. already_open=true  -> the finding's signal_id becomes "already-open:<matched id>" and the RAW
#      dedup-check JSON is embedded verbatim as `dedup_check` (AC-4: raw match data, not narration) —
#      NO .signal_queue write happens.
#   3. already_open=false -> bash emit-audit-signal.sh --e3-only writes the row, with `to`/`payload_ref`
#      HARDCODED here (dev-team / docs/data/db-integrity-history.json) rather than left to the agent to
#      type — closes the AC-5 routing defect (to="po"+payload_ref=null, observed 3x) structurally: there
#      is no flag path by which this call site can produce the wrong values.
# A finding whose verdict is NOT "REAL" (BY-DESIGN/CLEAN/WARN/etc.) is passed through untouched — no
# dedup-check, no signal write, exactly today's behavior.
#
# EXIT CODES: 0 = history appended, all attempted signal writes (if any) succeeded.
#             2 = stdin is not a JSON object (unchanged from pre-existing contract).
#             3 = history-length assertion failed / would have overwritten (unchanged).
#             4 = history appended OK, but >=1 signal write failed (see `signals_written[].action`
#                 in the JSON stdout for which finding — the historical RECORD is never sacrificed to
#                 an emit failure, only the specific signal_queue row is missing; call it out loud).
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HIST="${DB_INTEGRITY_HISTORY:-docs/data/db-integrity-history.json}"
CAP="${HISTORY_CAP:-200}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- LLM-supplied entry body from stdin (findings/tables_checked); default to empty object ---
BODY="$(cat || true)"
[ -z "${BODY// }" ] && BODY='{}'
echo "$BODY" | jq -e 'type=="object"' >/dev/null 2>&1 || {
  echo "[HISTORY-APPEND] FAIL: stdin is not a JSON object" >&2; exit 2; }

# =============================================================================
# AC-1/AC-2/AC-5 — dedup-precheck + signal-write ownership for verdict==REAL
# findings. Skipped entirely (zero new subprocess calls, zero behavior change)
# when `.findings` is absent/empty or the two actuator scripts are missing —
# preserves today's behavior for every non-REAL-finding call unmodified.
# =============================================================================
DEDUP_SH="${HERE}/db-integrity-dedup-check.sh"
EMIT_SH="${HERE}/emit-audit-signal.sh"
SIGNAL_WRITE_FAILED="false"
SIGNALS_WRITTEN="[]"

FINDINGS_COUNT="$(echo "$BODY" | jq '(.findings // []) | length' 2>/dev/null || echo 0)"
case "$FINDINGS_COUNT" in ''|*[!0-9]*) FINDINGS_COUNT=0 ;; esac

if [ "$FINDINGS_COUNT" -gt 0 ] && [ -f "$DEDUP_SH" ] && [ -f "$EMIT_SH" ]; then
  UPDATED_FINDINGS="[]"
  i=0
  while [ "$i" -lt "$FINDINGS_COUNT" ]; do
    finding="$(echo "$BODY" | jq -c ".findings[$i]")"
    verdict="$(echo "$finding" | jq -r '.verdict // ""')"
    table="$(echo "$finding" | jq -r '.table // ""')"

    if [ "$verdict" = "REAL" ] && [ -n "$table" ] && [ "$table" != "null" ]; then
      DEDUP_RESULT="$(bash "$DEDUP_SH" --table "$table" 2>/dev/null)"
      echo "$DEDUP_RESULT" | jq -e . >/dev/null 2>&1 || DEDUP_RESULT='{"already_open":false,"error":"dedup-check-invocation-failed"}'
      ALREADY_OPEN="$(echo "$DEDUP_RESULT" | jq -r '.already_open // false')"

      if [ "$ALREADY_OPEN" = "true" ]; then
        MATCHED="$(echo "$DEDUP_RESULT" | jq -r '.matched_task_id // .matched_signal_id // "unknown"')"
        finding="$(echo "$finding" | jq --argjson dc "$DEDUP_RESULT" --arg sid "already-open:${MATCHED}" \
          '. + {signal_id: $sid, dedup_check: $dc}')"
      else
        SEVERITY="$(echo "$finding" | jq -r '.severity // "MED"')"
        DETAIL_TXT="$(echo "$finding" | jq -r '.detail // ""')"
        CLASS_TXT="$(echo "$finding" | jq -r '.class // "DB"' | tr '/' '-')"
        SUMMARY_TXT="$(printf '%s: %s' "$table" "$DETAIL_TXT" | cut -c1-120)"
        # AC-5: `to`/`--payload-ref` are HARDCODED on this call — never sourced
        # from the finding/agent — closing the 3x-repeated to="po"+payload_ref=
        # null routing defect structurally (no argument path can reproduce it).
        if EMIT_OUT="$(bash "$EMIT_SH" --e3-only \
            --check-id "${table}-${CLASS_TXT}" \
            --category-type db_integrity_breach \
            --severity "$SEVERITY" \
            --summary "$SUMMARY_TXT" \
            --detail-json '{}' \
            --to-agent dev-team \
            --payload-ref docs/data/db-integrity-history.json 2>&1)"; then
          NEW_ROW_ID="$(printf '%s' "$EMIT_OUT" | grep -o 'id=[^ ]*' | head -1 | cut -d= -f2)"
          if [ -z "${NEW_ROW_ID:-}" ]; then
            SIGNAL_WRITE_FAILED="true"
            finding="$(echo "$finding" | jq --arg m "$EMIT_OUT" '. + {signal_id: "WRITE-FAILED", emit_marker: $m}')"
          else
            finding="$(echo "$finding" | jq --arg sid "$NEW_ROW_ID" '. + {signal_id: $sid}')"
            SIGNALS_WRITTEN="$(echo "$SIGNALS_WRITTEN" | jq --arg t "$table" --arg id "$NEW_ROW_ID" '. + [{table:$t, id:$id, action:"written"}]')"
          fi
        else
          SIGNAL_WRITE_FAILED="true"
          finding="$(echo "$finding" | jq --arg m "$EMIT_OUT" '. + {signal_id: "WRITE-FAILED", emit_marker: $m}')"
        fi
      fi
    fi

    UPDATED_FINDINGS="$(echo "$UPDATED_FINDINGS" | jq --argjson f "$finding" '. + [$f]')"
    i=$((i + 1))
  done
  BODY="$(echo "$BODY" | jq --argjson nf "$UPDATED_FINDINGS" '.findings = $nf')"
fi

# --- deterministic canonical counts (verbatim from the counts helper) ---
COUNTS="$(bash "${HERE}/db-integrity-counts.sh" 2>/dev/null || echo '{}')"
echo "$COUNTS" | jq -e 'type=="object"' >/dev/null 2>&1 || COUNTS='{}'

# --- ensure the history file is a JSON array; recover from missing/corrupt without data loss risk ---
if [ -s "$HIST" ] && jq -e 'type=="array"' "$HIST" >/dev/null 2>&1; then
  BEFORE="$(jq 'length' "$HIST")"
else
  # never silently discard a non-empty non-array file — back it up, then start fresh
  if [ -s "$HIST" ]; then
    cp "$HIST" "${HIST}.corrupt.$(date -u +%Y%m%dT%H%M%SZ).bak" || echo "[HISTORY-APPEND] WARN: corrupt-file backup copy failed" >&2
  fi
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

mv "$TMP" "$HIST" || { echo "[HISTORY-APPEND] FAIL: atomic mv failed" >&2; rm -f "$TMP"; exit 3; }

jq -n \
  --arg ts "$TS" \
  --argjson before "$BEFORE" \
  --argjson after "$AFTER" \
  --argjson cap "$CAP" \
  --argjson signals_written "$SIGNALS_WRITTEN" \
  --argjson signal_write_failed "$([ "$SIGNAL_WRITE_FAILED" = "true" ] && echo true || echo false)" \
  '{ ok: true, scan_ts: $ts, history_len_before: $before, history_len_after: $after, cap: $cap,
     signals_written: $signals_written, signal_write_failed: $signal_write_failed }'

[ "$SIGNAL_WRITE_FAILED" = "true" ] && exit 4
exit 0
