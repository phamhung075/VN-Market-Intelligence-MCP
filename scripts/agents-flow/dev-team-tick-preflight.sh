#!/usr/bin/env bash
# scripts/agents-flow/dev-team-tick-preflight.sh
#
# TOKEN-ECONOMY-TICK-PREFLIGHT WU-2 — deterministic dev-team cron-tick
# preflight. Replaces the LLM-narrated presence/SF-1/fire-election chain of
# docs/agents/dev-team/flow/main.md Step 0-PREFLIGHT with one bash+jq+curl
# call on the common RUN/SKIP path.
# Spec: docs/agent-memory/decisions/sprint-TOKEN-ECONOMY-TICK-PREFLIGHT-pm.md
#       § WU-2, docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md (R6/R7/R8)
#
# Steps (mirrors main.md Step 0-PREFLIGHT, minus self-arm — see R6 below):
#   1. Compute TICK (largest scheduled minute in {07,37} <= current minute)
#   2. Presence claim/heartbeat (session-presence:<sid>, TTL=1800) — main.md
#      says explicitly "Presence result is NEVER a gate — always proceed to
#      SF-1", so this step is best-effort: any failure (transport OR
#      malformed JSON) is logged to stderr and swallowed, never blocks.
#   3. SF-1 claim (dev-team-cron-singleton, task_kind=sprint-task, TTL=5400)
#      — THIS gates. Not-claimed (peer holds it) => SKIP path (a): nothing
#      released (never held it). Transport/malformed-JSON => ERROR (R8),
#      lock state undefined, fallback repairs via re-claim.
#   4. Fire-election claim (cron:dev-team:<TICK>, task_kind=sprint-task,
#      TTL=600) — re-entrant self-hold renews + proceeds (matches main.md's
#      RE-ENTRANT branch). Lost-to-peer => SKIP path (b): SF-1 (just claimed
#      in Step 3) is released before SKIP (R7 — two DISTINCT skip paths with
#      different release obligations, must not be collapsed into one).
#      Transport/malformed-JSON => SF-1 is released too (see decision journal
#      — main.md's fallback SF-1 claim step has NO re-entrant self-hold
#      check, so leaving SF-1 held across an ERROR would strand it for the
#      full 90min TTL once the fallback pseudocode re-runs the SF-1 claim
#      and finds it "not claimed" (held by self) and exits — releasing first
#      avoids that self-inflicted deadlock) then ERROR.
#
# Verdict JSON (one line, stdout): {verdict, tick, detail}.
#   verdict ∈ RUN|SKIP|ERROR.
# Exit code: 0 = SKIP (no LLM read needed — script already sent the telegram
#   and settled lock state). 1 = RUN|ERROR (LLM continues: RUN reads main.md
#   at `gcc-preflight` onward; ERROR falls back to the full original inline
#   pseudocode at `preflight-fallback`).
#
# NOT part of this script (R6 — CronCreate/CronList/CronDelete are Claude
# Code CLI-native tools, unreachable from a curl-based script): self-arm of
# the cron-detect-loop skill. That instruction moved to the CronCreate
# `prompt:` text itself in .claude/skills/cron-detect-loop/SKILL.md Job 1 —
# it now runs FIRST, before this script, on every tick (RUN and SKIP alike).
#
# NOT part of this script (token-economy tradeoff, documented in decision
# journal): the "[dev-team] cron START" telegram main.md used to send before
# any lock step. Sending it unconditionally would push the SKIP-path (a)
# call count from 2 to 3, violating the PM spec's explicit "Skip tick <= 2
# tool calls" DoD. It remains only in the ERROR-fallback pseudocode body.
#
# Env overrides (test seam — CLAUDE_CODE_SESSION_ID is the only one this
# script itself reads beyond mcp-call.sh's MCP_HTTP_URL/MCP_CALL_TIMEOUT_S):
#   CLAUDE_CODE_SESSION_ID — REQUIRED. Coordination parameter, never
#     echoed/logged by this script beyond its use as a bound task_claim/
#     task_heartbeat/task_release arg.
#
# HARD CONSTRAINT: NEVER live-claim dev-team-cron-singleton or
# cron:dev-team:* outside a real cron tick — these are PRODUCTION mutexes.
# Tests for this script MUST mock mcp_call (see
# dev-team-tick-preflight.test.sh) — zero real side-effecting calls.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=./mcp-call.sh
source "$SCRIPT_DIR/mcp-call.sh"

_trunc() { printf '%s' "$1" | tr '\n' ' ' | cut -c1-200; }

_is_json() {
  if printf '%s' "$1" | jq -e . >/dev/null 2>&1; then
    echo true
  else
    echo false
  fi
}

