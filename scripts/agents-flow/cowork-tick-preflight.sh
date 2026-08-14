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
#   2. Presence claim-first (session-presence:<session>) — mirrors
#      docs/agents/cowork-team/flow/main.md Step 0b.1: claim, heartbeat only on
#      re-entry by this same session. NEVER gates — proceeds regardless of
#      claim/heartbeat outcome (ERROR is reserved for fire-election/transport
#      failures below, not presence). Also fires the cron-registration:cowork-team
#      renewal heartbeat (FIX-COWORK-CRONREG-MARKER-RENEWAL-HEARTBEAT-STRANDED-ON-
#      ERROR-ONLY-BRANCH) — the real per-tick site for FIX-CRON-REARM-CROSS-SESSION-
#      DEDUP §1.4, best-effort, on all five verdicts, before Step 2.5's early return.
#   2.5. Pre-election tombstone check (FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE
#      FR-1/FR-3) — _tick_already_ran() compares pressure-state.json's tick_id
#      (normalized second-precision -> minute-precision) against the nominal
#      tick; on match, TOMBSTONED verdict, ZERO task_claim calls are made on
#      cron:cowork:<tick> (suppressed before Step 3 ever runs)
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
#   new_signals, detail}. verdict ∈ SILENT|WORK|LOST_ELECTION|DEFER|ERROR|TOMBSTONED.
# Exit code: 0 = SILENT (no LLM read needed). 1 = WORK|LOST_ELECTION|DEFER|ERROR|
#   TOMBSTONED (LLM continues — JUMP-TO table in main.md).
#
# Lock semantics: SILENT releases the election lock (Step 8). WORK holds it —
#   telemetry.md Step 6 P3 release runs at the end of the full dispatch body.
#   LOST_ELECTION never held it. DEFER never claimed it (early return). ERROR
#   leaves lock state undefined — the LLM fallback repairs via re-claim.
#   TOMBSTONED never held it — same bucket as LOST_ELECTION/DEFER (Step 2.5
#   returns before Step 3's task_claim is ever called).
#
# Env overrides (test seams — AC-6 fault injection; defaults = real project
# paths / real script):
#   PREFLIGHT_ROOT          — project root (default: git-relative from this file)
#   MCP_JSON_PATH           — .mcp.json path (blind guard)
#   ORCH_STATE_PATH         — orch-state.json path (signal_queue count)
#   PRESSURE_STATE_PATH     — pressure-state.json path (Step 8 last-known values)
#   SYSTEM_MAP_PATH         — system-map.json path (Step 7 cowork-inbox recipient SSOT,
#                             I16/UC-CDC-P7 — default: $ROOT/docs/data/system-map.json)
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
# shellcheck source=./lib/tick-telemetry.sh
source "$SCRIPT_DIR/lib/tick-telemetry.sh"

MCP_JSON_PATH="${MCP_JSON_PATH:-$ROOT/.mcp.json}"
ORCH_STATE_PATH="${ORCH_STATE_PATH:-$ROOT/docs/data/orch/orch-state.json}"
PRESSURE_STATE_PATH="${PRESSURE_STATE_PATH:-$ROOT/docs/data/pressure-state.json}"
SYSTEM_MAP_PATH="${SYSTEM_MAP_PATH:-$ROOT/docs/data/system-map.json}"
SLOT_MATCHER_CMD="${SLOT_MATCHER_CMD:-node \"$ROOT/scripts/agents-flow/cowork-match-slots.js\"}"
BACKSTOP_HOURS="0 4 8 12 16 20"

_trunc() { printf '%s' "$1" | tr '\n' ' ' | cut -c1-200; }

# ── I16 (UC-CDC-P7): cowork-inbox signal-recipient SSOT ──
# Reads the agent ids carrying `cowork_signal_recipient:true` in system-map.json instead
# of a hardcoded literal — the prior hardcoded set {po, tran-ngoc-bau, unified-agent,
# alert-commander} silently diverged from `type=="cowork"` (which selects 9 agents, drops
# po + tran-ngoc-bau -- see docs/architecture-briefs/2026-07-12-ultracode-workflow-
# improvement-audit.md #cowork-dispatcher-cron-P7 Verifier note). Fail-safe: missing file,
# missing field, or malformed JSON all fall back to that SAME last-known-good literal set
# (never blocks the tick — R3-style conservative default, matching every other guard in
# this script).
_cowork_signal_recipients() {
  local recipients
  recipients=$(jq -c '[.project.agents[]? | select(.cowork_signal_recipient == true) | .id]' "$SYSTEM_MAP_PATH" 2>/dev/null)
  if [ -z "$recipients" ] || [ "$recipients" = "null" ] || [ "$recipients" = "[]" ]; then
    recipients='["po","tran-ngoc-bau","unified-agent","alert-commander"]'
  fi
  printf '%s' "$recipients"
}

