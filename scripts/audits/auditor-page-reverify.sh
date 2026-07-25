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
#       (a) which check_ids/pages are overdue (not probed within window_days)
#       (b) whether today's partition run itself was skipped in the past
#
# BOTH source files are READ-ONLY, always, no exceptions:
#   docs/data/quality-checklist.json           (qa-owned; NEVER written here)
#   docs/data/frontend-data-coverage-map.json  (NEVER written here — an earlier
#     revision of this script wrote a `verified_at` field onto this file directly;
#     that coupled its git mtime to this script's own daily heartbeat and broke
#     docs/agents/qa/flow/quality-audit.md's mtime-based re-sync trigger, which
#     cannot distinguish "coverage data actually changed" from "the auditor
#     stamped a timestamp" — a self-triggering false-positive loop. FIXED by
#     retiring the write entirely: `verified_at` for pages now lives ONLY in
#     this script's own ledger, under the `pages` namespace, same as `checks`.)
# Owned (sole write target, atomic tmp+mv, own namespace):
#   docs/data/auditor-page-reverify-ledger.json — `.checks{}` + `.pages{}`
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
#       vocabulary. Stamps `verified_at` into the ledger's `.checks{}` on every
#       check_id present (pass or fail). Prints one RECORD marker per check_id
#       (drift = stored_status=="PASS" AND live_verdict IN {"FAIL","WARN"} —
#       live probe found a problem the stored snapshot didn't have).
#   auditor-page-reverify.sh staleness-scan
#       -> prints one STALE marker per check_id/page whose ledger `verified_at`
#          is missing/older than window_days (7) — the "audit stopped running
#          and nobody noticed" proof, computed fresh from the ledger every run.
#          Scans BOTH `.checks{}` and `.pages{}` in one pass.
#   auditor-page-reverify.sh mark-skip --reason "<text>"
#       -> records today's partition as SKIPPED (election loss / abort) so a
#          coverage hole is an explicit ledger entry, never a silent gap.
#   auditor-page-reverify.sh map-select
#       -> "[page-reverify] MAP-SELECT partition=<n> count=<n> pages=<csv>" then
#          a JSON array of frontend-data-coverage-map.json rows (page/elem/
#          endpoint/store/writer/cadence/sla/asof/status) — READ-ONLY, no
#          `verified_at` key on this side (it lives only in the ledger) — for
#          today's partition (STATIC rows excluded — no freshness concept).
#   auditor-page-reverify.sh page-record --results <file.json>
#       <file.json> = JSON array of page names ["page-a","page-b",...] that
#       were actually live-reprobed this cycle. Stamps `verified_at` = now
#       into the ledger's `.pages{}` for ONLY those page names (atomic
#       tmp+mv on the LEDGER, never on frontend-data-coverage-map.json).
#
# Markers (grep "[page-reverify]"):
#   [page-reverify] SELECT partition=<n> count=<n> checks=<csv>
#   [page-reverify] RECORD OK check_id=<id> live=<verdict> drift=<bool>
#   [page-reverify] STALE check_id=<id> verified_at=<iso|never> age_days=<n>
#   [page-reverify] STALE page=<page> verified_at=<iso|never> age_days=<n>
#   [page-reverify] SKIP-RECORDED partition=<n> date=<date> reason=<text>
#   [page-reverify] MAP-SELECT partition=<n> count=<n> pages=<csv>
#   [page-reverify] PAGE-RECORD OK page=<page> verified_at=<iso>
#   [page-reverify] ABORT <reason>
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECKLIST_FILE="$REPO_ROOT/docs/data/quality-checklist.json"
MAP_FILE="$REPO_ROOT/docs/data/frontend-data-coverage-map.json"
LEDGER_FILE="$REPO_ROOT/docs/data/auditor-page-reverify-ledger.json"
# Gitignored project-relative working dir for this script's own transient temp
# files (never /tmp — project-wide convention, see .gitignore ".claude/tmp/").
WORK_DIR="$REPO_ROOT/.claude/tmp"
PARTITION_COUNT=7
WINDOW_DAYS=7

