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
      if [[ "$args" == *"cron-registration:cowork-team"* ]]; then
        case "${STUB_CRONREG_HB:-ok}" in
          ok) echo '{"ok":true,"expires_at":9999999999}'; return 0 ;;
          error) echo "simulated cron-registration heartbeat transport error" >&2; return 1 ;;
        esac
      fi
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
      # FR-A3 (TASK_2008b): optional raw-args capture seam — when
      # EMIT_ARGS_CAPTURE_FILE is set, the exact emit_pressure_state args this
      # call received are written verbatim so a test can assert on key
      # presence/absence (e.g. calendar_status) without CALL_LOG_FILE's
      # tool|kind|tid summary, which never carries top-level payload keys.
      [ -n "${EMIT_ARGS_CAPTURE_FILE:-}" ] && printf '%s' "$args" > "$EMIT_ARGS_CAPTURE_FILE"
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
  STUB_CRONREG_HB="ok"
  : > "$CALL_LOG_FILE"
}

log_has() { grep -q "^$1|" "$CALL_LOG_FILE" 2>/dev/null && echo true || echo false; }
log_count() {
  # FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE: `grep -c` exits non-zero when the
  # match count IS zero (that's "no lines matched", not "grep failed") even
  # though it still prints "0" — the old `|| echo 0` fallback then ALSO fired,
  # emitting a second "0" line and corrupting a true-zero assertion (AC-1
  # needs to assert exactly 0 task_claim calls on a tombstoned tick). Capture
  # into a var first so the exit code never reaches a shell `||`.
  local n
  n=$(grep -c "^$1|" "$CALL_LOG_FILE" 2>/dev/null)
  echo "${n:-0}"
}
log_has_line() { grep -qF "$1" "$CALL_LOG_FILE" 2>/dev/null && echo true || echo false; }

# ── U-TOMBSTONE: _tick_already_ran() pure predicate unit tests ───────────────
# FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE / NFR-4 positive control: replay the
# two REAL incident tick_ids verbatim (second-precision, as pressure-state.json
# actually stamps them) against the minute-precision nominal tick the script
# computes. A regression back to a naive `==` string compare (the NFR-1
# landmine) fails these two assertions immediately, not just "suite exits 0".
cat > "$TMPDIR_TEST/pressure-slot3.json" <<'JSON'
{"tick_id":"2026-07-30T21:00:00Z"}
JSON
check "U-TOMBSTONE positive control slot-3 incident (21:00:00Z vs nominal 21:00Z)" \
  "$(_tick_already_ran "$TMPDIR_TEST/pressure-slot3.json" "2026-07-30T21:00Z")"

cat > "$TMPDIR_TEST/pressure-slot4.json" <<'JSON'
{"tick_id":"2026-07-31T00:00:00Z"}
JSON
check "U-TOMBSTONE positive control slot-4 incident (00:00:00Z vs nominal 00:00Z)" \
  "$(_tick_already_ran "$TMPDIR_TEST/pressure-slot4.json" "2026-07-31T00:00Z")"

# Negative controls — all must be "false" (NFR-2: never over-suppress).
check "U-TOMBSTONE negative: non-matching tick_id" \
  "$([ "$(_tick_already_ran "$TMPDIR_TEST/pressure-slot4.json" "2026-07-31T00:15Z")" = "false" ] && echo true || echo false)"
check "U-TOMBSTONE negative: missing pressure-state.json file" \
  "$([ "$(_tick_already_ran "$TMPDIR_TEST/does-not-exist-fixture.json" "2026-07-31T00:00Z")" = "false" ] && echo true || echo false)"

echo '{}' > "$TMPDIR_TEST/pressure-empty-tick.json"
check "U-TOMBSTONE negative: absent tick_id field" \
  "$([ "$(_tick_already_ran "$TMPDIR_TEST/pressure-empty-tick.json" "2026-07-31T00:00Z")" = "false" ] && echo true || echo false)"

