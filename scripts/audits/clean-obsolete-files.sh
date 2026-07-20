#!/usr/bin/env bash
# scripts/audits/clean-obsolete-files.sh — FIX-CMH-OBSOLETE-FILE-CLEANUP
#
# Reusable, allow-list-driven, quarantine-first obsolete-file cleanup for the
# claude-manager-helper (Context Janitor) Pass 0b. NEVER `rm`s directly —
# --live MOVES candidates into docs/data/.trash/<date>/ (gitignored) with a
# manifest.json audit trail; --dry-run (default) only reports.
#
# Policy SSOT (allow-list patterns A/B/C, hard invariants, quarantine/retention,
# signals-drain boundary): docs/policies/obsolete-file-cleanup.md
# Owning flow: docs/agents/claude-manager-helper/flow/main.md § Pass 0b
#
# Usage:
#   scripts/audits/clean-obsolete-files.sh [--dry-run|--live]
#   No flag -> dry-run, UNLESS OBSOLETE_CLEANUP_LIVE=1 is set in the env.
#   An explicit --dry-run flag ALWAYS wins over the env (safety valve, never
#   overridable). If both --dry-run and --live are passed, the LAST one wins.
#
# Env overrides (defaults shown):
#   OBSOLETE_GRACE_HOURS=6          pattern-B min age before eligible (pattern A is exempt — any age)
#   OBSOLETE_SNAPSHOT_KEEP_DAYS=2   pattern-C: newest N calendar days are always kept
#   OBSOLETE_TRASH_RETAIN_DAYS=7    self-purge: .trash/<date>/ dirs older than N days (--live only)
#   OBSOLETE_CLEANUP_LIVE=1         flips default mode to live when no --dry-run/--live flag given
#
# Exit code: 0 always (detective + best-effort mutator — never fail-loud, matches
# scripts/audits/c2-alert.sh / purge-legacy-processed-signals.sh convention).
# Bad CLI usage is the one exception (exit 2). Errors go to stderr with a
# [clean-obsolete-files] marker.
#
# Grep-able stdout markers (one event per line):
#   [clean-obsolete-files] START mode=<dry-run|live> grace_hours=<n> keep_days=<n> trash_retain_days=<n>
#   [clean-obsolete-files] CANDIDATE path=<relpath> reason=<pattern> age_h=<n> size_bytes=<n>
#   [clean-obsolete-files] SKIP-TRACKED path=<relpath>
#   [clean-obsolete-files] MOVED path=<relpath> -> <trash relpath>              (live only)
#   [clean-obsolete-files] ALREADY-QUARANTINED path=<relpath>                   (live only, idempotent rerun)
#   [clean-obsolete-files] SIGNALS count=<n> drain_behind=<true|false>          (detect-only — never touches docs/signals/*.json)
#   [clean-obsolete-files] TRASH-PURGE dir=<relpath> age_days=<n> action=<purged|would-purge>
#   [clean-obsolete-files] SUMMARY mode=<...> candidates=<n> moved=<n> tracked_skipped=<n> already_quarantined=<n>
#
# Best-effort Telegram (BUG channel, via scripts/agents-flow/mcp-call.sh — same
# transport emit-audit-signal.sh uses): dry-run candidates>0 notice, and the
# DRAIN-BEHIND signals notice. Telegram failure is non-fatal (never blocks the
# report or the quarantine).
#
# Injection-safety: every mcp_call() body is built via jq -n --arg (bound
# params) — never string-concatenated. Path/reason values only ever flow
# through jq --arg, matching the repo's SAFE-JSON convention.
#
# Shell: bash 3.2+ (macOS system /bin/bash) — no mapfile, no associative
# arrays, no namerefs. Portable BSD/GNU stat+date fallback pairs throughout
# (precedent: scripts/audits/purge-legacy-processed-signals.sh).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=../agents-flow/mcp-call.sh
source "$SCRIPT_DIR/../agents-flow/mcp-call.sh" 2>/dev/null || true

GRACE_HOURS="${OBSOLETE_GRACE_HOURS:-6}"
KEEP_DAYS="${OBSOLETE_SNAPSHOT_KEEP_DAYS:-2}"
TRASH_RETAIN_DAYS="${OBSOLETE_TRASH_RETAIN_DAYS:-7}"

MODE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) MODE="dry-run" ;;
    --live) MODE="live" ;;
    *) echo "[clean-obsolete-files] ABORT unknown-arg $arg (usage: --dry-run|--live)" >&2; exit 2 ;;
  esac
done
if [ -z "$MODE" ]; then
  if [ "${OBSOLETE_CLEANUP_LIVE:-0}" = "1" ]; then MODE="live"; else MODE="dry-run"; fi