mkdir -p "$WORK_DIR" 2>/dev/null || true

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
_all_pages() {
  jq -r '.rows[] | select(.status != "STATIC") | .page' "$MAP_FILE" 2>/dev/null
}
_staleness_check() {
  # $1=kind(check_id|page) $2=id $3=jq-path-under-.checks-or-.pages
  local id="$1" ns="$2" now_e last first
  now_e=$(_now_epoch)
  last=$(jq -r --arg id "$id" --arg ns "$ns" '.[$ns][$id].verified_at // empty' "$LEDGER_FILE")
  first=$(jq -r --arg id "$id" --arg ns "$ns" '.[$ns][$id].first_seen_at // empty' "$LEDGER_FILE")
  local label; [ "$ns" = "pages" ] && label="page" || label="check_id"
  if [ -z "$last" ]; then
    if [ -n "$first" ]; then
      local first_e; first_e=$(_iso_to_epoch "$first")
      [ -z "$first_e" ] && return 0
      local age_days=$(( (now_e - first_e) / 86400 ))
      [ "$age_days" -gt "$WINDOW_DAYS" ] && echo "[page-reverify] STALE ${label}=${id} verified_at=never age_days=${age_days}"
    fi
    return 0
  fi
  local last_e; last_e=$(_iso_to_epoch "$last")
  [ -z "$last_e" ] && return 0
  local age_days=$(( (now_e - last_e) / 86400 ))
  [ "$age_days" -gt "$WINDOW_DAYS" ] && echo "[page-reverify] STALE ${label}=${id} verified_at=${last} age_days=${age_days}"
}
_ledger_init_if_missing() {
  [ -f "$LEDGER_FILE" ] && return 0
  local tmp
  tmp="$(mktemp "${LEDGER_FILE}.tmp.XXXXXX")"
  jq -n --arg ts "$(_now_iso)" --argjson pc "$PARTITION_COUNT" --argjson wd "$WINDOW_DAYS" \
    '{_ssot:"docs/data/auditor-page-reverify-ledger.json",_owner:"system-auditor",
      _note:"D-PAGE Tier-5 rotating re-verification ledger. verified_at = when system-auditor last live-reprobed — distinct from quality-checklist.json last_verified (qa-owned, read-only here) and frontend-data-coverage-map.json asof (data recency, not confirmation recency, also read-only here). Both source files are READ-ONLY — this ledger is the ONLY write target, by design (see script header: an earlier revision wrote verified_at onto the coverage map directly and created a false-trigger loop with qas mtime-based re-sync trigger).",
      schema_version:2, partition_count:$pc, window_days:$wd, updated_at:$ts,
      checks:{}, pages:{}, skipped_runs:[]}' > "$tmp" && mv -f "$tmp" "$LEDGER_FILE"
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
    tmpids="$(mktemp "$WORK_DIR/pgrv_ids.XXXXXX.json")"
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
    ids=$(_freshness_ids)
    while IFS= read -r id; do
      [ -z "$id" ] && continue
      _staleness_check "$id" "checks"
    done <<< "$ids"
    if [ -f "$MAP_FILE" ]; then
      pages=$(_all_pages)
      while IFS= read -r pg; do
        [ -z "$pg" ] && continue
        _staleness_check "$pg" "pages"
      done <<< "$pages"
    fi
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
    pages=$(_all_pages)
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
    tmpids="$(mktemp "$WORK_DIR/pgrv_pages.XXXXXX.json")"
    printf '%s\n' "${selected[@]:-}" | jq -R -s 'split("\n") | map(select(length>0))' > "$tmpids"
    # READ-ONLY: no verified_at key emitted here — that field lives only in the
    # ledger's .pages{} namespace (see page-record below), never on this file.
    jq --slurpfile pages "$tmpids" '
      [.rows[] | select(.page as $p | $pages[0] | index($p))
        | {page, elem, endpoint, store, writer, cadence, sla, asof, status}]
    ' "$MAP_FILE"
    rm -f "$tmpids"
    ;;

  page-record)
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
    jq --slurpfile pages "$results" --arg ts "$now" --argjson part "$part" '
      reduce $pages[0][] as $pg (.;
        .pages[$pg] = ((.pages[$pg] // {first_seen_at: $ts}) + {partition: $part, verified_at: $ts})
      ) | .updated_at = $ts
    ' "$LEDGER_FILE" > "$tmp" && mv -f "$tmp" "$LEDGER_FILE"
    jq -r '.[]' "$results" | while IFS= read -r pg; do
      echo "[page-reverify] PAGE-RECORD OK page=${pg} verified_at=${now}"
    done
    ;;

  *)
    echo "[page-reverify] ABORT unknown-command: ${cmd}"
    exit 2
    ;;
esac
