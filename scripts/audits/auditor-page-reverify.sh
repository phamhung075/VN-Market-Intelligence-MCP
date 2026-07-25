#!/usr/bin/env bash
# scripts/audits/auditor-page-reverify.sh
#
# D-PAGE (Tier-5) — Quality-Audit Freshness Rotation mechanical bookkeeping.
# system-auditor's daily rotating re-verification of (a) quality-checklist.json's
# "Data Freshness/SLA" check family (74 checks at authoring time — live glob,
# never hardcoded) and (b) frontend-data-coverage-map.json's per-page rows.
# THIS SCRIPT NEVER PROBES LIVE DATA ITSELF — the actual live probe (executing
# a check's own `recheck_how` recipe, or hitting a page's live served endpoint)
# can only be done by the calling LLM agent via mcp__gateway__call_tool /
# curl. This script does the MECHANICAL, deterministic parts only:
#   - stable partition assignment (cksum(key) mod 7 — NEVER array position;
#     qa/dev appending rows must never reshuffle an existing row's day)
#   - CANONICAL FIELD: `verified_at` — ISO-8601 UTC, second precision,
#     `date -u +%Y-%m-%dT%H:%M:%SZ` ONLY (no ms, no bare dates). Means "when
#     system-auditor last live-reprobed this row/check" — DISTINCT from
#     quality-checklist.json's own `last_verified` (qa-owned, untouched here)
#     and from frontend-data-coverage-map.json's `asof` (when the DATA is
#     from, not when the ROW's declared status was last confirmed true).
#     Written on EVERY probe, pass or fail — never fabricated, never carried
#     forward, never backfilled for rows not actually visited this run.
#   - the two coverage proofs a flow-doc cannot reliably self-verify:
#       (a) which check_ids are overdue (not probed within window_days)
#       (b) whether today's partition run itself was skipped in the past
#
# Read-only  : docs/data/quality-checklist.json (qa-owned; NEVER written here)
# Owned      : docs/data/auditor-page-reverify-ledger.json (tmp+mv atomic, new file)
# Narrow-write: docs/data/frontend-data-coverage-map.json — ONLY the `verified_at`
#               key per row is ever set here (map-record mode below); every other
#               key (status/asof/fix/endpoint/...) is byte-preserved. This file
#               carries NO active concurrent writer today (last edit 2026-07-02,
#               a one-time snapshot — see its own `_` field) — distinct from
#               quality-checklist.json, which stays fully off-limits.
#
# Usage:
#   auditor-page-reverify.sh select
#       -> "[page-reverify] SELECT partition=<n> count=<n> checks=<csv>" then a
#          JSON array of {check_id,dimension,status,last_verified,recheck_how,
#          zone_owner,evidence} for today's partition (stored snapshot ONLY —
#          the flow must still live-probe every one of these; this JSON is the
#          diff target, never a substitute for the probe).
#   auditor-page-reverify.sh record --results <file.json>
#       <file.json> = JSON array [{check_id, stored_status, live_verdict}].
#       live_verdict reuses quality-checklist.json's own enum (PASS|WARN|FAIL|
#       INFO|NEEDS_REVIEW) so the two are directly comparable — never a parallel
#       vocabulary. Stamps `verified_at` on every check_id present (pass or
#       fail). Prints one RECORD marker per check_id (drift = stored_status==
#       "PASS" AND live_verdict IN {"FAIL","WARN"} — live probe found a problem
#       the stored snapshot didn't have).
#   auditor-page-reverify.sh staleness-scan
#       -> prints one STALE marker per check_id whose `verified_at` is missing/
#          older than window_days (7) — the "audit stopped running and nobody
#          noticed" proof, computed fresh from the ledger every run.
#   auditor-page-reverify.sh mark-skip --reason "<text>"
#       -> records today's partition as SKIPPED (election loss / abort) so a
#          coverage hole is an explicit ledger entry, never a silent gap.
#   auditor-page-reverify.sh map-select
#       -> "[page-reverify] MAP-SELECT partition=<n> count=<n> pages=<csv>" then
#          a JSON array of frontend-data-coverage-map.json rows (page/elem/
#          endpoint/store/writer/cadence/sla/asof/status/verified_at) for
#          today's partition (STATIC rows excluded — no freshness concept).
#   auditor-page-reverify.sh map-record --results <file.json>
#       <file.json> = JSON array of page names ["page-a","page-b",...] that
#       were actually live-reprobed this cycle. Sets `verified_at` = now on
#       ONLY those rows in frontend-data-coverage-map.json (atomic tmp+mv,
#       every other key byte-preserved). Never touches rows outside the list.
#
# Markers (grep "[page-reverify]"):
#   [page-reverify] SELECT partition=<n> count=<n> checks=<csv>
#   [page-reverify] RECORD OK check_id=<id> live=<verdict> drift=<bool>
#   [page-reverify] STALE check_id=<id> verified_at=<iso|never> age_days=<n>
#   [page-reverify] SKIP-RECORDED partition=<n> date=<date> reason=<text>
#   [page-reverify] MAP-SELECT partition=<n> count=<n> pages=<csv>
#   [page-reverify] MAP-RECORD OK page=<page> verified_at=<iso>
#   [page-reverify] ABORT <reason>
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECKLIST_FILE="$REPO_ROOT/docs/data/quality-checklist.json"
MAP_FILE="$REPO_ROOT/docs/data/frontend-data-coverage-map.json"
LEDGER_FILE="$REPO_ROOT/docs/data/auditor-page-reverify-ledger.json"
PARTITION_COUNT=7
WINDOW_DAYS=7