fi

NOW_EPOCH=$(date -u +%s)
TODAY="$(date -u +%Y-%m-%d)"
TRASH_DIR="$REPO_ROOT/docs/data/.trash/$TODAY"

echo "[clean-obsolete-files] START mode=$MODE grace_hours=$GRACE_HOURS keep_days=$KEEP_DAYS trash_retain_days=$TRASH_RETAIN_DAYS"

# ── best-effort BUG-channel telegram — non-fatal, never blocks the pass ──────
_bug_telegram() {
  local msg="$1" args
  args=$(jq -n --arg channel "bug" --arg message "$msg" '{channel:$channel, message:$message}' 2>/dev/null) || return 0
  mcp_call "send_telegram" "$args" >/dev/null 2>&1 || true
}

# ── §4 invariant 2 belt-and-suspenders — scan dirs are already bounded, this
#    guards any candidate path regardless of how it was discovered ──────────
_forbidden_subtree() {
  case "$1" in
    "$REPO_ROOT"/.git/*|"$REPO_ROOT"/.claude/*|"$REPO_ROOT"/node_modules/*|"$REPO_ROOT"/apps/*|"$REPO_ROOT"/.backups/*|"$REPO_ROOT"/packages/*) return 0 ;;
    *) return 1 ;;
  esac
}

_is_tracked() {
  git -C "$REPO_ROOT" ls-files --error-unmatch -- "$1" >/dev/null 2>&1
}

# ── §4 invariant 4: no path traversal — resolve realpath, assert repo-root prefix ──
_realpath_in_repo() {
  local rp
  rp=$(realpath "$1" 2>/dev/null) || return 1
  case "$rp" in
    "$REPO_ROOT"/*) printf '%s\n' "$rp"; return 0 ;;
    *) return 1 ;;
  esac
}

_age_hours() {
  local mtime
  mtime=$(stat -f "%m" "$1" 2>/dev/null || stat -c "%Y" "$1" 2>/dev/null)
  [ -z "$mtime" ] && { echo 0; return; }
  echo $(( (NOW_EPOCH - mtime) / 3600 ))
}

_file_size() {
  stat -f "%z" "$1" 2>/dev/null || stat -c "%s" "$1" 2>/dev/null || echo 0
}

# Portable epoch -> YYYY-MM-DD (BSD `date -r <epoch>` first, GNU `date -d @<epoch>` fallback).
_epoch_to_day() {
  date -u -r "$1" +%Y-%m-%d 2>/dev/null || date -u -d "@$1" +%Y-%m-%d 2>/dev/null
}

# Portable YYYY-MM-DD -> epoch (BSD `date -j -f` first, GNU `date -d` fallback).
_day_to_epoch() {
  date -u -j -f "%Y-%m-%d" "$1" +%s 2>/dev/null || date -u -d "$1" +%s 2>/dev/null
}

_relpath() { printf '%s\n' "${1#"$REPO_ROOT"/}"; }

CANDIDATES=()   # each entry: "abspath|reason|age_h|size_bytes"
CAND_COUNT=0
TRACKED_SKIPPED=0

# §3 invariant 1 (tracked-guard) + §3 invariant 3 (grace guard, min_age in
# hours; pattern A callers pass 0) + §3 invariant 4 (realpath/traversal guard)
# applied to every candidate regardless of which pattern found it.
_consider() {
  local f="$1" reason="$2" min_age="$3" rp age size

  [ -f "$f" ] || return 0
  _forbidden_subtree "$f" && return 0
  rp=$(_realpath_in_repo "$f") || { echo "[clean-obsolete-files] SKIP-TRAVERSAL path=$f" >&2; return 0; }

  if _is_tracked "$rp"; then
    TRACKED_SKIPPED=$((TRACKED_SKIPPED + 1))
    echo "[clean-obsolete-files] SKIP-TRACKED path=$(_relpath "$rp")"
    return 0
  fi

  age=$(_age_hours "$rp")
  if [ "$age" -lt "$min_age" ]; then
    return 0
  fi

  size=$(_file_size "$rp")
  CANDIDATES+=("$rp|$reason|$age|$size")
  CAND_COUNT=$((CAND_COUNT + 1))
  echo "[clean-obsolete-files] CANDIDATE path=$(_relpath "$rp") reason=$reason age_h=$age size_bytes=$size"
}

# ── Pattern A — unexpanded-shell-var filenames (any age) ─────────────────────
_scan_pattern_a() {
  local dir="$1" f
  [ -d "$dir" ] || return 0
  while IFS= read -r -d '' f; do
    _consider "$f" "pattern-A:unexpanded-shell-var" 0
  done < <(find "$dir" -maxdepth 1 -type f -name '$*' -print0 2>/dev/null)
}
_scan_pattern_a "$REPO_ROOT"
_scan_pattern_a "$REPO_ROOT/docs/data"
_scan_pattern_a "$REPO_ROOT/docs/archive"

# ── Pattern B — atomic-write .tmp leftovers (> GRACE_HOURS) ──────────────────
# `*.json.tmp` is already a subset of `*.tmp`; `*.tmp.*` catches suffixed variants
# (e.g. foo.tmp.12345) — kept as a distinct glob for policy-doc traceability.
_scan_pattern_b() {
  local dir="$1" f
  [ -d "$dir" ] || return 0
  while IFS= read -r -d '' f; do
    _consider "$f" "pattern-B:atomic-write-tmp" "$GRACE_HOURS"
  done < <(find "$dir" -maxdepth 1 -type f \( -name '*.tmp' -o -name '*.tmp.*' \) -print0 2>/dev/null)
}
_scan_pattern_b "$REPO_ROOT/docs/data"
_scan_pattern_b "$REPO_ROOT/docs/archive"

# ── Pattern C — superseded per-cycle snapshots, keep newest KEEP_DAYS calendar days ──
# unified-agent-synthesis-*.json: date comes from the filename (YYYY-MM-DD segment).
_scan_pattern_c_unified() {
  local dir="$REPO_ROOT/docs/data" f day
  [ -d "$dir" ] || return 0
  local files=() daykeys=()
  while IFS= read -r -d '' f; do
    day=$(basename "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
    [ -z "$day" ] && continue   # unparseable name — leave alone, never guess
    files+=("$f"); daykeys+=("$day")
  done < <(find "$dir" -maxdepth 1 -type f -name 'unified-agent-synthesis-*.json' -print0 2>/dev/null)
  [ ${#files[@]} -eq 0 ] && return 0

  local uniq_days kept=" " i=0 idx d
  uniq_days=$(printf '%s\n' "${daykeys[@]}" | sort -u -r)
  for d in $uniq_days; do
    [ "$i" -ge "$KEEP_DAYS" ] && break
    kept="$kept$d "
    i=$((i + 1))
  done
  idx=0
  for f in "${files[@]}"; do
    d="${daykeys[$idx]}"; idx=$((idx + 1))
    case "$kept" in
      *" $d "*) continue ;;
    esac
    _consider "$f" "pattern-C:superseded-snapshot(unified-agent-synthesis)" "$GRACE_HOURS"
  done
}
_scan_pattern_c_unified

# cycle-snapshot-*.json: filename has no date (HH:MM only) — day derives from
# mtime. cycle-snapshot-latest.json is the active pointer — never a candidate.
_scan_pattern_c_cycle() {
  local dir="$REPO_ROOT/docs/data" f mtime day
  [ -d "$dir" ] || return 0
  local files=() daykeys=()
  while IFS= read -r -d '' f; do
    case "$(basename "$f")" in
      cycle-snapshot-latest.json) continue ;;
    esac
    mtime=$(stat -f "%m" "$f" 2>/dev/null || stat -c "%Y" "$f" 2>/dev/null)
    [ -z "$mtime" ] && continue
    day=$(_epoch_to_day "$mtime")
    [ -z "$day" ] && continue
    files+=("$f"); daykeys+=("$day")
  done < <(find "$dir" -maxdepth 1 -type f -name 'cycle-snapshot-*.json' -print0 2>/dev/null)
  [ ${#files[@]} -eq 0 ] && return 0

  local uniq_days kept=" " i=0 idx d
  uniq_days=$(printf '%s\n' "${daykeys[@]}" | sort -u -r)
  for d in $uniq_days; do
    [ "$i" -ge "$KEEP_DAYS" ] && break
    kept="$kept$d "
    i=$((i + 1))
  done
  idx=0
  for f in "${files[@]}"; do
    d="${daykeys[$idx]}"; idx=$((idx + 1))
    case "$kept" in
      *" $d "*) continue ;;
    esac
    _consider "$f" "pattern-C:superseded-snapshot(cycle-snapshot)" "$GRACE_HOURS"
  done
}
_scan_pattern_c_cycle

# ── §6 HARD BOUNDARY — docs/signals/*.json is DETECT-ONLY, never a candidate ──
_check_signals_drain_behind() {
  local dir="$REPO_ROOT/docs/signals" count
  count=$(find "$dir" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  count="${count:-0}"
  if [ "$count" -gt 50 ]; then
    echo "[clean-obsolete-files] SIGNALS count=$count drain_behind=true"
    _bug_telegram "[clean-obsolete-files] DRAIN-BEHIND: docs/signals/ has ${count} top-level *.json files (>50) — dev-team drain owner (docs/agents/dev-team/flow/drain-signals.md) must catch up. Detect-only; this pass never deletes docs/signals/*.json."
  else
    echo "[clean-obsolete-files] SIGNALS count=$count drain_behind=false"
  fi
}
_check_signals_drain_behind

# ── quarantine manifest append (tmp+mv atomic, same convention as
#    auditor-dedup-ledger.json / scripts/emit-audit-signal.sh) ───────────────
_manifest_append() {
  local relp="$1" reason="$2" size="$3" moved_at="$4"
  local manifest="$TRASH_DIR/manifest.json" existing tmp
  if [ -f "$manifest" ] && jq -e . "$manifest" >/dev/null 2>&1; then
    existing=$(cat "$manifest")
  else
    existing='[]'
  fi
  tmp=$(mktemp "$TRASH_DIR/.manifest-XXXXXXXX.json")
  printf '%s' "$existing" | jq --arg p "$relp" --arg r "$reason" --argjson s "${size:-0}" --arg t "$moved_at" \
    '. + [{original_path:$p, reason:$r, size_bytes:$s, moved_at:$t}]' > "$tmp" && mv "$tmp" "$manifest"
}

# ── §4 quarantine (--live only) — MOVE, never rm; §3 invariant 5 idempotency:
#    a file already moved away from its scan location naturally yields 0 new
#    candidates on rerun; a same-day name collision is skipped (never overwritten) ──
MOVED_COUNT=0
ALREADY_Q=0
if [ "$MODE" = "live" ] && [ "$CAND_COUNT" -gt 0 ]; then
  mkdir -p "$TRASH_DIR"
  for entry in "${CANDIDATES[@]}"; do
    IFS='|' read -r abspath reason age size <<< "$entry"
    relp=$(_relpath "$abspath")
    dest="$TRASH_DIR/$relp"
    if [ -e "$dest" ]; then
      ALREADY_Q=$((ALREADY_Q + 1))
      echo "[clean-obsolete-files] ALREADY-QUARANTINED path=$relp"
      continue
    fi
    mkdir -p "$(dirname "$dest")"
    if mv "$abspath" "$dest" 2>/dev/null; then
      MOVED_COUNT=$((MOVED_COUNT + 1))
      echo "[clean-obsolete-files] MOVED path=$relp -> ${dest#"$REPO_ROOT"/}"
      _manifest_append "$relp" "$reason" "$size" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    else
      echo "[clean-obsolete-files] ABORT move-failed path=$relp" >&2
    fi
  done
elif [ "$MODE" = "dry-run" ] && [ "$CAND_COUNT" -gt 0 ]; then
  _bug_telegram "[clean-obsolete-files] dry-run found ${CAND_COUNT} obsolete-file candidate(s) (tracked_skipped=${TRACKED_SKIPPED}) — run --live to quarantine into docs/data/.trash/. Policy: docs/policies/obsolete-file-cleanup.md"
fi

# ── §4 self-purge — .trash/<date>/ dirs older than TRASH_RETAIN_DAYS ─────────
_self_purge_trash() {
  local trash_root="$REPO_ROOT/docs/data/.trash" d base day_epoch age_days
  [ -d "$trash_root" ] || return 0
  for d in "$trash_root"/*/; do
    [ -d "$d" ] || continue
    base=$(basename "$d")
    case "$base" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
      *) continue ;;   # not a date-named quarantine dir — never touch
    esac
    day_epoch=$(_day_to_epoch "$base")
    [ -z "$day_epoch" ] && continue
    age_days=$(( (NOW_EPOCH - day_epoch) / 86400 ))
    if [ "$age_days" -ge "$TRASH_RETAIN_DAYS" ]; then
      if [ "$MODE" = "live" ]; then
        rm -rf "$d"
        echo "[clean-obsolete-files] TRASH-PURGE dir=docs/data/.trash/$base age_days=$age_days action=purged"
      else
        echo "[clean-obsolete-files] TRASH-PURGE dir=docs/data/.trash/$base age_days=$age_days action=would-purge"
      fi
    fi
  done
}
_self_purge_trash

echo "[clean-obsolete-files] SUMMARY mode=$MODE candidates=$CAND_COUNT moved=$MOVED_COUNT tracked_skipped=$TRACKED_SKIPPED already_quarantined=$ALREADY_Q"
exit 0
