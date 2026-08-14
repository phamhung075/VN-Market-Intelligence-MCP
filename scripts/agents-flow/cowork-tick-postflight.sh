#!/usr/bin/env bash
# scripts/agents-flow/cowork-tick-postflight.sh
#
# UC-CDC-P7 Phase 2b (ultracode-audit-2026-07-12 #cowork-dispatcher-cron-P7) — deterministic
# tail-of-tick batch, consolidating 3 previously-separate call sites into one script call at
# the end of a WORK tick's dispatch body:
#   (a) Step 5b last_fired batch-write — delegates VERBATIM to the existing, QA-verified
#       scripts/agents-flow/cowork-write-last-fired.js (single read -> in-memory mutate ->
#       parse-back guard -> atomic rename; monotonic forward-only; non-fatal on failure).
#       This script does NOT reimplement that logic — it shells out to the same script,
#       preserving every guard exactly as-is (rescope note: "MUST preserve the QA-verified
#       guards verbatim").
#   (b) Step 4.7 cycle-snapshot assembly — same pure-bash jq assembly that lived inline in
#       docs/agents/cowork-team/flow/tick-snapshot.md. The two MCP calls that produce the
#       staged input files (get_cycle_bootstrap, get_macro_snapshot) are NOT bash-callable —
#       they are still made by the dispatcher LLM's pre-step, unchanged; this script only
#       consumes the already-staged files.
#   (c) docs/signals/processed/cowork-team-*.json retention sweep (>14 days) — NEW, closes
#       ultracode-audit I13 ("telemetry.md writes signals with no retention"). Deliberately
#       narrow scope for safety: ONLY docs/signals/processed/ (never the live inbox — an
#       undrained docs/signals/cowork-team-*.json row may still be pending dev-team action;
#       deleting it would be data loss, not cleanup) AND ONLY files that already carry a
#       _processed.processedAt/processedAt stamp (i.e. drain-signals.js has already decided
#       this file is done — same "positively classify before delete" discipline as
#       scripts/audits/purge-legacy-processed-signals.sh). This deliberately avoids
#       reintroducing the exact bug class drain-signals.js was hardened against ("previously
#       deleted any aged-out processed/ file unconditionally" — see drain-signals.js header
#       comments); it can never delete a file that isn't already independently marked done.
#
# Usage:
#   scripts/agents-flow/cowork-tick-postflight.sh <slot_id> [<slot_id> ...]
#     Slot ids = this tick's WON_SLOTS (successful spawns only — same set last-fired.md's
#     Step 5b already required non-empty before running). Zero args = last_fired write is
#     skipped (nothing to stamp); snapshot assembly + retention sweep still run (retention
#     is unconditional; snapshot degrades gracefully to a WARN+skip if the stage files this
#     tick's pre-step would have written are absent).
#
# Env overrides (test seams; defaults = real project paths):
#   ROOT              project root (default: git-relative from this file)
#   SCHED_FILE        passed through to cowork-write-last-fired.js
#   FIRED_AT          passed through to cowork-write-last-fired.js (ISO8601 override)
#   FILE_TICK         HH:MM override for snapshot filenames (default: date -u +%H:%M)
#   SIGNALS_DIR       docs/signals/ path override (retention sweep target's parent)
#   RETENTION_DAYS    default 14
#   SKIP_SNAPSHOT=1   skip Step 4.7 assembly entirely (test isolation / stage files absent)
#   SKIP_RETENTION=1  skip the retention sweep (test isolation)
#
# Exit code: always 0 on a normal run — every sub-step is independently non-fatal per its
# owning doc's contract (last_fired write failure, snapshot failure, and retention-sweep
# failure are all WARN-and-continue; spawns already happened, Steps 0-5 are already done by
# the time this script runs). stdout: one JSON line summarising all three sub-steps.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT="${ROOT:-$DEFAULT_ROOT}"

SIGNALS_DIR="${SIGNALS_DIR:-$ROOT/docs/signals}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# ── (a) last_fired batch write — verbatim delegation, no reimplementation ──
_last_fired_step() {
  if [ "$#" -eq 0 ]; then
    printf '{"ran":false,"reason":"no won slots"}'
    return 0
  fi
  local out rc
  # NOTE: resolved via $SCRIPT_DIR (this file's own directory), NOT $ROOT — $ROOT is a
  # DATA-root override (tests point it at an isolated fixture dir with no scripts/ tree;
  # SCHED_FILE/SIGNALS_DIR are the correct per-datum overrides for that). This script's
  # sibling scripts always live next to it, exactly like cowork-write-last-fired.js's own
  # default SCHED_FILE resolves via `path.join(__dirname, ...)`, never a caller-supplied root.
  out=$(FIRED_AT="${FIRED_AT:-}" SCHED_FILE="${SCHED_FILE:-}" node "$SCRIPT_DIR/cowork-write-last-fired.js" "$@" 2>&1)
  rc=$?
  if [ $rc -eq 0 ]; then
    printf '{"ran":true,"result":%s}' "$out"
  else
    # Non-fatal per AC-P1-7-3 (last-fired.md) — spawns already happened, never roll back.
    echo "[cowork-tick-postflight] WARN: last_fired write failed (exit=$rc): $out" >&2
    jq -n --arg err "$out" --argjson rc "$rc" '{ran:true,ok:false,rc:$rc,error:$err}'
  fi
}