_now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_now_epoch() { date -u +%s; }
_iso_to_epoch() {
  # portable ISO8601(Z) -> epoch, GNU then BSD fallback
  date -u -d "$1" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s 2>/dev/null
}
_today_partition() {
  # ISO weekday: Mon=1..Sun=7 -> partition 0..6
  local dow
  dow=$(date -u +%u)
  echo $(( dow - 1 ))
}
_partition_of() {
  # cksum(key) mod PARTITION_COUNT — stable, portable (POSIX cksum), never array position
  local key="$1" c
  c=$(printf '%s' "$key" | cksum | awk '{print $1}')
  echo $(( c % PARTITION_COUNT ))
}
_freshness_ids() {
  jq -r '[.capabilities[].checks[] | select(.dimension | test("Freshness|SLA")) | .check_id] | unique | .[]' "$CHECKLIST_FILE" 2>/dev/null
}
_ledger_init_if_missing() {
  [ -f "$LEDGER_FILE" ] && return 0
  local tmp
  tmp="$(mktemp "${LEDGER_FILE}.tmp.XXXXXX")"
  jq -n --arg ts "$(_now_iso)" --argjson pc "$PARTITION_COUNT" --argjson wd "$WINDOW_DAYS" \
    '{_ssot:"docs/data/auditor-page-reverify-ledger.json",_owner:"system-auditor",
      _note:"D-PAGE Tier-5 rotating re-verification ledger. verified_at = when system-auditor last live-reprobed — distinct from quality-checklist.json last_verified (qa-owned, read-only here) and frontend-data-coverage-map.json asof (data recency, not confirmation recency).",
      schema_version:1, partition_count:$pc, window_days:$wd, updated_at:$ts,
      checks:{}, skipped_runs:[]}' > "$tmp" && mv -f "$tmp" "$LEDGER_FILE"
}

