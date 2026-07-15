#!/usr/bin/env bash
# scripts/agents-flow/cowork-tick-preflight.test.sh
#
# Regression test for TOKEN-ECONOMY-TICK-PREFLIGHT WU-1 — exercises the
# SILENT / WORK / ERROR / LOST_ELECTION verdict paths of
# cowork-tick-preflight.sh via a stubbed mcp_call (function-override after
# sourcing) so NO real side-effecting MCP calls are made (claim_due_scheduled_
# tasks / emit_pressure_state / task_claim are never hit for real — per
# handoff testing guidance). Follows the isolated-tmp-fixture pattern of
# scripts/agents-flow/context-bloat-backstop.test.sh.
#
# mcp-call.sh's real SSE-transport parsing is proven separately via a live
# read-only call (task_list_held) documented in the decision journal — not
# re-asserted here (would require a live server + non-deterministic state).
#
# Run:
#   bash scripts/agents-flow/cowork-tick-preflight.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: TOKEN-ECONOMY-TICK-PREFLIGHT-WU-1
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREFLIGHT_SH="$SCRIPT_DIR/cowork-tick-preflight.sh"

if [ ! -f "$PREFLIGHT_SH" ]; then
  echo "ERROR: preflight script not found at $PREFLIGHT_SH" >&2
  exit 1
fi

# ── Isolated test fixture root (never the real project data) ─────────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/cowork-preflight-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

mkdir -p "$TMPDIR_TEST/docs/data/orch"
echo '{"mcpServers":{"gateway":{}}}' > "$TMPDIR_TEST/mcp-normal.json"
echo '{"mcpServers":{}}' > "$TMPDIR_TEST/mcp-blind.json"
echo '{"signal_queue":{"rows":[]}}' > "$TMPDIR_TEST/orch-no-signals.json"
cat > "$TMPDIR_TEST/orch-one-signal.json" <<'JSON'
{"signal_queue":{"rows":[{"id":"x1","status":"NEW","to":"po","from":"test"}]}}
JSON

FAKE_SESSION="test-session-fixture-not-real"
export CLAUDE_CODE_SESSION_ID="$FAKE_SESSION"
export PREFLIGHT_ROOT="$TMPDIR_TEST"
export PRESSURE_STATE_PATH="$TMPDIR_TEST/does-not-exist-pressure-state.json"

PASS=0
FAIL=0

check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

# ── Source the script under test (guard prevents auto-exec: $0 != BASH_SOURCE) ──
# shellcheck source=./cowork-tick-preflight.sh
source "$PREFLIGHT_SH"

