#!/usr/bin/env bash
# scripts/agents-flow/dev-team-tick-preflight.test.sh
#
# Regression test for TOKEN-ECONOMY-TICK-PREFLIGHT WU-2 — exercises the
# RUN / SKIP(a) / SKIP(b) / ERROR verdict paths of dev-team-tick-preflight.sh
# via a stubbed mcp_call (function-override after sourcing), so NO real
# side-effecting MCP calls are made. HARD CONSTRAINT (per dispatch prompt):
# dev-team-cron-singleton and cron:dev-team:* are PRODUCTION mutexes — this
# test NEVER calls the real mcp-server, only the local stub below.
#
# Follows WU-1's isolated-fixture / function-override pattern
# (scripts/agents-flow/cowork-tick-preflight.test.sh).
#
# Run:
#   bash scripts/agents-flow/dev-team-tick-preflight.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: TOKEN-ECONOMY-TICK-PREFLIGHT-WU-2
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREFLIGHT_SH="$SCRIPT_DIR/dev-team-tick-preflight.sh"

if [ ! -f "$PREFLIGHT_SH" ]; then
  echo "ERROR: preflight script not found at $PREFLIGHT_SH" >&2
  exit 1
fi

FAKE_SESSION="test-session-fixture-not-real"
export CLAUDE_CODE_SESSION_ID="$FAKE_SESSION"

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
# shellcheck source=./dev-team-tick-preflight.sh
source "$PREFLIGHT_SH"

# ── Isolated tmp fixture (call log only — this script touches no local files) ──
TMPDIR_TEST=$(mktemp -d /private/tmp/dev-team-preflight-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT
CALL_LOG_FILE="$TMPDIR_TEST/call-log.txt"

# ── Step 5 idle-check fixtures (P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT) ────────────
# NEVER let the idle-check read the LIVE repo's docs/signals/ or orch-state.json
# — that would make T1/T2/T9/T10/T11 (all expect verdict=RUN) flaky/coupled to
# live repo state. run_case() below pins SIGNALS_DIR/SIGNALS_DB_PATH/
# ORCH_STATE_PATH to the "non-idle" fixtures for every scenario by default;
# only the dedicated idle tests (T13+) override them.
mkdir -p "$TMPDIR_TEST/signals-nonempty" "$TMPDIR_TEST/signals-empty"
echo '{}' > "$TMPDIR_TEST/signals-nonempty/placeholder-signal.json"
echo '{"task_board":{"active_sprints":[{"id":"placeholder-sprint"}]},"signal_queue":{"rows":[]}}' > "$TMPDIR_TEST/orch-not-idle.json"
echo '{"task_board":{"active_sprints":[]},"signal_queue":{"rows":[]}}' > "$TMPDIR_TEST/orch-idle.json"
echo '{"task_board":{"active_sprints":[]},"signal_queue":{"rows":[{"id":"s1","status":"NEW","to":"po"}]}}' > "$TMPDIR_TEST/orch-new-signal-only.json"
# Stale signals.db fixture — mtime forced 48h in the past (comfortably > 24h threshold).
touch "$TMPDIR_TEST/signals-stale.db"
touch -t "$(date -v-2d +%Y%m%d%H%M 2>/dev/null || date -d '2 days ago' +%Y%m%d%H%M)" "$TMPDIR_TEST/signals-stale.db" 2>/dev/null

# ── Stub mcp_call — overrides the real function pulled in by the source above ──
# Dispatch controlled by $STUB_PRESENCE / $STUB_SF1 / $STUB_ELECTION (set per
# scenario below). Every call is appended to CALL_LOG_FILE (NOT a plain var —
# run_preflight is invoked via `$(...)` command substitution, a subshell, so a
# plain var write would not propagate back to this shell).
mcp_call() {
  local tool="$1" args="${2:-}"
  echo "$tool" >> "$CALL_LOG_FILE"
  case "$tool" in
    task_claim)
      if [[ "$args" == *"session-presence:"* ]]; then
        case "${STUB_PRESENCE:-ok}" in
          ok) echo '{"claimed":true}'; return 0 ;;
          not_held_self) echo '{"claimed":false,"current_holder":{"owner_client_session":"'"$FAKE_SESSION"'"}}'; return 0 ;;
          error) echo "simulated presence transport error" >&2; return 1 ;;
          malformed) echo 'not-json{{{'; return 0 ;;
        esac
      elif [[ "$args" == *"dev-team-cron-singleton"* ]]; then
        case "${STUB_SF1:-won}" in
          won) echo '{"claimed":true}'; return 0 ;;
          self_held) echo '{"claimed":false,"current_holder":{"owner_client_session":"'"$FAKE_SESSION"'","owner_agent":"dev-team","expires_at":9999999999}}'; return 0 ;;
          lost_peer) echo '{"claimed":false,"current_holder":{"owner_client_session":"peer-session-xyz","owner_agent":"dev-team","expires_at":9999999999}}'; return 0 ;;
          timeout) echo "simulated SF-1 transport timeout" >&2; return 1 ;;
          malformed) echo 'not-json{{{'; return 0 ;;
        esac
      elif [[ "$args" == *"cron:dev-team:"* ]]; then
        case "${STUB_ELECTION:-won}" in
          won) echo '{"claimed":true}'; return 0 ;;
          re_entrant) echo '{"claimed":false,"current_holder":{"owner_client_session":"'"$FAKE_SESSION"'"}}'; return 0 ;;
          lost_peer) echo '{"claimed":false,"current_holder":{"owner_client_session":"peer-session-xyz"}}'; return 0 ;;
          iserror) echo "simulated tool error: isError=true: Tool xyz not found" >&2; return 1 ;;
          malformed) echo 'not-json{{{'; return 0 ;;
        esac
      else
        echo "unstubbed task_claim in test: $args" >&2; return 1
      fi
      ;;
    task_heartbeat) echo '{"ok":true,"expires_at":9999999999}'; return 0 ;;
    task_release) echo '{"ok":true,"released":1}'; return 0 ;;
    send_telegram) echo '{"ok":true}'; return 0 ;;
    *) echo "unstubbed tool in test: $tool" >&2; return 1 ;;
  esac
}