cmd="${1:-}"
[ $# -gt 0 ] && shift

case "$cmd" in
  select)
    [ -f "$CHECKLIST_FILE" ] || { echo "[page-reverify] ABORT checklist-missing"; exit 1; }
    part=$(_today_partition)
    ids=$(_freshness_ids)
    if [ -z "$ids" ]; then
      echo "[page-reverify] ABORT no-freshness-checks-found"
      exit 1
    fi
    selected=()
    while IFS= read -r id; do
      [ -z "$id" ] && continue
      p=$(_partition_of "$id")
      [ "$p" = "$part" ] && selected+=("$id")
    done <<< "$ids"
    csv=$(IFS=,; echo "${selected[*]:-}")
    echo "[page-reverify] SELECT partition=${part} count=${#selected[@]} checks=${csv}"
    tmpids="$(mktemp /tmp/pgrv_ids.XXXXXX.json)"
    printf '%s\n' "${selected[@]:-}" | jq -R -s 'split("\n") | map(select(length>0))' > "$tmpids"
    jq --slurpfile ids "$tmpids" '
      [.capabilities[].checks[] | select(.check_id as $c | $ids[0] | index($c))
        | {check_id, dimension, status, last_verified, recheck_how, zone_owner, evidence}]
    ' "$CHECKLIST_FILE"
    rm -f "$tmpids"
    ;;

  staleness-scan)
    [ -f "$CHECKLIST_FILE" ] || { echo "[page-reverify] ABORT checklist-missing"; exit 1; }
    _ledger_init_if_missing
    now_e=$(_now_epoch)
    ids=$(_freshness_ids)
    while IFS= read -r id; do
      [ -z "$id" ] && continue
      last=$(jq -r --arg id "$id" '.checks[$id].verified_at // empty' "$LEDGER_FILE")
      first=$(jq -r --arg id "$id" '.checks[$id].first_seen_at // empty' "$LEDGER_FILE")
      if [ -z "$last" ]; then
        if [ -n "$first" ]; then
          first_e=$(_iso_to_epoch "$first")
          [ -z "$first_e" ] && continue
          age_days=$(( (now_e - first_e) / 86400 ))
          [ "$age_days" -gt "$WINDOW_DAYS" ] && echo "[page-reverify] STALE check_id=${id} verified_at=never age_days=${age_days}"
        fi
        continue
      fi
      last_e=$(_iso_to_epoch "$last")
      [ -z "$last_e" ] && continue
      age_days=$(( (now_e - last_e) / 86400 ))
      [ "$age_days" -gt "$WINDOW_DAYS" ] && echo "[page-reverify] STALE check_id=${id} verified_at=${last} age_days=${age_days}"
    done <<< "$ids"
    ;;

  record)
    results=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --results) results="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    if [ -z "$results" ] || [ ! -f "$results" ]; then
      echo "[page-reverify] ABORT results-file-missing"
      exit 1
    fi
    _ledger_init_if_missing
    tmp="$(mktemp "${LEDGER_FILE}.tmp.XXXXXX")"
    now="$(_now_iso)"
    part=$(_today_partition)
    jq --slurpfile res "$results" --arg ts "$now" --argjson part "$part" '
      reduce $res[0][] as $r (.;
        .checks[$r.check_id] = ((.checks[$r.check_id] // {first_seen_at: $ts}) + {
          partition: $part,
          verified_at: $ts,
          stored_status_at_probe: $r.stored_status,
          live_verdict: $r.live_verdict,
          drift: (($r.stored_status == "PASS") and ($r.live_verdict == "FAIL" or $r.live_verdict == "WARN"))
        })
      ) | .updated_at = $ts
    ' "$LEDGER_FILE" > "$tmp" && mv -f "$tmp" "$LEDGER_FILE"
    jq -c '.[]' "$results" | while IFS= read -r r; do
      cid=$(echo "$r" | jq -r '.check_id')
      lv=$(echo "$r" | jq -r '.live_verdict')
      ss=$(echo "$r" | jq -r '.stored_status')
      drift="false"
      if [ "$ss" = "PASS" ] && { [ "$lv" = "FAIL" ] || [ "$lv" = "WARN" ]; }; then drift="true"; fi
      echo "[page-reverify] RECORD OK check_id=${cid} live=${lv} drift=${drift}"
    done
    ;;

  mark-skip)
    reason=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --reason) reason="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    _ledger_init_if_missing
    tmp="$(mktemp "${LEDGER_FILE}.tmp.XXXXXX")"
    part=$(_today_partition)
    today=$(date -u +%Y-%m-%d)
    jq --arg date "$today" --argjson part "$part" --arg reason "${reason:-unspecified}" --arg ts "$(_now_iso)" '
      .skipped_runs += [{date:$date, partition:$part, reason:$reason}] |
      .skipped_runs |= (if length > 14 then .[-14:] else . end) |
      .updated_at = $ts
    ' "$LEDGER_FILE" > "$tmp" && mv -f "$tmp" "$LEDGER_FILE"
    echo "[page-reverify] SKIP-RECORDED partition=${part} date=${today} reason=${reason}"
    ;;

  map-select)
    [ -f "$MAP_FILE" ] || { echo "[page-reverify] ABORT map-missing"; exit 1; }
    part=$(_today_partition)
    pages=$(jq -r '.rows[] | select(.status != "STATIC") | .page' "$MAP_FILE")
    if [ -z "$pages" ]; then
      echo "[page-reverify] ABORT no-map-rows-found"
      exit 1
    fi
    selected=()
    while IFS= read -r pg; do
      [ -z "$pg" ] && continue
      p=$(_partition_of "$pg")
      [ "$p" = "$part" ] && selected+=("$pg")
    done <<< "$pages"
    csv=$(IFS=,; echo "${selected[*]:-}")
    echo "[page-reverify] MAP-SELECT partition=${part} count=${#selected[@]} pages=${csv}"
    tmpids="$(mktemp /tmp/pgrv_pages.XXXXXX.json)"
    printf '%s\n' "${selected[@]:-}" | jq -R -s 'split("\n") | map(select(length>0))' > "$tmpids"
    jq --slurpfile pages "$tmpids" '
      [.rows[] | select(.page as $p | $pages[0] | index($p))
        | {page, elem, endpoint, store, writer, cadence, sla, asof, status, verified_at: (.verified_at // null)}]
    ' "$MAP_FILE"
    rm -f "$tmpids"
    ;;

  map-record)
    results=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --results) results="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    if [ -z "$results" ] || [ ! -f "$results" ]; then
      echo "[page-reverify] ABORT results-file-missing"
      exit 1
    fi
    [ -f "$MAP_FILE" ] || { echo "[page-reverify] ABORT map-missing"; exit 1; }
    tmp="$(mktemp "${MAP_FILE}.tmp.XXXXXX")"
    now="$(_now_iso)"
    jq --slurpfile pages "$results" --arg ts "$now" '
      .rows |= map(if (.page as $p | $pages[0] | index($p)) then . + {verified_at: $ts} else . end)
    ' "$MAP_FILE" > "$tmp" && mv -f "$tmp" "$MAP_FILE"
    jq -r '.[]' "$results" | while IFS= read -r pg; do
      echo "[page-reverify] MAP-RECORD OK page=${pg} verified_at=${now}"
    done
    ;;

  *)
    echo "[page-reverify] ABORT unknown-command: ${cmd}"
    exit 2
    ;;
esac
