#!/usr/bin/env bash
# scripts/agents-flow/cowork-tick-preflight.sh
#
# TOKEN-ECONOMY-TICK-PREFLIGHT WU-1 — deterministic cowork-team cron-tick
# preflight. Replaces LLM-narrated Steps 0a-4b of docs/agents/cowork-team/
# flow/main.md with one bash+jq+curl call on the common SILENT/WORK path.
# Spec: docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT-WU-1.md
#
# Steps 1-8 (per handoff, reconciled against live schema — see decision journal
# sprint-TOKEN-ECONOMY-TICK-PREFLIGHT-developer.md for deviations from the
# brief's pseudocode, all in the "brownfield findings beat brief prose" sense):
#   1. Compute TICK (floor UTC minute to 15-min boundary)
#   2. Presence heartbeat (session-presence:<session>) — ERROR on ok=false
#   3. Fire-time election claim (cron:cowork:<tick>, P3) — AF-1 backstop-defer
#      gate on transport error; LOST_ELECTION when a peer session holds it
#   4. claim_due_scheduled_tasks sweep — R2: verdict carries FULL task objects
#   5. Blind guard (.mcpServers count) — ERROR (never silently degrades) so
#      the LLM fallback can run the real SESSION_BLIND continue-without-spawn
#      logic in blind-guard.md
#   6. Slot matcher (cowork-match-slots.js, unchanged, invoked as-is)
#   7. SILENT gate — slots empty AND one_shots empty AND signal_queue NEW
#      cowork-addressed rows == 0 (R4: READ-ONLY count; drain stays in main.md)
#   8. On SILENT: emit_pressure_state with last-known values (R3: "unknown"
#      safe default) then release the election lock
#
# Verdict JSON (one line, stdout): {verdict, tick, drift_min, slots, one_shots,
#   new_signals, detail}. verdict ∈ SILENT|WORK|LOST_ELECTION|DEFER|ERROR.
# Exit code: 0 = SILENT (no LLM read needed). 1 = WORK|LOST_ELECTION|DEFER|ERROR
#   (LLM continues — JUMP-TO table in main.md).
#
# Lock semantics: SILENT releases the election lock (Step 8). WORK holds it —
#   telemetry.md Step 6 P3 release runs at the end of the full dispatch body.
#   LOST_ELECTION never held it. DEFER never claimed it (early return). ERROR
#   leaves lock state undefined — the LLM fallback repairs via re-claim.
#
# Env overrides (test seams — AC-6 fault injection; defaults = real project
# paths / real script):
#   PREFLIGHT_ROOT          — project root (default: git-relative from this file)
#   MCP_JSON_PATH           — .mcp.json path (blind guard)
#   ORCH_STATE_PATH         — orch-state.json path (signal_queue count)
#   PRESSURE_STATE_PATH     — pressure-state.json path (Step 8 last-known values)
#   SLOT_MATCHER_CMD        — command to run for Step 6 (default: node cowork-match-slots.js)
#   MCP_HTTP_URL, MCP_CALL_TIMEOUT_S — see mcp-call.sh
#
# Requires: CLAUDE_CODE_SESSION_ID in the environment (coordination parameter,
# never echoed/logged by this script beyond its use as a bound task_claim arg).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT="${PREFLIGHT_ROOT:-$DEFAULT_ROOT}"

# shellcheck source=./mcp-call.sh
source "$SCRIPT_DIR/mcp-call.sh"

MCP_JSON_PATH="${MCP_JSON_PATH:-$ROOT/.mcp.json}"
ORCH_STATE_PATH="${ORCH_STATE_PATH:-$ROOT/docs/data/orch/orch-state.json}"
PRESSURE_STATE_PATH="${PRESSURE_STATE_PATH:-$ROOT/docs/data/pressure-state.json}"
SLOT_MATCHER_CMD="${SLOT_MATCHER_CMD:-node \"$ROOT/scripts/agents-flow/cowork-match-slots.js\"}"
BACKSTOP_HOURS="0 4 8 12 16 20"

_trunc() { printf '%s' "$1" | tr '\n' ' ' | cut -c1-200; }