run_case() {
  # Resets scenario knobs to defaults before each test.
  STUB_PRESENCE="ok"; STUB_SF1="won"; STUB_ELECTION="won"
  # Step 5 idle-check fixtures — default = deliberately NOT idle (isolates
  # T1-T12's RUN assertions from the live repo's docs/signals/ + orch-state.json).
  export SIGNALS_DIR="$TMPDIR_TEST/signals-nonempty"
  export SIGNALS_DB_PATH="$TMPDIR_TEST/does-not-exist-signals.db"
  export ORCH_STATE_PATH="$TMPDIR_TEST/orch-not-idle.json"
  : > "$CALL_LOG_FILE"
}

log_count() {
  # grep -c always prints a count (even "0") but exits non-zero on zero
  # matches — do NOT chain `|| echo 0` after it, that duplicates the line.
  local n
  n=$(grep -cx "$1" "$CALL_LOG_FILE" 2>/dev/null)
  printf '%s' "${n:-0}"
}
log_has() { [ "$(log_count "$1")" -gt 0 ] && echo true || echo false; }

# ── T1: RUN path — SF-1 + fire-election both won ─────────────────────────────
run_case
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
TICK=$(printf '%s' "$OUT" | jq -r '.tick')
check "T1 RUN verdict" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"
check "T1 RUN exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T1 RUN tick format YYYY-MM-DDTHH:MMZ" "$([[ "$TICK" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:(07|37)Z$ ]] && echo true || echo false)"
check "T1 RUN does NOT release any lock" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"
check "T1 RUN does NOT send telegram (script stays silent on success)" "$([ "$(log_has send_telegram)" = "false" ] && echo true || echo false)"

# ── T2: RUN path — fire-election re-entrant self-hold (renew + proceed) ──────
run_case
STUB_ELECTION="re_entrant"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T2 RUN verdict (re-entrant election)" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"
check "T2 RUN heartbeats the re-entrant election lock" "$([ "$(log_has task_heartbeat)" = "true" ] && echo true || echo false)"
check "T2 RUN does NOT release SF-1" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"