_emit_verdict() {
  local verdict="$1" tick="$2" detail="$3"
  jq -n --arg verdict "$verdict" --arg tick "$tick" --arg detail "$detail" \
    '{verdict:$verdict, tick:$tick, detail:$detail}'
}

# ── Step 2: presence claim/heartbeat — best-effort, NEVER a gate ─────────────
_step_presence() {
  local session_id="$1" ts="$2"
  local payload_str claim_args claim_result claim_rc claimed holder_session

  payload_str=$(jq -cn --arg agent "dev-team" --arg host "$(hostname)" --arg started "$ts" \
    '{agent_id:$agent, host:$host, started_at:$started, current_task:"preflight"}')
  claim_args=$(jq -n --arg tid "session-presence:$session_id" --arg sess "$session_id" \
    --arg payload "$payload_str" \
    '{task_id:$tid, task_kind:"session-presence", owner_agent:"dev-team", owner_client_session:$sess, ttl_seconds:1800, payload:$payload}')

  claim_result=$(mcp_call "task_claim" "$claim_args" 2>&1); claim_rc=$?
  if [ $claim_rc -ne 0 ]; then
    echo "[dev-team-preflight] WARN: presence claim transport error (non-fatal, never a gate): $(_trunc "$claim_result")" >&2
    return 0
  fi
  if [ "$(_is_json "$claim_result")" != "true" ]; then
    echo "[dev-team-preflight] WARN: presence claim malformed JSON (non-fatal, never a gate): $(_trunc "$claim_result")" >&2
    return 0
  fi

  claimed=$(printf '%s' "$claim_result" | jq -r '.claimed // false' 2>/dev/null)
  if [ "$claimed" != "true" ]; then
    holder_session=$(printf '%s' "$claim_result" | jq -r '.current_holder.owner_client_session // empty' 2>/dev/null)
    if [ "$holder_session" = "$session_id" ]; then
      mcp_call "task_heartbeat" "$(jq -n --arg tid "session-presence:$session_id" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
    fi
  fi
  return 0
}

# ── Step 3: SF-1 claim (dev-team-cron-singleton) ─────────────────────────────
# Prints the raw tool-result JSON (or error text) on stdout.
# Return: 0 = claimed, 1 = not claimed (peer holds it), 2 = transport/malformed error.
_step_sf1_claim() {
  local session_id="$1" ts="$2"
  local payload_str args result rc claimed

  payload_str=$(jq -cn --arg site "SF-1" --arg tick "$ts" '{site:$site, tick:$tick}')
  args=$(jq -n --arg tid "dev-team-cron-singleton" --arg sess "$session_id" --arg payload "$payload_str" \
    '{task_id:$tid, task_kind:"sprint-task", owner_agent:"dev-team", owner_client_session:$sess, ttl_seconds:5400, payload:$payload}')

  result=$(mcp_call "task_claim" "$args" 2>&1); rc=$?
  if [ $rc -ne 0 ]; then
    printf '%s' "$result"
    return 2
  fi
  if [ "$(_is_json "$result")" != "true" ]; then
    printf '%s' "$result"
    return 2
  fi

  claimed=$(printf '%s' "$result" | jq -r '.claimed // false' 2>/dev/null)
  printf '%s' "$result"
  [ "$claimed" = "true" ] && return 0
  return 1
}

# ── SF-1 SKIP telegram (path a — peer holds it) ───────────────────────────────
_send_sf1_skip_telegram() {
  local sf1_result="$1"
  local holder_expires now_epoch expires_in_s msg
  holder_expires=$(printf '%s' "$sf1_result" | jq -r '.current_holder.expires_at // empty' 2>/dev/null)
  now_epoch=$(date +%s)
  if [[ "$holder_expires" =~ ^[0-9]+$ ]]; then
    expires_in_s=$(( holder_expires - now_epoch ))
  else
    expires_in_s="?"
  fi
  msg="[dev-team] cron SKIP — single-flight held by peer (TTL ~${expires_in_s}s)"
  mcp_call "send_telegram" "$(jq -n --arg ch "work" --arg msg "$msg" '{channel:$ch, message:$msg}')" >/dev/null 2>&1
}