_emit_verdict() {
  local verdict="$1" tick="$2" drift="$3" slots="$4" one_shots="$5" new_signals="$6" detail="$7"
  # UC-CDC-P7 Phase 2a: optional 8th arg — a JSON object merged into the verdict envelope.
  # Only the WORK verdict call site passes one (the slot-matcher's pressure_mode/downgraded/
  # suppressed_cadence/chef_mutex_applied/due_reasons/cadence_minutes, computed in-script by
  # cowork-match-slots.js at Step 6 below) so main.md § WORK continuation / telemetry.md
  # Step 6.1 can read them straight off $VERDICT_JSON instead of re-deriving. Every other
  # call site omits it -> defaults to "{}" -> no-op merge, envelope shape unchanged.
  # NOTE: NOT `${8:-{}}` — a literal `{}` inside a `${VAR:-default}` default-value clause
  # defeats bash's brace-matching (the FIRST `}` after the opening `{` closes the parameter
  # expansion early, leaving a stray literal `}` appended after it — verified: this silently
  # corrupted every non-WORK verdict's envelope until caught by T2/T-LOG2 WORK assertions).
  local extra="${8:-}"
  [ -z "$extra" ] && extra="{}"
  jq -n --arg verdict "$verdict" --arg tick "$tick" --argjson drift "${drift:-0}" \
        --argjson slots "${slots:-[]}" --argjson one_shots "${one_shots:-[]}" \
        --argjson new_signals "${new_signals:-0}" --arg detail "$detail" --argjson extra "$extra" \
    '{verdict:$verdict, tick:$tick, drift_min:$drift, slots:$slots, one_shots:$one_shots, new_signals:$new_signals, detail:$detail} + $extra'
}