# ── Stub mcp_call — overrides the real function pulled in by the source above ──
# Dispatch controlled by $STUB_PRESENCE_CLAIM / $STUB_PRESENCE_HB / $STUB_ELECTION /
# $STUB_CLAIM_DUE / $STUB_EMIT (set per-scenario below). Every call is logged as
# "<tool>|<task_kind>|<task_id>" to CALL_LOG_FILE (NOT a plain var — run_preflight
# is invoked via `$(...)` command substitution, a subshell, so a plain var write
# would not propagate back to this shell) so tests can assert which lock/kind a
# call targeted — e.g. distinguishing the session-presence claim from the
# cron:cowork election claim (both go through the same "task_claim" tool name).
CALL_LOG_FILE="$TMPDIR_TEST/call-log.txt"
mcp_call() {
  local tool="$1" args="${2:-}"
  local log_kind log_tid
  log_kind=$(printf '%s' "$args" | jq -r '.task_kind // empty' 2>/dev/null)
  log_tid=$(printf '%s' "$args" | jq -r '.task_id // empty' 2>/dev/null)
  echo "${tool}|${log_kind}|${log_tid}" >> "$CALL_LOG_FILE"
  case "$tool" in
    task_heartbeat)
      if [[ "$args" == *"cron:cowork:"* ]]; then
        echo '{"ok":true,"expires_at":9999999999}'; return 0
      fi
      case "${STUB_PRESENCE_HB:-ok}" in
        ok) echo '{"ok":true,"expires_at":9999999999}'; return 0 ;;
        error) echo "simulated presence heartbeat transport error" >&2; return 1 ;;
      esac
      ;;
    task_claim)
      if [[ "$args" == *"session-presence:"* ]]; then
        case "${STUB_PRESENCE_CLAIM:-claimed}" in
          claimed) echo '{"claimed":true}'; return 0 ;;
          reentrant_self) echo '{"claimed":false,"current_holder":{"owner_client_session":"'"$FAKE_SESSION"'","owner_agent":"cowork-dispatcher"}}'; return 0 ;;
          reentrant_peer) echo '{"claimed":false,"current_holder":{"owner_client_session":"peer-session-xyz","owner_agent":"cowork-dispatcher"}}'; return 0 ;;
          error) echo "simulated presence claim transport error" >&2; return 1 ;;
        esac
      else
        case "${STUB_ELECTION:-won}" in
          won) echo '{"claimed":true}'; return 0 ;;
          lost_peer) echo '{"claimed":false,"current_holder":{"owner_client_session":"peer-session-xyz","owner_agent":"cowork-dispatcher"}}'; return 0 ;;
          error) echo "simulated election transport error" >&2; return 1 ;;
        esac
      fi
      ;;
    claim_due_scheduled_tasks)
      case "${STUB_CLAIM_DUE:-empty}" in
        empty) echo '{"tasks":[],"now_epoch":1234567890}'; return 0 ;;
        error) echo "simulated claim_due transport error" >&2; return 1 ;;
      esac
      ;;
    emit_pressure_state)
      case "${STUB_EMIT:-ok}" in
        ok) echo '{"success":true,"emitted_at":"2026-01-01T00:00:00Z"}'; return 0 ;;
      esac
      ;;
    task_release) echo '{"ok":true,"released":1}'; return 0 ;;
    send_telegram) echo '{"ok":true}'; return 0 ;;
    *) echo "unstubbed tool in test: $tool" >&2; return 1 ;;
  esac
}

run_case() {
  # Resets scenario knobs to defaults before each test.
  STUB_PRESENCE_CLAIM="claimed"; STUB_PRESENCE_HB="ok"
  STUB_ELECTION="won"; STUB_CLAIM_DUE="empty"; STUB_EMIT="ok"
  : > "$CALL_LOG_FILE"
}

log_has() { grep -q "^$1|" "$CALL_LOG_FILE" 2>/dev/null && echo true || echo false; }
log_count() { grep -c "^$1|" "$CALL_LOG_FILE" 2>/dev/null || echo 0; }
log_has_line() { grep -qF "$1" "$CALL_LOG_FILE" 2>/dev/null && echo true || echo false; }

# ── T1: SILENT path — no slots, no one-shots, no NEW signals ─────────────────
run_case
export MCP_JSON_PATH="$TMPDIR_TEST/mcp-normal.json"
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-no-signals.json"
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":3}"'
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T1 SILENT verdict" "$([ "$VERDICT" = "SILENT" ] && echo true || echo false)"
check "T1 SILENT exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T1 SILENT releases election lock" "$(log_has task_release)"

# ── T2: WORK path — one due slot ──────────────────────────────────────────────
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"news-scout-market\",\"agent\":\"news-scout\",\"flow_path\":\"docs/agents/news-scout/flow/main.md\",\"cron\":\"*/15 * * * *\"}],\"drift_min\":2}"'
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
SLOT_COUNT=$(printf '%s' "$OUT" | jq '.slots | length')
check "T2 WORK verdict" "$([ "$VERDICT" = "WORK" ] && echo true || echo false)"
check "T2 WORK exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T2 WORK carries full slot object" "$([ "$SLOT_COUNT" -eq 1 ] && echo true || echo false)"
check "T2 WORK does NOT release election lock" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"

# ── T2b: WORK path via NEW cowork-addressed signal_queue row (slots/one_shots empty) ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":1}"'
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-one-signal.json"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
NEW_SIGNALS=$(printf '%s' "$OUT" | jq '.new_signals')
check "T2b WORK verdict via signal_queue" "$([ "$VERDICT" = "WORK" ] && echo true || echo false)"
check "T2b new_signals=1" "$([ "$NEW_SIGNALS" -eq 1 ] && echo true || echo false)"
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-no-signals.json"