_emit_verdict() {
  local verdict="$1" tick="$2" drift="$3" slots="$4" one_shots="$5" new_signals="$6" detail="$7"
  jq -n --arg verdict "$verdict" --arg tick "$tick" --argjson drift "${drift:-0}" \
        --argjson slots "${slots:-[]}" --argjson one_shots "${one_shots:-[]}" \
        --argjson new_signals "${new_signals:-0}" --arg detail "$detail" \
    '{verdict:$verdict, tick:$tick, drift_min:$drift, slots:$slots, one_shots:$one_shots, new_signals:$new_signals, detail:$detail}'
}

# ── Step 8 (SILENT only): emit last-known pressure state, release election lock ──
_step8_silent_release() {
  local tick="$1" drift_min="$2" session_id="$3"
  local calendar_status="" last_regime="" last_vol="" fire_time tick_id emit_args pressure_result pressure_rc

  if [ -f "$PRESSURE_STATE_PATH" ]; then
    calendar_status=$(jq -r '.calendar_status // empty' "$PRESSURE_STATE_PATH" 2>/dev/null)
    last_regime=$(jq -r '.last_regime // empty' "$PRESSURE_STATE_PATH" 2>/dev/null)
    last_vol=$(jq -r '.last_volatility_level // empty' "$PRESSURE_STATE_PATH" 2>/dev/null)
  fi
  # R3: safe default "unknown" — missing file, missing field, or malformed JSON.
  [ -z "$calendar_status" ] && calendar_status="unknown"
  [ -z "$last_regime" ] && last_regime="unknown"
  [ -z "$last_vol" ] && last_vol="unknown"

  fire_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  tick_id="${tick%Z}:00Z"

  emit_args=$(jq -n --arg cal "$calendar_status" --arg tick_id "$tick_id" --arg fire "$fire_time" \
    --arg regime "$last_regime" --arg vol "$last_vol" \
    '{calendar_status:$cal, tick_id:$tick_id, fire_time:$fire, pressure_mode:"unknown", last_regime:$regime, last_volatility_level:$vol}')

  pressure_result=$(mcp_call "emit_pressure_state" "$emit_args" 2>&1); pressure_rc=$?
  if [ $pressure_rc -ne 0 ]; then
    _emit_verdict "ERROR" "$tick" "$drift_min" "[]" "[]" "0" \
      "emit_pressure_state transport/tool error: $(_trunc "$pressure_result") — election lock state undefined, fallback repairs via re-claim"
    return 1
  fi
  # emit_pressure_state never throws — success:true or success:false (partial)
  # both proceed to SILENT per R3/AC-2 (only transport/isError above is ERROR).

  mcp_call "task_release" "$(jq -n --arg tid "cron:cowork:$tick" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
  # ok=false acceptable (TTL=600s expired) — best-effort; SILENT does not depend on it.

  _emit_verdict "SILENT" "$tick" "$drift_min" "[]" "[]" "0" \
    "no slots due, no one-shots claimed, no NEW cowork-addressed signal_queue rows — pressure state emitted, election lock released"
  return 0
}

