#!/usr/bin/env bash
# scripts/agents-flow/cowork-guaranteed-slot-firer.sh
#
# F1-LAUNCHD-COWORK-BACKSTOP — OS-level headless firer for ALL cowork
# guaranteed:true slots. Generalizes (and RETIRES) scripts/cowork-fb-daily-
# firer.sh, which hardcoded a per-slot UTC-window if-chain for fb-daily/
# fb-weekend only.
#
# ROOT CAUSE (unchanged from the retired script — see project memory
# project_cowork_guaranteed_slot_needs_live_cli_session, and the 73h-outage
# re-verification in docs/architecture-briefs/2026-07-07-cowork-guaranteed-
# slot-durability.md §1-2): the cowork-team master dispatcher (*/15
# CronCreate) is SESSION-SCOPED. When the CLI session ends, the dispatcher
# evaporates. There is no cloud RemoteTrigger backstop (STANDING:
# feedback_no_remote_trigger_all_local). Every guaranteed slot due during a
# session-down window is silently missed with no recovery path.
#
# WHY GENERALIZED (architecture brief §3, "Recommended shape"): the retired
# script hardcoded ONE if-block per slot (fb-daily, fb-weekend). Adding a
# 5th/6th/Nth guaranteed slot the same way repeats the exact hardcode-
# accretion pattern CLAUDE.md flags ("detect then reduce debt... hardcode")
# and guarantees the *next* new guaranteed slot repeats this outage. This
# script instead:
#   1. Calls the SAME matcher the live */15 dispatcher uses
#      (scripts/agents-flow/cowork-match-slots.js) — one SSOT
#      (docs/data/cowork-schedule.json), zero drift on "what counts as due"
#      between the OS-level backstop and the live dispatcher.
#   2. Filters the returned slots[] to guaranteed===true (deliberately
#      excludes sub-hourly market/offhours slots — those stay Layer-B-only
#      by design, bounding F-GATHERER-OFFHOURS-STALL-0704).
#   3. For each match, invokes `claude --dangerously-skip-permissions -p`
#      with slot.trigger_prompt READ VERBATIM off the matched slot object —
#      never hardcoded per-agent. A brand-new guaranteed:true row added to
#      cowork-schedule.json is covered automatically — ZERO script edits.
#
# DEDUP SAFETY: unchanged from the retired script. Every guaranteed-slot flow
# (chef.md Step 0.5, digest-predict/flow/main.md pre-D gate, fb-market-
# poster/flow/main.md's own gate) already implements the published-marker
# task_claim gate (FR-P2-7 pattern) BEFORE calling send_telegram. Even if
# this firer fires alongside a live cowork dispatcher, only the first
# invocation that wins the marker publishes. No wrapper-level dedup needed.
#
# HARDENING (architecture brief §3.7): each claude -p invocation is bounded
# by FIRE_TIMEOUT_SECONDS (default 1800s) via _bounded_exec() — closes the
# 2026-07-04 fb-weekend ~4.5h unbounded pile-up risk under launchd's 900s
# re-fire cadence. NOTE (verified empirically at implementation time, not
# assumed — brief §3.7 explicitly required this): this macOS host has
# NEITHER a `timeout` NOR a `gtimeout` binary on PATH (stock macOS ships no
# GNU coreutils `timeout`). _bounded_exec() prefers either if present, but
# the ACTUAL code path exercised in production on this machine is the pure-
# bash background-process + watchdog fallback — not a theoretical branch.
#
# USAGE:
#   bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh [--dry-run]
#   CLAUDE_BIN=/path/to/claude bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh
#
# FLAGS:
#   --dry-run   Log what would be invoked for every guaranteed match; never
#               invoke claude, never check the claude binary exists.
#
# ENV OVERRIDES (test seams — cowork-guaranteed-slot-firer.test.sh sources
# this file and overrides these before calling run_firer()/CLAUDE_BIN as a
# real fake-executable stub; production uses the defaults below):
#   FIRER_ROOT            — project root (default: git-relative from this file)
#   SLOT_MATCHER_CMD       — command producing {slots:[...],drift_min:N} JSON
#                            (default: node scripts/agents-flow/cowork-match-slots.js)
#   CLAUDE_BIN              — path to the claude binary
#   LOG_FILE_PATH / LOG_ERR_FILE_PATH — log destinations
#   FIRE_TIMEOUT_SECONDS    — per-slot invocation bound in seconds (default 1800)
#
# INVARIANTS:
#   - NEVER hardcodes a slot_id/trigger_prompt pair — always read off the
#     matched slot object returned by the matcher
#   - NEVER posts without going through the flow's own published-marker
#     dedup gate (this script has no gateway/MCP access of its own)
#   - One slot's claude invocation failing NEVER aborts processing of the
#     remaining matched slots in the same tick
#
# OWNING FLOW:  docs/agents/cowork-team/flow/main.md (Step 5 spawn-fanout.md)
# SCHEDULE SSOT: docs/data/cowork-schedule.json (.slots[] | select(.guaranteed))
# MATCHER:      scripts/agents-flow/cowork-match-slots.js (unchanged, reused)
# PLIST:        launchd/com.vn-market.cowork-guaranteed-slot-firer.plist
# INSTALL:      launchctl load ~/Library/LaunchAgents/com.vn-market.cowork-guaranteed-slot-firer.plist (ops)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT="${FIRER_ROOT:-$DEFAULT_ROOT}"