# ── Step 4: fire-election claim (cron:dev-team:<tick>) ────────────────────────
# Prints the raw tool-result JSON (or error text) on stdout.
# Return: 0 = claimed or re-entrant-renewed, 1 = lost to peer, 2 = transport/malformed error.
_step_fire_election() {
  local session_id="$1" tick="$2"
  local payload_str args result rc claimed holder_session

  payload_str=$(jq -cn --arg site "fire-election" --arg tick "$tick" '{site:$site, tick:$tick}')
  args=$(jq -n --arg tid "cron:dev-team:$tick" --arg sess "$session_id" --arg payload "$payload_str" \
    '{task_id:$tid, task_kind:"sprint-task", owner_agent:"dev-team", owner_client_session:$sess, ttl_seconds:600, payload:$payload}')

  result=$(mcp_call "task_claim" "$args" 2>&1); rc=$?
  if [ $rc -ne 0 ]; then
    printf '%s' "$result"
    return 2
  fi
  if [ "$(_is_json "$result")" != "true" ]; then
    printf '%s' "$result"
    return 2
  fi

  claimed=$(printf '%s' "$result" | jq -r '.claimed // false' 2>/dev/null)
  if [ "$claimed" = "true" ]; then
    printf '%s' "$result"
    return 0
  fi

  holder_session=$(printf '%s' "$result" | jq -r '.current_holder.owner_client_session // empty' 2>/dev/null)
  if [ "$holder_session" = "$session_id" ]; then
    # Re-entrant: this session already holds this tick's key — renew + proceed.
    mcp_call "task_heartbeat" "$(jq -n --arg tid "cron:dev-team:$tick" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
    printf '%s' "$result"
    return 0
  fi

  printf '%s' "$result"
  return 1
}

run_preflight() {
  local session_id="${CLAUDE_CODE_SESSION_ID:-}"
  if [ -z "$session_id" ]; then
    _emit_verdict "ERROR" "unknown" "CLAUDE_CODE_SESSION_ID not set"
    return 1
  fi

  # ---- Step 1: compute TICK (largest of {07,37} <= current minute) ----
  local current_minute tick_bound tick ts
  current_minute=$(date -u +%M); current_minute=$((10#$current_minute))
  if [ "$current_minute" -ge 37 ]; then
    tick_bound="37"
  else
    tick_bound="07"
  fi
  tick=$(date -u +"%Y-%m-%dT%H:${tick_bound}Z")
  ts=$(date -u +%Y%m%dT%H%M%SZ)

  # ---- Step 2: presence (best-effort, never a gate) ----
  _step_presence "$session_id" "$ts"

  # ---- Step 3: SF-1 claim ----
  local sf1_out sf1_rc
  sf1_out=$(_step_sf1_claim "$session_id" "$ts"); sf1_rc=$?
  case "$sf1_rc" in
    2)
      _emit_verdict "ERROR" "$tick" \
        "SF-1 claim transport/malformed error: $(_trunc "$sf1_out") — lock state undefined, fallback repairs via re-claim"
      return 1
      ;;
    1)
      # SKIP path (a) — R7: never held SF-1, release NOTHING.
      _send_sf1_skip_telegram "$sf1_out"
      _emit_verdict "SKIP" "$tick" "SF-1 held by peer session — no lock acquired, nothing released"
      return 0
      ;;
  esac
  # sf1_rc == 0: SF-1 claimed — proceed to fire-time election.

  # ---- Step 4: fire-election claim ----
  local election_out election_rc
  election_out=$(_step_fire_election "$session_id" "$tick"); election_rc=$?
  case "$election_rc" in
    2)
      # SF-1 was just claimed above — release it before ERROR (see header note:
      # main.md's fallback SF-1 claim has no re-entrant self-hold check, so
      # leaving SF-1 held here would strand it for 90min once the fallback re-runs).
      mcp_call "task_release" "$(jq -n --arg tid "dev-team-cron-singleton" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
      _emit_verdict "ERROR" "$tick" \
        "fire-election claim transport/malformed error: $(_trunc "$election_out") — SF-1 released to avoid stranding lock, fallback repairs via re-claim"
      return 1
      ;;
    1)
      # SKIP path (b) — R7: SF-1 WAS held (claimed in Step 3), release it now.
      mcp_call "send_telegram" "$(jq -n --arg ch "work" --arg msg "[dev-team] fire-election SKIP tick=$tick (peer session leads)" '{channel:$ch, message:$msg}')" >/dev/null 2>&1
      mcp_call "task_release" "$(jq -n --arg tid "dev-team-cron-singleton" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
      _emit_verdict "SKIP" "$tick" "fire-election lost tick=$tick (peer session leads) — SF-1 released"
      return 0
      ;;
  esac
  # election_rc == 0: claimed (or re-entrant-renewed) — both locks HELD.

  _emit_verdict "RUN" "$tick" \
    "SF-1 (dev-team-cron-singleton, TTL=5400) + fire-election (cron:dev-team:$tick, TTL=600) locks held — continue main.md at gcc-preflight (GCC-PREFLIGHT read + HEAD.lock/worktree-GC); both locks stay held for the rest of the dispatch body, release-at-end unchanged"
  return 1
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_preflight
  exit $?
fi