run_preflight() {
  local session_id="${CLAUDE_CODE_SESSION_ID:-}"
  if [ -z "$session_id" ]; then
    _emit_verdict "ERROR" "unknown" "0" "[]" "[]" "0" "CLAUDE_CODE_SESSION_ID not set"
    return 1
  fi

  # ---- Step 1: compute TICK (floor UTC minute to 15-min boundary) ----
  local current_minute boundary_minute tick actual_minute drift_min
  current_minute=$(date -u +%M); current_minute=$((10#$current_minute))
  boundary_minute=$(( current_minute / 15 * 15 ))
  tick=$(date -u +"%Y-%m-%dT%H:$(printf '%02d' "$boundary_minute")Z")
  actual_minute=$current_minute
  drift_min=$(( actual_minute - boundary_minute ))

  # ---- Step 2: presence heartbeat ----
  local presence_args presence_result presence_rc presence_ok
  presence_args=$(jq -n --arg tid "session-presence:$session_id" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')
  presence_result=$(mcp_call "task_heartbeat" "$presence_args" 2>&1); presence_rc=$?
  if [ $presence_rc -ne 0 ]; then
    _emit_verdict "ERROR" "$tick" "$drift_min" "[]" "[]" "0" "presence heartbeat transport error: $(_trunc "$presence_result")"
    return 1
  fi
  presence_ok=$(printf '%s' "$presence_result" | jq -r '.ok // false' 2>/dev/null)
  if [ "$presence_ok" != "true" ]; then
    _emit_verdict "ERROR" "$tick" "$drift_min" "[]" "[]" "0" "presence heartbeat ok=false (lock not held or expired) — fallback runs full presence claim"
    return 1
  fi

  # ---- Step 3: fire-time election claim (P3 — cron:cowork:<tick>) ----
  local payload_str election_args election_result election_rc claimed holder_session
  payload_str=$(jq -cn --arg site "fire-election" --arg tick "$tick" '{site:$site, tick:$tick}')
  election_args=$(jq -n --arg tid "cron:cowork:$tick" --arg sess "$session_id" --arg payload "$payload_str" \
    '{task_id:$tid, task_kind:"cowork-slot", owner_agent:"cowork-dispatcher", owner_client_session:$sess, ttl_seconds:600, payload:$payload}')
  election_result=$(mcp_call "task_claim" "$election_args" 2>&1); election_rc=$?

  if [ $election_rc -ne 0 ]; then
    # AF-1 backstop-window defer gate — lock state UNREADABLE, do not treat as lock-free.
    local current_hour in_backstop h
    current_hour=$(date -u +%H); current_hour=$((10#$current_hour))
    in_backstop=false
    for h in $BACKSTOP_HOURS; do
      [ "$current_hour" -eq "$h" ] && in_backstop=true && break
    done
    if [ "$in_backstop" = true ] && [ "$actual_minute" -lt 15 ]; then
      _emit_verdict "DEFER" "$tick" "$drift_min" "[]" "[]" "0" \
        "fire-election UNREADABLE within backstop window (hour=$current_hour minute=$actual_minute) — deferring one tick"
      return 1
    fi
    _emit_verdict "ERROR" "$tick" "$drift_min" "[]" "[]" "0" "fire-election claim transport error: $(_trunc "$election_result")"
    return 1
  fi

  claimed=$(printf '%s' "$election_result" | jq -r '.claimed // false' 2>/dev/null)
  if [ "$claimed" != "true" ]; then
    holder_session=$(printf '%s' "$election_result" | jq -r '.current_holder.owner_client_session // empty' 2>/dev/null)
    if [ "$holder_session" = "$session_id" ]; then
      # Re-entrant: this session already holds the tick key — renew + proceed.
      mcp_call "task_heartbeat" "$(jq -n --arg tid "cron:cowork:$tick" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
    else
      mcp_call "send_telegram" "$(jq -n --arg ch "work" --arg msg "[cowork] fire-election SKIP tick=$tick (peer session leads)" '{channel:$ch, message:$msg}')" >/dev/null 2>&1
      _emit_verdict "LOST_ELECTION" "$tick" "$drift_min" "[]" "[]" "0" "peer session holds cron:cowork:$tick"
      return 1
    fi
  fi
  # claimed == true (or re-entrant renewed) → this session now holds the election lock.

  # ---- Step 4: claim due one-shot scheduled tasks (atomic pending→firing) ----
  local claim_args claim_result claim_rc one_shots
  claim_args=$(jq -n --arg st "$tick" '{sweep_tick:$st}')
  claim_result=$(mcp_call "claim_due_scheduled_tasks" "$claim_args" 2>&1); claim_rc=$?
  if [ $claim_rc -ne 0 ]; then
    _emit_verdict "ERROR" "$tick" "$drift_min" "[]" "[]" "0" \
      "claim_due_scheduled_tasks transport error: $(_trunc "$claim_result") — election lock state undefined, fallback repairs via re-claim"
    return 1
  fi
  # R2: pass through FULL claimed task objects — re-calling this tool on the
  # WORK-continuation path would find nothing left (already flipped to firing).
  one_shots=$(printf '%s' "$claim_result" | jq -c '.tasks // []' 2>/dev/null)
  [ -z "$one_shots" ] && one_shots="[]"

  # ---- Step 5: blind guard (gateway-free) ----
  local blind_count
  blind_count=$(jq '.mcpServers | length' "$MCP_JSON_PATH" 2>/dev/null)
  if ! [[ "$blind_count" =~ ^[0-9]+$ ]] || [ "$blind_count" -lt 1 ]; then
    _emit_verdict "ERROR" "$tick" "$drift_min" "[]" "[]" "0" \
      "blind guard failed: $MCP_JSON_PATH missing/empty/unreadable (mcpServers length=$blind_count) — fallback runs real SESSION_BLIND continue-without-spawn logic"
    return 1
  fi

  # ---- Step 6: slot matcher (cowork-match-slots.js — unchanged, invoked as-is) ----
  # stdout (JSON contract) and stderr (diagnostics: cadence suppress/skip logs) are
  # captured separately — folding stderr into the parsed buffer (old: `2>&1`) let an
  # in-tick cadence-skip diagnostic corrupt the jq parse below and produce a false
  # ERROR verdict on every cadence-skip tick (see FIX-COWORK-PREFLIGHT-DIAGNOSTIC-
  # STDOUT-POLLUTION). The exit!=0 error path still surfaces matcher stderr in detail.
  local slot_result slot_rc slots matcher_drift slot_err
  slot_err=$(mktemp)
  slot_result=$(eval "$SLOT_MATCHER_CMD" 2>"$slot_err"); slot_rc=$?
  if [ $slot_rc -ne 0 ]; then
    _emit_verdict "ERROR" "$tick" "$drift_min" "[]" "[]" "0" "slot matcher failed (exit=$slot_rc): $(_trunc "$(cat "$slot_err")")"
    rm -f "$slot_err"
    return 1
  fi
  rm -f "$slot_err"
  slots=$(printf '%s' "$slot_result" | jq -c '.slots // empty' 2>/dev/null)
  if [ -z "$slots" ]; then
    _emit_verdict "ERROR" "$tick" "$drift_min" "[]" "[]" "0" "slot matcher returned non-JSON output: $(_trunc "$slot_result")"
    return 1
  fi
  matcher_drift=$(printf '%s' "$slot_result" | jq -r '.drift_min // empty' 2>/dev/null)
  if [[ "$matcher_drift" =~ ^-?[0-9]+$ ]]; then
    drift_min=$matcher_drift
    if [ "$drift_min" -gt 10 ]; then
      mcp_call "send_telegram" "$(jq -n --arg ch "work" --arg msg "[cowork-team] WARN drift_min=${drift_min} exceeds 10min threshold; slot lock safety margin narrowing. Review system load. Safe limit: drift_min < 15." '{channel:$ch, message:$msg}')" >/dev/null 2>&1
    fi
  fi

  # ---- Step 7: SILENT gate ----
  local signal_count slots_empty one_shots_empty
  signal_count=$(jq '[.signal_queue.rows[]? | select(.status=="NEW" and (.to as $t | ["po","tran-ngoc-bau","unified-agent","alert-commander"] | index($t) != null))] | length' "$ORCH_STATE_PATH" 2>/dev/null)
  [[ "$signal_count" =~ ^[0-9]+$ ]] || signal_count=0
  slots_empty=$(printf '%s' "$slots" | jq 'length == 0')
  one_shots_empty=$(printf '%s' "$one_shots" | jq 'length == 0')

  if [ "$slots_empty" = "true" ] && [ "$one_shots_empty" = "true" ] && [ "$signal_count" -eq 0 ]; then
    _step8_silent_release "$tick" "$drift_min" "$session_id"
    return $?
  fi

  _emit_verdict "WORK" "$tick" "$drift_min" "$slots" "$one_shots" "$signal_count" \
    "election lock held — continue at main.md Step 4.2 (signal drain, slot fan-out, spawn, emit, release)"
  return 1
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_preflight
  exit $?
fi