SLOT_MATCHER_CMD="${SLOT_MATCHER_CMD:-node \"$ROOT/scripts/agents-flow/cowork-match-slots.js\"}"
CLAUDE_BIN="${CLAUDE_BIN:-/Users/admin/.local/bin/claude}"
LOG_FILE="${LOG_FILE_PATH:-$ROOT/docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log}"
LOG_ERR_FILE="${LOG_ERR_FILE_PATH:-$ROOT/docs/agent-memory/sessions/cowork-guaranteed-slot-firer-error.log}"
FIRE_TIMEOUT_SECONDS="${FIRE_TIMEOUT_SECONDS:-1800}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }

# ── .env loader — Telegram tokens (mirrors the retired fb-daily-firer.sh) ────
_load_env() {
  local envfile="$ROOT/.env"
  if [ -f "$envfile" ]; then
    set +u
    while IFS='=' read -r key value; do
      case "$key" in '#'*|'') continue ;; esac
      export "$key=$value" 2>/dev/null || true
    done < <(grep -v '^#' "$envfile" | grep '=')
    set -u
  fi
}

# ── _bounded_exec: run "$@" bounded by <seconds>. Prefers a real `timeout`/
# `gtimeout` binary if present on PATH; falls back to a pure-bash background-
# process + watchdog otherwise (see header note — this IS the production
# path on this host, verified empirically, not theoretical). ────────────────
_bounded_exec() {
  local seconds="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
    return $?
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
    return $?
  fi
  "$@" &
  local cmd_pid=$!
  ( sleep "$seconds" && kill -TERM "$cmd_pid" 2>/dev/null ) &
  local watchdog_pid=$!
  wait "$cmd_pid" 2>/dev/null
  local rc=$?
  kill "$watchdog_pid" 2>/dev/null
  wait "$watchdog_pid" 2>/dev/null
  return $rc
}