echo '{"tick_id":""}' > "$TMPDIR_TEST/pressure-blank-tick.json"
check "U-TOMBSTONE negative: empty-string tick_id field" \
  "$([ "$(_tick_already_ran "$TMPDIR_TEST/pressure-blank-tick.json" "2026-07-31T00:00Z")" = "false" ] && echo true || echo false)"

echo '{"tick_id":"not-a-timestamp"}' > "$TMPDIR_TEST/pressure-malformed.json"
check "U-TOMBSTONE negative: malformed/non-ISO tick_id" \
  "$([ "$(_tick_already_ran "$TMPDIR_TEST/pressure-malformed.json" "2026-07-31T00:00Z")" = "false" ] && echo true || echo false)"

echo '{"tick_id":"2026-07-31T00:00Z"}' > "$TMPDIR_TEST/pressure-minuteprecision.json"
check "U-TOMBSTONE negative: tick_id already minute-precision (no seconds — not what server writes, must still not crash the regex/compare)" \
  "$([ "$(_tick_already_ran "$TMPDIR_TEST/pressure-minuteprecision.json" "2026-07-31T00:00Z")" = "false" ] && echo true || echo false)"

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
check "T1 AC-2: SILENT tick fires cron-registration:cowork-team renewal heartbeat" \
  "$(log_has_line "task_heartbeat||cron-registration:cowork-team")"

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

# ── T2c: WORK verdict envelope carries the UC-CDC-P7 Phase 2a matcher-metadata fields
#     (pressure_mode/downgraded/suppressed_cadence/chef_mutex_applied/due_reasons/
#     cadence_minutes), pulled through from cowork-match-slots.js's stdout — and the
#     envelope is a CLEAN merge (no stray brace corruption from the `${8:-{}}` bash
#     brace-matching bug this test would have caught: that bug appended a literal `}`
#     after any non-empty extra arg, which would break `jq -r '.verdict'` here) ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"news-scout-market\"}],\"drift_min\":1,\"pressure_mode\":\"adaptive\",\"downgraded\":[\"market-watcher-eod\"],\"suppressed_cadence\":[\"news-scout-sentiment\"],\"chef_mutex_applied\":true,\"due_reasons\":{\"news-scout-market\":\"cron\"},\"cadence_minutes\":{\"news-scout-market\":null}}"'
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T2c WORK verdict (envelope parses clean — no brace-corruption regression)" "$([ "$VERDICT" = "WORK" ] && echo true || echo false)"
check "T2c pressure_mode passed through" "$([ "$(printf '%s' "$OUT" | jq -r '.pressure_mode')" = "adaptive" ] && echo true || echo false)"
check "T2c downgraded passed through" "$([ "$(printf '%s' "$OUT" | jq -r '.downgraded[0]')" = "market-watcher-eod" ] && echo true || echo false)"
check "T2c suppressed_cadence passed through" "$([ "$(printf '%s' "$OUT" | jq -r '.suppressed_cadence[0]')" = "news-scout-sentiment" ] && echo true || echo false)"
check "T2c chef_mutex_applied passed through" "$([ "$(printf '%s' "$OUT" | jq -r '.chef_mutex_applied')" = "true" ] && echo true || echo false)"
check "T2c due_reasons passed through" "$([ "$(printf '%s' "$OUT" | jq -r '.due_reasons["news-scout-market"]')" = "cron" ] && echo true || echo false)"

# ── T2d: non-WORK verdicts still emit a clean envelope with no matcher-metadata keys
#     (the 8th `_emit_verdict` arg defaults to {} — no leakage from a prior WORK call,
#     no stray-brace corruption on the default-value path either) ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
OUT=$(run_preflight); RC=$?
check "T2d SILENT verdict envelope parses (jq -e .)" "$(printf '%s' "$OUT" | jq -e . >/dev/null 2>&1 && echo true || echo false)"
check "T2d SILENT verdict carries no pressure_mode key (extra={} default, not leaked)" "$([ "$(printf '%s' "$OUT" | jq 'has("pressure_mode")')" = "false" ] && echo true || echo false)"