# ── T3: SKIP path (a) — SF-1 held by peer, R7: release NOTHING (never held) ──
run_case
STUB_SF1="lost_peer"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T3 SKIP(a) verdict" "$([ "$VERDICT" = "SKIP" ] && echo true || echo false)"
check "T3 SKIP(a) exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T3 SKIP(a) sends work-channel telegram" "$([ "$(log_has send_telegram)" = "true" ] && echo true || echo false)"
check "T3 SKIP(a) does NOT call task_release (never held SF-1)" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"
check "T3 SKIP(a) task_claim called exactly 2x (presence+SF-1 — fire-election never reached)" "$([ "$(log_count task_claim)" -eq 2 ] && echo true || echo false)"
check "T3 SKIP(a) detail non-empty" "$([ -n "$DETAIL" ] && echo true || echo false)"
check "T3 SKIP(a) total call count == 3 (presence claim + SF-1 claim + skip telegram)" "$([ "$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')" -eq 3 ] && echo true || echo false)"

# ── T4: SKIP path (b) — SF-1 won, fire-election lost, R7: release SF-1 ───────
run_case
STUB_ELECTION="lost_peer"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T4 SKIP(b) verdict" "$([ "$VERDICT" = "SKIP" ] && echo true || echo false)"
check "T4 SKIP(b) exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T4 SKIP(b) DOES call task_release (SF-1 was held)" "$([ "$(log_has task_release)" = "true" ] && echo true || echo false)"
check "T4 SKIP(b) sends work-channel telegram" "$([ "$(log_has send_telegram)" = "true" ] && echo true || echo false)"

# ── T5: ERROR path — SF-1 claim MCP timeout ───────────────────────────────────
run_case
STUB_SF1="timeout"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T5 ERROR verdict (SF-1 MCP timeout)" "$([ "$VERDICT" = "ERROR" ] && echo true || echo false)"
check "T5 ERROR exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T5 ERROR does NOT release (SF-1 was never claimed)" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"
check "T5 ERROR detail non-empty" "$([ -n "$DETAIL" ] && echo true || echo false)"

# ── T6: ERROR path — fire-election tool error (isError=true) ─────────────────
run_case
STUB_ELECTION="iserror"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T6 ERROR verdict (fire-election isError=true)" "$([ "$VERDICT" = "ERROR" ] && echo true || echo false)"
check "T6 ERROR exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T6 ERROR RELEASES SF-1 (avoid 90min stranding — see script header note)" "$([ "$(log_has task_release)" = "true" ] && echo true || echo false)"

# ── T7: ERROR path — SF-1 claim malformed JSON response ──────────────────────
run_case
STUB_SF1="malformed"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T7 ERROR verdict (SF-1 malformed JSON)" "$([ "$VERDICT" = "ERROR" ] && echo true || echo false)"
check "T7 ERROR does NOT release (SF-1 claim itself was unparseable)" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"

# ── T8: ERROR path — fire-election malformed JSON response ───────────────────
run_case
STUB_ELECTION="malformed"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T8 ERROR verdict (fire-election malformed JSON)" "$([ "$VERDICT" = "ERROR" ] && echo true || echo false)"
check "T8 ERROR releases SF-1 (malformed treated same as transport error)" "$([ "$(log_has task_release)" = "true" ] && echo true || echo false)"

# ── T9: RUN path survives presence transport error (R6: presence never gates) ─
run_case
STUB_PRESENCE="error"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T9 RUN verdict despite presence transport error (never a gate)" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"

# ── T10: RUN path survives presence malformed JSON (never a gate) ────────────
run_case
STUB_PRESENCE="malformed"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T10 RUN verdict despite presence malformed JSON (never a gate)" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"

# ── T11: RUN path — presence re-entrant self-hold triggers heartbeat, not gate ─
run_case
STUB_PRESENCE="not_held_self"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
PRESENCE_HB_COUNT=$(log_count "task_heartbeat")
check "T11 RUN verdict (presence re-entrant self-hold)" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"
check "T11 heartbeats presence lock" "$([ "$PRESENCE_HB_COUNT" -ge 1 ] && echo true || echo false)"

# ── T12: ERROR path — CLAUDE_CODE_SESSION_ID unset ────────────────────────────
run_case
unset CLAUDE_CODE_SESSION_ID
OUT=$(run_preflight); RC=$?
export CLAUDE_CODE_SESSION_ID="$FAKE_SESSION"
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T12 ERROR verdict (missing session id)" "$([ "$VERDICT" = "ERROR" ] && echo true || echo false)"
check "T12 ERROR exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T12 ERROR makes NO mcp_call at all" "$([ ! -s "$CALL_LOG_FILE" ] && echo true || echo false)"