# ── Tombstone predicate (FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE FR-1) ──
# Pure function: reads pressure-state.json, returns "true"/"false" on stdout.
# NEVER makes an MCP call, NEVER throws. Edge cases collapse to ONE safe branch
# ("false" -> proceed to normal election): missing file, missing/empty tick_id,
# non-ISO tick_id, non-matching tick_id are all "false" -- do not special-case them.
_tick_already_ran() {
  local pressure_state_path="$1" nominal_tick="$2" raw_tick_id norm_tick_id
  [ -f "$pressure_state_path" ] || { echo false; return; }
  raw_tick_id=$(jq -r '.tick_id // empty' "$pressure_state_path" 2>/dev/null)
  [ -z "$raw_tick_id" ] && { echo false; return; }
  # NFR-1 LANDMINE: tick_id is server-stamped SECOND-precision
  # ("YYYY-MM-DDTHH:MM:SSZ" -- emitPressureStateTool.ts always appends ":00").
  # nominal_tick (this script's own $tick, Step 1) is MINUTE-precision
  # ("YYYY-MM-DDTHH:MMZ"). A literal == on the raw strings is ALWAYS FALSE.
  # Strip the trailing ":SS" before comparing -- DO NOT SIMPLIFY THIS AWAY.
  if [[ "$raw_tick_id" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    norm_tick_id="${raw_tick_id%:*}Z"
    [ "$norm_tick_id" = "$nominal_tick" ] && { echo true; return; }
  fi
  echo false
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

  # ---- Step 2: presence claim-first — NEVER a gate (FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP) ----
  # Claim session-presence:<session> first. If already held by this same session,
  # heartbeat renews the TTL. Any other outcome (peer-held, transport error on
  # either call) is proceeded through unconditionally — presence must never
  # produce an ERROR verdict; that verdict is reserved for the fire-election /
  # transport failures handled in Step 3 onward.
  local presence_args presence_result presence_rc presence_claimed presence_holder
  presence_args=$(jq -n --arg tid "session-presence:$session_id" --arg sess "$session_id" \
    --arg host "$(hostname 2>/dev/null || echo unknown)" \
    '{task_id:$tid, task_kind:"session-presence", owner_agent:"cowork-dispatcher", owner_client_session:$sess, ttl_seconds:1800, payload:{agent_id:"cowork-dispatcher", host:$host}}')
  presence_result=$(mcp_call "task_claim" "$presence_args" 2>&1); presence_rc=$?
  if [ $presence_rc -eq 0 ]; then
    presence_claimed=$(printf '%s' "$presence_result" | jq -r '.claimed // false' 2>/dev/null)
    if [ "$presence_claimed" != "true" ]; then
      presence_holder=$(printf '%s' "$presence_result" | jq -r '.current_holder.owner_client_session // empty' 2>/dev/null)
      if [ "$presence_holder" = "$session_id" ]; then
        mcp_call "task_heartbeat" "$(jq -n --arg tid "session-presence:$session_id" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
      fi
      # peer-held: proceed anyway — presence is informational, never a gate.
    fi
  fi
  # Transport error on the claim itself falls through here too — presence never gates.

  # ---- FIX-COWORK-CRONREG-MARKER-RENEWAL-HEARTBEAT-STRANDED-ON-ERROR-ONLY-BRANCH ----
  # Renewal heartbeat for the cross-session cron-registration marker
  # (.claude/skills/cron-cowork-team/SKILL.md Step 1c). This is the REAL per-tick site —
  # FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.4 originally targeted docs/agents/cowork-team/
  # flow/main.md's Step 0a session-presence block on the (stale, already-false-when-written)
  # premise that it "already fires every */15 tick"; that block had already been superseded
  # by this script (TOKEN-ECONOMY-TICK-PREFLIGHT WU-1, 2026-07-13) and only
  # docs/agents/cowork-team/flow/preflight-error-fallback.md:57-63 (reached ONLY on ERROR
  # verdict) ever carried the call — so it never executed on the ~100% of ticks that resolve
  # SILENT/WORK/LOST_ELECTION/DEFER/TOMBSTONED. Placement here is load-bearing: it MUST run
  # on all five verdicts, so it sits after presence and BEFORE Step 2.5's early TOMBSTONED
  # return (the tightest of those five to prove pre-election). Best-effort, no-op if this
  # session doesn't own the marker (or it was never claimed yet) — ok=false is the normal,
  # expected outcome here and must NEVER gate, alter the verdict, or produce ERROR. See
  # docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md §1.4 (corrected
  # 2026-08-14) and preflight-error-fallback.md:57-63 (verbatim ERROR-fallback sibling call,
  # left in place — harmless/idempotent, last-writer-wins, per the brief's own note).
  mcp_call "task_heartbeat" "$(jq -n --arg tid "cron-registration:cowork-team" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1

  # ---- Step 2.5: pre-election tombstone check (FR-1/FR-3) ----
  # MUST run before Step 3 ever calls task_claim on cron:cowork:$tick -- a
  # tombstoned tick makes ZERO election-claim calls (AC-1 at the tool-call
  # level, not merely zero *successful* claims).
  if [ "$(_tick_already_ran "$PRESSURE_STATE_PATH" "$tick")" = "true" ]; then
    _emit_verdict "TOMBSTONED" "$tick" "$drift_min" "[]" "[]" "0" \
      "pressure-state.json tick_id already matches nominal tick $tick (server second-precision normalized to minute precision) -- a prior session already completed this exact tick; suppressed before any cron:cowork:$tick claim attempt, see docs/agents/cowork-team/flow/main.md JUMP-TO table"
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

  # UC-CDC-P7 Phase 2a: pull through the per-tick observability fields cowork-match-slots.js
  # now computes in-script (Step 4.5 freshness-downgrade + Step 4.5c CHEF mutex, previously
  # LLM-narrated inline in pressure-cadence.md) so the WORK verdict below can carry them.
  local matcher_meta
  matcher_meta=$(printf '%s' "$slot_result" | jq -c '{pressure_mode: (.pressure_mode // "legacy"), downgraded: (.downgraded // []), suppressed_cadence: (.suppressed_cadence // []), chef_mutex_applied: (.chef_mutex_applied // false), due_reasons: (.due_reasons // {}), cadence_minutes: (.cadence_minutes // {})}' 2>/dev/null)
  if [ -z "$matcher_meta" ]; then
    matcher_meta='{"pressure_mode":"legacy","downgraded":[],"suppressed_cadence":[],"chef_mutex_applied":false,"due_reasons":{},"cadence_minutes":{}}'
  fi

  # ---- Step 7: SILENT gate ----
  local signal_count slots_empty one_shots_empty recipients_json
  recipients_json=$(_cowork_signal_recipients)
  signal_count=$(jq --argjson recipients "$recipients_json" '[.signal_queue.rows[]? | select(.status=="NEW" and (.to as $t | $recipients | index($t) != null))] | length' "$ORCH_STATE_PATH" 2>/dev/null)
  [[ "$signal_count" =~ ^[0-9]+$ ]] || signal_count=0
  slots_empty=$(printf '%s' "$slots" | jq 'length == 0')
  one_shots_empty=$(printf '%s' "$one_shots" | jq 'length == 0')

  if [ "$slots_empty" = "true" ] && [ "$one_shots_empty" = "true" ] && [ "$signal_count" -eq 0 ]; then
    _step8_silent_release "$tick" "$drift_min" "$session_id"
    return $?
  fi

  _emit_verdict "WORK" "$tick" "$drift_min" "$slots" "$one_shots" "$signal_count" \
    "election lock held — continue at main.md Step 4.2 (signal drain, slot fan-out, spawn, emit, release)" \
    "$matcher_meta"
  return 1
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
# TICK-WU-1: tt_capture_and_log wraps run_preflight here — the trailer is the
# pre-existing choke point every verdict path already converges on with a real
# $? available (architect ratification, sprint-TICK-PREFLIGHT-USAGE-
# INSTRUMENTATION-architect.md). Purely additive telemetry: stdout/exit code/
# lock behavior are unchanged (AC-3/AC-6/AC-7) — see scripts/agents-flow/
# lib/tick-telemetry.sh for the capture/reprint/log contract.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  tt_capture_and_log "cowork-tick-preflight.sh" run_preflight
  exit $?
fi