# ── T2e: FR-A3 — SILENT-path emit_pressure_state call stops recycling stale
#     calendar_status out of pressure-state.json. Once TASK_2008a lands, the
#     server computes calendar_status fresh every call; this script must no
#     longer pass a caller-supplied value at all (shape-identical to the WORK
#     path, which never carried the key either). Precedent: T2d's "carries no
#     pressure_mode key" shape assertion, applied to the mcp_call args instead
#     of the verdict envelope. ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
export PRESSURE_STATE_PATH="$TMPDIR_TEST/pressure-t2e-with-calendar-status.json"
echo '{"calendar_status":"open","last_regime":"bull","last_volatility_level":"low"}' > "$PRESSURE_STATE_PATH"
EMIT_ARGS_CAPTURE_FILE="$TMPDIR_TEST/emit-args-t2e.json"
export EMIT_ARGS_CAPTURE_FILE
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T2e SILENT verdict (FR-A3 fixture)" "$([ "$VERDICT" = "SILENT" ] && echo true || echo false)"
check "T2e FR-A3: SILENT-path emit_pressure_state call args do NOT contain calendar_status key" \
  "$([ -s "$EMIT_ARGS_CAPTURE_FILE" ] && ! grep -q 'calendar_status' "$EMIT_ARGS_CAPTURE_FILE" && echo true || echo false)"
unset EMIT_ARGS_CAPTURE_FILE
export PRESSURE_STATE_PATH="$TMPDIR_TEST/does-not-exist-pressure-state.json"

# ── T-SSOT: I16 (UC-CDC-P7) — cowork-inbox recipient set is read from system-map.json's
#     cowork_signal_recipient:true field, not the hardcoded fallback literal, when the
#     file is present. A row addressed to an agent NOT in this custom map does not count. ──
run_case
export SYSTEM_MAP_PATH="$TMPDIR_TEST/system-map-custom.json"
cat > "$SYSTEM_MAP_PATH" <<'JSON'
{"project":{"agents":[{"id":"only-this-agent","type":"dev-core","cowork_signal_recipient":true},{"id":"po","type":"dev-core"}]}}
JSON
cat > "$TMPDIR_TEST/orch-ssot-signal.json" <<'JSON'
{"signal_queue":{"rows":[{"id":"s1","status":"NEW","to":"only-this-agent","from":"test"},{"id":"s2","status":"NEW","to":"po","from":"test"}]}}
JSON
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-ssot-signal.json"
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
OUT=$(run_preflight); RC=$?
NEW_SIGNALS=$(printf '%s' "$OUT" | jq '.new_signals')
check "T-SSOT counts only the SSOT-flagged recipient (po dropped from custom map -> count=1, not 2)" "$([ "$NEW_SIGNALS" -eq 1 ] && echo true || echo false)"
# Reset to a non-existent path (never a bare `unset` — SYSTEM_MAP_PATH is assigned once at
# source-time under `set -u`; unsetting it here would make every later reference an unbound-
# variable error) so `_cowork_signal_recipients` falls back to the last-known-good literal,
# matching the PRESSURE_STATE_PATH reset convention already used elsewhere in this file.
export SYSTEM_MAP_PATH="$TMPDIR_TEST/does-not-exist-system-map.json"
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