# ── _fire_one_slot: invoke claude headlessly for ONE matched slot JSON
# object. Returns the invocation's exit code (0 for dry-run/skip). Never
# aborts the caller's loop — the caller decides what to do with a non-zero
# return. ─────────────────────────────────────────────────────────────────
_fire_one_slot() {
  local slot_json="$1" dry_run="$2"
  local slot_id trigger_prompt exit_code

  slot_id=$(printf '%s' "$slot_json" | jq -r '.slot_id // empty' 2>/dev/null)
  trigger_prompt=$(printf '%s' "$slot_json" | jq -r '.trigger_prompt // empty' 2>/dev/null)

  if [ -z "$slot_id" ] || [ -z "$trigger_prompt" ]; then
    log "WARN: matched slot missing slot_id/trigger_prompt — skipped: $(printf '%s' "$slot_json" | tr '\n' ' ' | cut -c1-200)"
    return 1
  fi

  log "--- guaranteed-slot-firer: slot=$slot_id ---"

  if [ "$dry_run" = "true" ]; then
    log "DRY-RUN: would invoke: (bounded ${FIRE_TIMEOUT_SECONDS}s) $CLAUDE_BIN --dangerously-skip-permissions -p '$trigger_prompt'"
    return 0
  fi

  if [ ! -x "$CLAUDE_BIN" ]; then
    log "ERROR: claude binary not found or not executable at '$CLAUDE_BIN' (slot=$slot_id)" | tee -a "$LOG_ERR_FILE" >&2
    return 1
  fi

  log "invoking (bounded ${FIRE_TIMEOUT_SECONDS}s): $CLAUDE_BIN --dangerously-skip-permissions -p 'slot=$slot_id'"

  ( cd "$ROOT" && _bounded_exec "$FIRE_TIMEOUT_SECONDS" "$CLAUDE_BIN" --dangerously-skip-permissions -p "$trigger_prompt" ) >> "$LOG_FILE" 2>> "$LOG_ERR_FILE"
  exit_code=$?
  log "flow exited (slot=$slot_id exit_code=$exit_code)"
  return $exit_code
}

# ── run_firer: main entry. Queries the matcher, filters to guaranteed===true,
# fires each match in turn. Returns 0 when every matched slot's invocation
# succeeded (or nothing matched — the common ~90%+ no-op tick). Returns
# non-zero when the matcher itself failed/produced unparseable output, OR
# when >=1 matched slot's invocation exited non-zero (still attempts every
# other match first — never aborts the loop early). ─────────────────────────
run_firer() {
  local dry_run="${1:-false}"
  local raw matcher_rc slots_json count i slot overall_rc=0 rc slot_err

  # stdout (JSON contract) and stderr (diagnostics: cowork-match-slots.js
  # cadence suppress/skip logs via console.error) are captured separately —
  # folding stderr into the parsed buffer (old: `2>&1`) let an in-tick
  # cadence-skip diagnostic corrupt the jq parse below and silently drop a
  # DUE guaranteed slot as a false "non-JSON output" ERROR (see
  # FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION, ported verbatim from
  # cowork-tick-preflight.sh's Step 6 mktemp stderr-separation idiom). The
  # exit!=0 error path still surfaces matcher stderr in the log message.
  slot_err=$(mktemp)
  raw=$(eval "$SLOT_MATCHER_CMD" 2>"$slot_err"); matcher_rc=$?
  if [ $matcher_rc -ne 0 ]; then
    log "ERROR: slot matcher command failed (exit=$matcher_rc): $(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-300) stderr: $(printf '%s' "$(cat "$slot_err")" | tr '\n' ' ' | cut -c1-300)"
    rm -f "$slot_err"
    return 1
  fi
  rm -f "$slot_err"

  slots_json=$(printf '%s' "$raw" | jq -c '[.slots[]? | select(.guaranteed == true)]' 2>/dev/null)
  if [ -z "$slots_json" ]; then
    log "ERROR: slot matcher returned non-JSON output: $(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-300)"
    return 1
  fi

  count=$(printf '%s' "$slots_json" | jq 'length' 2>/dev/null)
  if ! [[ "$count" =~ ^[0-9]+$ ]] || [ "$count" -eq 0 ]; then
    # Silent no-op — most 15-min ticks are this (~0 token cost, per
    # architecture brief §4 "no-op ticks: bash/node gate only").
    return 0
  fi

  _load_env

  for i in $(seq 0 $((count - 1))); do
    slot=$(printf '%s' "$slots_json" | jq -c ".[$i]")
    _fire_one_slot "$slot" "$dry_run"
    rc=$?
    [ $rc -ne 0 ] && overall_rc=$rc
  done

  return $overall_rc
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  DRY_RUN=false
  for arg in "$@"; do
    case "$arg" in
      --dry-run) DRY_RUN=true ;;
      *) echo "[cowork-guaranteed-slot-firer] WARN: unknown arg '$arg' — ignored" >&2 ;;
    esac
  done
  run_firer "$DRY_RUN"
  exit $?
fi