# ── T3: presence NEVER gates — rewritten for FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP.
#     OLD behaviour (removed): a presence-tool transport failure emitted ERROR
#     (gated the tick). NEW contract: same fault injection now proceeds through
#     to the real verdict — presence is claim-first and is never a gate; ERROR
#     is reserved for fire-election/transport failures elsewhere in the flow ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
STUB_PRESENCE_CLAIM="error"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T3 presence claim transport error -> verdict SILENT, NOT ERROR (was gating)" "$([ "$VERDICT" = "SILENT" ] && echo true || echo false)"
check "T3 presence claim transport error -> exit=0 (SILENT)" "$([ "$RC" -eq 0 ] && echo true || echo false)"

# ── T3-presence-fresh: fresh session (no prior session-presence row) — claim
#     succeeds outright -> verdict SILENT/WORK, NEVER ERROR. This is the exact
#     bug scenario from docs/handoffs/2026-07-15-cowork-preflight-presence-claim-gap.md ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
STUB_PRESENCE_CLAIM="claimed"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T3-presence-fresh fresh-session claim -> verdict SILENT (not ERROR)" "$([ "$VERDICT" = "SILENT" ] && echo true || echo false)"
check "T3-presence-fresh presence claim call made (task_kind=session-presence)" "$([ "$(log_count "task_claim|session-presence")" -eq 1 ] && echo true || echo false)"
check "T3-presence-fresh no cowork-slot lock leak (exactly 1 cowork-slot claim = election only)" "$([ "$(log_count "task_claim|cowork-slot")" -eq 1 ] && echo true || echo false)"

# ── T3-presence-reentrant: same session already holds session-presence — claim
#     returns claimed:false + current_holder == this session -> heartbeat renews
#     TTL, clean pass (never ERROR), and no cowork-slot lock leak from presence ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
STUB_PRESENCE_CLAIM="reentrant_self"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T3-presence-reentrant re-entrant same-session -> verdict SILENT (not ERROR)" "$([ "$VERDICT" = "SILENT" ] && echo true || echo false)"
check "T3-presence-reentrant heartbeat renews TTL (session-presence:$FAKE_SESSION)" "$(log_has_line "task_heartbeat||session-presence:$FAKE_SESSION")"
check "T3-presence-reentrant no cowork-slot lock leak from presence" "$([ "$(log_count "task_claim|cowork-slot")" -eq 1 ] && echo true || echo false)"

# ── T3-presence-peer: a peer session holds session-presence — still never gates ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
STUB_PRESENCE_CLAIM="reentrant_peer"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T3-presence-peer peer-held presence -> verdict SILENT (not ERROR)" "$([ "$VERDICT" = "SILENT" ] && echo true || echo false)"
check "T3-presence-peer no heartbeat sent for a peer-held lock (not this session)" "$([ "$(log_has_line "task_heartbeat||session-presence:$FAKE_SESSION")" = "false" ] && echo true || echo false)"

# ── T3b: ERROR path — blind guard (mcpServers empty) ──────────────────────────
run_case
export MCP_JSON_PATH="$TMPDIR_TEST/mcp-blind.json"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T3b ERROR verdict (blind guard)" "$([ "$VERDICT" = "ERROR" ] && echo true || echo false)"
export MCP_JSON_PATH="$TMPDIR_TEST/mcp-normal.json"

# ── T3c: ERROR path — slot matcher script failure ─────────────────────────────
run_case
export SLOT_MATCHER_CMD='false'
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T3c ERROR verdict (slot matcher failure)" "$([ "$VERDICT" = "ERROR" ] && echo true || echo false)"

# ── T4: LOST_ELECTION — peer session holds the tick key ──────────────────────
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
STUB_ELECTION="lost_peer"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T4 LOST_ELECTION verdict" "$([ "$VERDICT" = "LOST_ELECTION" ] && echo true || echo false)"
check "T4 LOST_ELECTION exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T4 LOST_ELECTION sends WORK telegram (script-initiated)" "$(log_has send_telegram)"
check "T4 LOST_ELECTION does not release (never held)" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"

# ── T5: R3 safe default — SILENT with missing pressure-state.json ────────────
run_case
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T5 SILENT with missing pressure-state.json (R3 safe default path taken)" "$([ "$VERDICT" = "SILENT" ] && echo true || echo false)"
check "T5 SILENT exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