# ── (b) cycle-snapshot assembly — same jq contract as tick-snapshot.md Step 4.7 ──
_snapshot_step() {
  if [ "${SKIP_SNAPSHOT:-0}" = "1" ]; then
    printf '{"ran":false,"reason":"SKIP_SNAPSHOT"}'
    return 0
  fi
  local file_tick mc_stage macro_stage snapshot_file tmpfile
  file_tick="${FILE_TICK:-$(date -u +%H:%M)}"
  mc_stage="$ROOT/docs/data/.cycle-snapshot-${file_tick}.mc.stage"
  macro_stage="$ROOT/docs/data/.cycle-snapshot-${file_tick}.macro.stage"
  snapshot_file="$ROOT/docs/data/cycle-snapshot-${file_tick}.json"
  tmpfile="${snapshot_file}.tmp"

  if [ ! -f "$mc_stage" ] || [ ! -f "$macro_stage" ]; then
    echo "[cowork-tick-postflight] snapshot skip: stage file(s) missing for tick ${file_tick} (agent pre-step did not run or already cleaned up)" >&2
    printf '{"ran":false,"reason":"stage files missing"}'
    return 0
  fi

  if jq -n \
      --arg tick "$file_tick" \
      --arg created_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      --rawfile market_context_raw "$mc_stage" \
      --slurpfile macro_snapshot_raw "$macro_stage" \
      '{tick: $tick, created_at: $created_at, market_context: ($market_context_raw | fromjson | .market_context // {}), macro_snapshot: $macro_snapshot_raw[0]}' \
      > "$tmpfile" 2>/dev/null && mv "$tmpfile" "$snapshot_file"; then
    rm -f "$mc_stage" "$macro_stage"
    find "$ROOT/docs/data" -maxdepth 1 -name 'cycle-snapshot-*.json' ! -name 'cycle-snapshot-latest.json' -mmin +1440 -delete 2>/dev/null || true
    printf '{"ran":true,"ok":true,"file":"docs/data/cycle-snapshot-%s.json"}' "$file_tick"
  else
    echo "[cowork-tick-postflight] WARN: snapshot assembly failed for tick ${file_tick} — agents fall back to direct get_cycle_bootstrap" >&2
    rm -f "$tmpfile" "$mc_stage" "$macro_stage"
    printf '{"ran":true,"ok":false,"error":"assembly failed"}'
  fi
}

# ── (c) retention sweep — docs/signals/processed/cowork-team-*.json, >RETENTION_DAYS old,
#        AND already carrying a processedAt stamp (never touches unstamped/live-inbox rows) ──
_retention_step() {
  if [ "${SKIP_RETENTION:-0}" = "1" ]; then
    printf '{"ran":false,"reason":"SKIP_RETENTION"}'
    return 0
  fi
  local proc="$SIGNALS_DIR/processed"
  if [ ! -d "$proc" ]; then
    printf '{"ran":true,"deleted":0,"reason":"no processed dir"}'
    return 0
  fi
  local cutoff_epoch now_epoch
  now_epoch=$(date -u +%s)
  cutoff_epoch=$(( now_epoch - RETENTION_DAYS * 86400 ))

  local qualifying=() f stamped mtime_epoch
  while IFS= read -r -d '' f; do
    stamped=$(jq -r '(._processed.processedAt // .processedAt // "null") | tostring' "$f" 2>/dev/null) || continue
    [ "$stamped" = "null" ] && continue   # unstamped — drain-signals.js hasn't finished with it; never touch
    mtime_epoch=$(stat -f "%m" "$f" 2>/dev/null || stat -c "%Y" "$f" 2>/dev/null)
    [ -z "$mtime_epoch" ] && continue
    [ "$mtime_epoch" -ge "$cutoff_epoch" ] && continue   # within retention window
    qualifying+=("$f")
  done < <(find "$proc" -maxdepth 1 -name 'cowork-team-*.json' -print0 2>/dev/null)

  local count=${#qualifying[@]}
  if [ "$count" -eq 0 ]; then
    printf '{"ran":true,"deleted":0}'
    return 0
  fi

  if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git -C "$ROOT" rm --quiet -- "${qualifying[@]}" >/dev/null 2>&1; then
      # NOTE (mirrors scripts/audits/purge-legacy-processed-signals.sh --live precedent):
      # `git rm` only STAGES the deletion — this script does NOT commit. cowork-team is a
      # non-dev-team dispatcher (Team Boundary: never writes git history unsupervised); the
      # staged deletion is picked up by the next explicit-pathspec commit in whichever flow
      # step already owns docs/signals/ commits, or by the dev-team stranded-state sweep.
      echo "[cowork-tick-postflight] retention: git rm'd $count aged docs/signals/processed/cowork-team-*.json file(s) — staged, not committed. Review with 'git status', commit with explicit paths (never -A/-a)." >&2
      jq -n --argjson n "$count" '{ran:true,deleted:$n,via:"git rm",committed:false}'
    else
      echo "[cowork-tick-postflight] WARN: git rm failed for $count aged processed/cowork-team-*.json file(s) — left in place, retry next tick" >&2
      printf '{"ran":true,"deleted":0,"error":"git rm failed"}'
    fi
  else
    # No git worktree in scope (e.g. isolated test fixture) — plain rm is safe here only
    # because the target files are already outside a tracked repo.
    rm -f -- "${qualifying[@]}"
    jq -n --argjson n "$count" '{ran:true,deleted:$n,via:"rm (no git worktree)"}'
  fi
}

_run_postflight() {
  local last_fired_result snapshot_result retention_result
  last_fired_result=$(_last_fired_step "$@")
  snapshot_result=$(_snapshot_step)
  retention_result=$(_retention_step)
  jq -n --argjson last_fired "$last_fired_result" --argjson snapshot "$snapshot_result" --argjson retention "$retention_result" \
    '{last_fired:$last_fired, snapshot:$snapshot, retention:$retention}'
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  _run_postflight "$@"
  exit 0
fi