# ── T13: RUN-IDLE path — all four idle fields empty/fresh (P1-IDLE-DEVTEAM-
# PREFLIGHT-SCRIPT AC1: zero drain-signals-related calls + verdict RUN-IDLE) ──
run_case
export SIGNALS_DIR="$TMPDIR_TEST/signals-empty"
export SIGNALS_DB_PATH="$TMPDIR_TEST/does-not-exist-signals.db"
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-idle.json"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T13 RUN-IDLE verdict (all idle fields empty)" "$([ "$VERDICT" = "RUN-IDLE" ] && echo true || echo false)"
check "T13 RUN-IDLE exit=1 (LLM continues, same family as RUN)" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T13 RUN-IDLE does NOT release any lock" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"
check "T13 RUN-IDLE does NOT send telegram" "$([ "$(log_has send_telegram)" = "false" ] && echo true || echo false)"
check "T13 RUN-IDLE task_claim called exactly 3x (presence, SF-1, fire-election — no drain-signals calls)" "$([ "$(log_count task_claim)" -eq 3 ] && echo true || echo false)"
check "T13 RUN-IDLE total call trace == exactly 3 (ZERO drain-signals-related calls)" "$([ "$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')" -eq 3 ] && echo true || echo false)"

# ── T14: RUN (not idle) — docs/signals/*.json non-empty alone blocks idle ────
run_case
export SIGNALS_DIR="$TMPDIR_TEST/signals-nonempty"
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-idle.json"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T14 RUN verdict (signal files present blocks idle)" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"

# ── T15: RUN (not idle) — task_board.active_sprints non-empty alone blocks idle ─
run_case
export SIGNALS_DIR="$TMPDIR_TEST/signals-empty"
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-not-idle.json"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T15 RUN verdict (active_sprints non-empty blocks idle)" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"

# ── T16: RUN (not idle) — signal_queue NEW row alone blocks idle ─────────────
run_case
export SIGNALS_DIR="$TMPDIR_TEST/signals-empty"
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-new-signal-only.json"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T16 RUN verdict (signal_queue NEW row blocks idle)" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"

# ── T17: RUN (not idle) — stale signals.db (mtime > 24h) alone blocks idle ───
run_case
export SIGNALS_DIR="$TMPDIR_TEST/signals-empty"
export SIGNALS_DB_PATH="$TMPDIR_TEST/signals-stale.db"
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-idle.json"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T17 RUN verdict (stale signals.db mtime blocks idle)" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"

# ── T18: RUN-IDLE — missing signals.db is a safe default (not stale) ─────────
run_case
export SIGNALS_DIR="$TMPDIR_TEST/signals-empty"
export SIGNALS_DB_PATH="$TMPDIR_TEST/does-not-exist-signals.db"
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-idle.json"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T18 RUN-IDLE verdict (missing signals.db = safe default, not stale)" "$([ "$VERDICT" = "RUN-IDLE" ] && echo true || echo false)"

# ── T19: RUN path — SF-1 re-entrant self-hold (FIX-DEVTEAM-PREFLIGHT-SF1-
# REENTRANT regression: current_holder.owner_client_session==self MUST renew
# + proceed, never phantom-SKIP as "peer holds it") ──────────────────────────
run_case
STUB_SF1="self_held"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T19 RUN verdict (SF-1 self-hold — not a phantom peer SKIP)" "$([ "$VERDICT" = "RUN" ] && echo true || echo false)"
check "T19 RUN exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T19 RUN heartbeats the self-held SF-1 lock" "$([ "$(log_has task_heartbeat)" = "true" ] && echo true || echo false)"
check "T19 RUN does NOT release any lock" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"
check "T19 RUN does NOT send telegram (no false SKIP)" "$([ "$(log_has send_telegram)" = "false" ] && echo true || echo false)"

# ── T20: SKIP path (a) still fires correctly for a REAL peer (regression
# guard: T19's fix must not weaken the genuine peer-collision SKIP path) ─────
run_case
STUB_SF1="lost_peer"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T20 SKIP(a) verdict unchanged for REAL peer hold" "$([ "$VERDICT" = "SKIP" ] && echo true || echo false)"
check "T20 SKIP(a) does NOT call task_release (never held SF-1)" "$([ "$(log_has task_release)" = "false" ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
