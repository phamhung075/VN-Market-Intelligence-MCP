#!/usr/bin/env bash
# purge-legacy-processed-signals.sh — UC-SDF-P4 one-time purge of legacy/unstamped
# docs/signals/processed/ files that predate the FIX-DRAIN-SIGNALS-LEGACY-PRUNE-HOLE
# mtime-fallback fix in scripts/agents-flow/drain-signals.js (§0a-2).
#
# Going forward, drain-signals.js's own routine prune handles unstamped files on every
# drain tick (mtime fallback). This script is a ONE-TIME bulk catch-up for the backlog
# that already accumulated (~1,283 files at authoring time, 2026-07-16) so the very next
# drain tick doesn't unlinkSync ~1,283 tracked files in one shot and leave a mass-dirty,
# untracked-deletion working tree (feedback_push_blocked_by_perpetual_dirty_tree).
#
# Idempotent — safe to re-run any time; once caught up, qualifying count converges to 0.
#
# A file qualifies for purge ONLY if BOTH:
#   1. unstamped  — no _processed.processedAt AND no top-level processedAt (jq-checked)
#   2. mtime      — file mtime older than the same 7-day cutoff used by drain-signals.js §0a-2
# Stamped files and files within the 7-day mtime window are NEVER touched (dry-run or live).
# Unparseable JSON is SKIPPED (left alone) — mirrors the drain-signals.js catch-block contract
# ("leave unparseable files alone"); never delete a file we can't positively classify.
#
# Usage:
#   scripts/audits/purge-legacy-processed-signals.sh --dry-run   # count + list, NO deletes (default if no flag)
#   scripts/audits/purge-legacy-processed-signals.sh --live      # git rm the qualifying files
#
# Policy: docs/policies/dev-standards.md § Script Persistence
# Spec:   docs/agents/dev-team/flow/drain-signals.md §0a-2
# Canonical pointer: docs/agents/dev-team/flow/drain-signals.md §0a-2 "One-time purge"

set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROC="$ROOT/docs/signals/processed"
CUTOFF_EPOCH=$(( $(date -u +%s) - 604800 ))

MODE="dry-run"
for arg in "$@"; do
  case "$arg" in
    --live) MODE="live" ;;
    --dry-run) MODE="dry-run" ;;
    *) echo "Usage: $0 [--dry-run|--live]" >&2; exit 1 ;;
  esac
done

if [ ! -d "$PROC" ]; then
  echo "[purge-legacy-processed-signals] $PROC does not exist — nothing to do."
  exit 0
fi

qualifying=()
skipped_unparseable=0

while IFS= read -r -d '' f; do
  if ! stamped=$(jq -r '(._processed.processedAt // .processedAt // "null") | tostring' "$f" 2>/dev/null); then
    skipped_unparseable=$((skipped_unparseable + 1))
    continue   # unparseable — leave alone (matches drain-signals.js contract)
  fi
  if [ "$stamped" != "null" ]; then
    continue   # stamped file — never touch
  fi
  mtime_epoch=$(stat -f "%m" "$f" 2>/dev/null || stat -c "%Y" "$f" 2>/dev/null)
  if [ -z "$mtime_epoch" ] || [ "$mtime_epoch" -ge "$CUTOFF_EPOCH" ]; then
    continue   # within 7-day mtime window — never touch
  fi
  qualifying+=("$f")
done < <(find "$PROC" -maxdepth 1 -name '*.json' -print0)

count=${#qualifying[@]}
echo "[purge-legacy-processed-signals] mode=$MODE qualifying=$count skipped_unparseable=$skipped_unparseable (unstamped AND mtime > 7d old)"

if [ "$MODE" = "dry-run" ]; then
  if [ "$count" -gt 0 ]; then
    # Bash-only loop (no pipe to head) — avoids a SIGPIPE/pipefail abort when the
    # list is long and head closes the pipe early.
    shown=0
    for f in "${qualifying[@]}"; do
      [ "$shown" -ge 20 ] && break
      basename "$f"
      shown=$((shown + 1))
    done
    [ "$count" -gt 20 ] && echo "... ($((count - 20)) more)"
  fi
  echo "[purge-legacy-processed-signals] DRY-RUN — no files deleted. Re-run with --live to delete."
  exit 0
fi

if [ "$count" -eq 0 ]; then
  echo "[purge-legacy-processed-signals] Nothing to purge — already caught up (idempotent no-op)."
  exit 0
fi

cd "$ROOT"
git rm --quiet -- "${qualifying[@]}"
echo "[purge-legacy-processed-signals] LIVE — git rm'd $count file(s). Review with 'git status', then commit with explicit paths (never -A/-a)."