# ── T6: TOMBSTONED end-to-end via run_preflight (AC-1 — zero cowork-slot claims) ──
# Computes the current tick boundary the same way the script's own Step 1 does
# (avoids a flaky fixed-historical fixture — the script derives $tick from real
# wall-clock, so the fixture must match whatever run_preflight computes at the
# moment it runs, not a hardcoded past tick).
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
T6_CUR_MIN=$(date -u +%M); T6_CUR_MIN=$((10#$T6_CUR_MIN))
T6_BOUNDARY_MIN=$(( T6_CUR_MIN / 15 * 15 ))
T6_TICK=$(date -u +"%Y-%m-%dT%H:$(printf '%02d' "$T6_BOUNDARY_MIN")Z")
export PRESSURE_STATE_PATH="$TMPDIR_TEST/pressure-tombstone-live.json"
jq -n --arg tid "${T6_TICK%Z}:00Z" '{tick_id:$tid}' > "$PRESSURE_STATE_PATH"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T6 TOMBSTONED verdict (pressure-state.json already has the live current tick)" "$([ "$VERDICT" = "TOMBSTONED" ] && echo true || echo false)"
check "T6 TOMBSTONED exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T6 TOMBSTONED zero cowork-slot task_claim calls (AC-1 tool-call level, not merely zero successful claims)" "$([ "$(log_count "task_claim|cowork-slot")" -eq 0 ] && echo true || echo false)"
check "T6 AC-2: TOMBSTONED tick still fires cron-registration:cowork-team renewal heartbeat (tightest proof — this verdict returns at line ~225 before every other MCP call, so the heartbeat is genuinely pre-election)" \
  "$(log_has_line "task_heartbeat||cron-registration:cowork-team")"
export PRESSURE_STATE_PATH="$TMPDIR_TEST/does-not-exist-pressure-state.json"

# ── T-CRONREG-NEG: AC-2 negative control — a transport failure on the cron-registration:
#     cowork-team heartbeat call must NOT gate, NOT alter the verdict, and NOT produce ERROR.
#     Exercised on both a SILENT tick and a TOMBSTONED tick (the tightest, pre-election path). ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
STUB_CRONREG_HB="error"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T-CRONREG-NEG SILENT: cron-registration heartbeat transport failure -> verdict still SILENT (unaffected)" \
  "$([ "$VERDICT" = "SILENT" ] && echo true || echo false)"
check "T-CRONREG-NEG SILENT: exit still 0 (rc not corrupted by the injected failure)" \
  "$([ "$RC" -eq 0 ] && echo true || echo false)"

run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
STUB_CRONREG_HB="error"
T_CRONREG_NEG_CUR_MIN=$(date -u +%M); T_CRONREG_NEG_CUR_MIN=$((10#$T_CRONREG_NEG_CUR_MIN))
T_CRONREG_NEG_BOUNDARY_MIN=$(( T_CRONREG_NEG_CUR_MIN / 15 * 15 ))
T_CRONREG_NEG_TICK=$(date -u +"%Y-%m-%dT%H:$(printf '%02d' "$T_CRONREG_NEG_BOUNDARY_MIN")Z")
export PRESSURE_STATE_PATH="$TMPDIR_TEST/pressure-cronreg-neg-tombstone.json"
jq -n --arg tid "${T_CRONREG_NEG_TICK%Z}:00Z" '{tick_id:$tid}' > "$PRESSURE_STATE_PATH"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T-CRONREG-NEG TOMBSTONED: cron-registration heartbeat transport failure -> verdict still TOMBSTONED (unaffected)" \
  "$([ "$VERDICT" = "TOMBSTONED" ] && echo true || echo false)"
check "T-CRONREG-NEG TOMBSTONED: exit still 1 (rc not corrupted by the injected failure)" \
  "$([ "$RC" -eq 1 ] && echo true || echo false)"
export PRESSURE_STATE_PATH="$TMPDIR_TEST/does-not-exist-pressure-state.json"

# ── T7: NFR-2 regression — stale/non-matching pressure-state.json must NOT
#     tombstone (a tick that died before telemetry.md Step 6.0 must still re-run) ──
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":3}"'
export PRESSURE_STATE_PATH="$TMPDIR_TEST/pressure-stale.json"
echo '{"tick_id":"2020-01-01T00:00:00Z"}' > "$PRESSURE_STATE_PATH"
OUT=$(run_preflight); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T7 NFR-2 stale non-matching pressure-state stays SILENT (no over-suppression)" "$([ "$VERDICT" = "SILENT" ] && echo true || echo false)"
check "T7 NFR-2 exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
export PRESSURE_STATE_PATH="$TMPDIR_TEST/does-not-exist-pressure-state.json"

# ── TICK-WU-1: telemetry wiring — tt_capture_and_log at the trailer ──────────
# Exercises the same function the trailer now calls in place of the bare
# `run_preflight; exit $?`. run_preflight/mcp_call are the same real function
# + stub already sourced above — TICK_TELEMETRY_LOG_PATH (Q6 precedence, see
# tick-telemetry.test.sh) is the ONE seam these tests need. Zero real MCP
# calls (mcp_call is still the stub). Owning task: TICK-WU-1-COWORK-WIRING.

# ── T-LOG: logging-specific — SILENT path, verify log file JSON contents ─────
LOG_T_LOG="$TMPDIR_TEST/telemetry-t-log.jsonl"
run_case
export MCP_JSON_PATH="$TMPDIR_TEST/mcp-normal.json"
export ORCH_STATE_PATH="$TMPDIR_TEST/orch-no-signals.json"
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":3}"'
OUT_TLOG=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG" tt_capture_and_log "cowork-tick-preflight.sh" run_preflight); RC_TLOG=$?
check "T-LOG SILENT verdict still reaches caller via tt_capture_and_log wrapper" "$([ "$(printf '%s' "$OUT_TLOG" | jq -r '.verdict')" = "SILENT" ] && echo true || echo false)"
check "T-LOG exit=0 (real run_preflight rc preserved through the wrapper)" "$([ "$RC_TLOG" -eq 0 ] && echo true || echo false)"
check "T-LOG one telemetry line written" "$([ "$(wc -l < "$LOG_T_LOG" | tr -d ' ')" -eq 1 ] && echo true || echo false)"
check "T-LOG telemetry line script field is cowork-tick-preflight.sh" "$([ "$(jq -r '.script' "$LOG_T_LOG")" = "cowork-tick-preflight.sh" ] && echo true || echo false)"
check "T-LOG telemetry line verdict field mirrors stdout verdict (SILENT)" "$([ "$(jq -r '.verdict' "$LOG_T_LOG")" = "SILENT" ] && echo true || echo false)"
check "T-LOG telemetry line tick field present (cowork shape always carries a real tick, never null)" "$([ "$(jq -r '.tick != null' "$LOG_T_LOG")" = "true" ] && echo true || echo false)"
check "T-LOG telemetry line exit_code field == 0" "$([ "$(jq -r '.exit_code' "$LOG_T_LOG")" -eq 0 ] && echo true || echo false)"
check "T-LOG telemetry line has NO CLAUDE_CODE_SESSION_ID-shaped key (hard contract, script header)" \
  "$([ "$(jq -r 'has("session_id") or has("session") or has("claude_code_session_id")' "$LOG_T_LOG")" = "false" ] && echo true || echo false)"

# ── T-LOG2: WORK verdict path — non-zero exit code preserved through wrapper ──
LOG_T_LOG2="$TMPDIR_TEST/telemetry-t-log2.jsonl"
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[{\"slot_id\":\"news-scout-market\"}],\"drift_min\":2}"'
OUT_TLOG2=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG2" tt_capture_and_log "cowork-tick-preflight.sh" run_preflight); RC_TLOG2=$?
check "T-LOG2 WORK verdict reaches caller via wrapper" "$([ "$(printf '%s' "$OUT_TLOG2" | jq -r '.verdict')" = "WORK" ] && echo true || echo false)"
check "T-LOG2 WORK exit=1 (real run_preflight rc preserved, not swallowed by a successful log write)" "$([ "$RC_TLOG2" -eq 1 ] && echo true || echo false)"
check "T-LOG2 telemetry line exit_code field == 1" "$([ "$(jq -r '.exit_code' "$LOG_T_LOG2")" -eq 1 ] && echo true || echo false)"

# ── T-LOG3: rotation in-situ — over-fill a small-cap log via real invocations,
#     newest tick's own log entry survives (see T-LOG4 for its stdout side) ──
LOG_T_LOG3="$TMPDIR_TEST/telemetry-t-log3.jsonl"
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
i=1
while [ "$i" -le 8 ]; do
  TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG3" TICK_TELEMETRY_MAX_LINES=5 \
    tt_capture_and_log "cowork-tick-preflight.sh" run_preflight >/dev/null
  i=$((i + 1))
done
check "T-LOG3 rotation caps the file at TICK_TELEMETRY_MAX_LINES (5), not the 8 real invocations" \
  "$([ "$(wc -l < "$LOG_T_LOG3" | tr -d ' ')" -eq 5 ] && echo true || echo false)"

# ── T-LOG4: AC-6 stdout purity + AC-2/AC-3 byte-identity — cowork's
#     _emit_verdict does NOT pass jq's -c/--compact-output (see tick-
#     telemetry.sh header comment), so the real verdict is ALREADY multi-line
#     pretty-printed JSON — a naive "stdout is a single line" assertion would
#     be wrong even pre-WU-1. The real purity contract: the wrapper reprints
#     that multi-line JSON BYTE-IDENTICAL (diffed here against a direct,
#     unwrapped run_preflight() call under identical stub conditions) with
#     zero logging noise mixed in — verified both by the byte-diff and by
#     confirming the whole captured stdout still parses as exactly ONE JSON
#     document (jq -e . fails on ANY leading/trailing non-JSON text).
LOG_T_LOG4="$TMPDIR_TEST/telemetry-t-log4.jsonl"
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
RAW_TLOG4=$(run_preflight)
WRAPPED_TLOG4=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG4" tt_capture_and_log "cowork-tick-preflight.sh" run_preflight)
check "T-LOG4 AC-2/AC-3: wrapper reprints stdout BYTE-IDENTICAL to a direct (unwrapped) run_preflight() call" \
  "$([ "$WRAPPED_TLOG4" = "$RAW_TLOG4" ] && echo true || echo false)"
check "T-LOG4 AC-6: stdout parses as exactly ONE JSON document (no trailing/leading logging noise)" \
  "$(printf '%s' "$WRAPPED_TLOG4" | jq -e . >/dev/null 2>&1 && echo true || echo false)"
check "T-LOG4 AC-6: negative control — log file DID receive a separate entry (proves logging happened, off stdout)" \
  "$([ -s "$LOG_T_LOG4" ] && echo true || echo false)"

# ── T-LOG5: AC-4/AC-5 fault inject — unwritable log destination never changes
#     the caller's real verdict or exit code (same portable root/non-root-safe
#     technique as tick-telemetry.test.sh T9: a FILE occupying a path
#     component that mkdir -p cannot turn into a directory) ─────────────────
run_case
export SLOT_MATCHER_CMD='echo "{\"slots\":[],\"drift_min\":0}"'
BLOCKER_FILE_TLOG5="$TMPDIR_TEST/t-log5-blocker-not-a-dir"
touch "$BLOCKER_FILE_TLOG5"
UNWRITABLE_LOG_TLOG5="$BLOCKER_FILE_TLOG5/sub/telemetry.jsonl"
OUT_TLOG5=$(TICK_TELEMETRY_LOG_PATH="$UNWRITABLE_LOG_TLOG5" tt_capture_and_log "cowork-tick-preflight.sh" run_preflight); RC_TLOG5=$?
check "T-LOG5 AC-4/AC-5: unwritable log destination -> verdict still SILENT (unaffected)" \
  "$([ "$(printf '%s' "$OUT_TLOG5" | jq -r '.verdict')" = "SILENT" ] && echo true || echo false)"
check "T-LOG5 AC-4/AC-5: unwritable log destination -> exit code still the real run_preflight rc (0)" \
  "$([ "$RC_TLOG5" -eq 0 ] && echo true || echo false)"
check "T-LOG5 AC-4/AC-5: unwritable log destination -> no file was created at the blocked path" \
  "$([ ! -f "$UNWRITABLE_LOG_TLOG5" ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
