#!/usr/bin/env bash
# scripts/agents-flow/mcp-call-gateway-meta.test.sh
#
# Regression test for FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE —
# mcp_call_gateway_meta() bridges the 3 gateway meta-tools (list_servers /
# list_server_tools / search_tools) which have no bash-callable equivalent via
# the existing stateless mcp_call() (different endpoint, genuinely stateful
# contract — proven live in docs/architecture-briefs/
# 2026-07-08-gateway-blind-cli-handshake-spike.md §2).
#
# Exercises the 3-step handshake (initialize -> notifications/initialized ->
# tools/call, mcp-session-id header minted by step 1 and reused on steps 2/3)
# via a stubbed _mcp_call_gateway_curl (function-override after sourcing —
# same pattern as cowork-tick-preflight.test.sh) so NO real network calls are
# made. Canned header/body byte shapes below were captured live against the
# production gateway (https://zenmidi.com/gateway/mcp) during this task's own
# implementation probe, 2026-07-08.
#
# Run:
#   bash scripts/agents-flow/mcp-call-gateway-meta.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_CALL_SH="$SCRIPT_DIR/mcp-call.sh"

if [ ! -f "$MCP_CALL_SH" ]; then
  echo "ERROR: mcp-call.sh not found at $MCP_CALL_SH" >&2
  exit 1
fi

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
# shellcheck source=./mcp-call.sh
source "$MCP_CALL_SH"

TMPDIR_TEST=$(mktemp -d /private/tmp/mcp-call-gw-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT
CALL_LOG_FILE="$TMPDIR_TEST/call-log.txt"
: > "$CALL_LOG_FILE"

# ── Canned raw response fragments — headers CRLF-terminated (real HTTP/2),
# SSE body LF-terminated (real SSE) — mirrors exact live-captured shapes. ────
INIT_HEADERS=$'HTTP/2 200 \r\ndate: Wed, 08 Jul 2026 19:02:34 GMT\r\ncontent-type: text/event-stream\r\nmcp-session-id: TESTSESSIONID123\r\ncf-cache-status: DYNAMIC\r\nserver: cloudflare\r\n\r\n'
INIT_HEADERS_NO_SESSION=$'HTTP/2 200 \r\ncontent-type: text/event-stream\r\n\r\n'
INIT_BODY='event: message
data: {"jsonrpc":"2.0","id":1,"result":{"capabilities":{"tools":{"listChanged":true}},"protocolVersion":"2024-11-05","serverInfo":{"name":"mcp-gateway","version":"v0.1.0"}}}'
NOTIF_HEADERS=$'HTTP/2 202 \r\ndate: Wed, 08 Jul 2026 19:02:49 GMT\r\ncontent-length: 0\r\nserver: cloudflare\r\n\r\n'
ERR500_HEADERS=$'HTTP/2 500 \r\n\r\n'
CALL_HEADERS=$'HTTP/2 200 \r\ndate: Wed, 08 Jul 2026 19:02:49 GMT\r\ncontent-type: text/event-stream\r\nserver: cloudflare\r\n\r\n'
CALL_BODY_OK='event: message
data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"servers\":[{\"name\":\"vn-market\",\"tools_cached\":false,\"transport\":\"sse\"}]}"}],"structuredContent":{"servers":[{"name":"vn-market","tools_cached":false,"transport":"sse"}]}}}'
CALL_BODY_ISERROR='event: message
data: {"jsonrpc":"2.0","id":2,"result":{"isError":true,"content":[{"type":"text","text":"simulated tool error"}]}}'

STUB_MODE="${STUB_MODE:-happy}"

# ── Stub — overrides the real function pulled in by the source above ────────
_mcp_call_gateway_curl() {
  local url="$1" body="$2" timeout_s="$3" session_id="$4"
  local method
  method=$(printf '%s' "$body" | jq -r '.method // empty' 2>/dev/null)
  echo "${method}|session=${session_id}" >> "$CALL_LOG_FILE"

  case "$STUB_MODE" in
    transport_fail_init)
      if [ "$method" = "initialize" ]; then
        echo "simulated connection refused (curl exit=7)"
        return 7
      fi
      ;;
    http_error_init)
      if [ "$method" = "initialize" ]; then
        printf '%s\n%s\n' "$ERR500_HEADERS" "500"
        return 0
      fi
      ;;
    no_session_id_init)
      if [ "$method" = "initialize" ]; then
        printf '%s%s\n%s\n' "$INIT_HEADERS_NO_SESSION" "$INIT_BODY" "200"
        return 0
      fi
      ;;
    http_error_notif)
      if [ "$method" = "notifications/initialized" ]; then
        printf '%s\n%s\n' "$ERR500_HEADERS" "500"
        return 0
      fi
      ;;
    iserror_call)
      if [ "$method" = "tools/call" ]; then
        printf '%s%s\n%s\n' "$CALL_HEADERS" "$CALL_BODY_ISERROR" "200"
        return 0
      fi
      ;;
  esac

  case "$method" in
    initialize)
      printf '%s%s\n%s\n' "$INIT_HEADERS" "$INIT_BODY" "200"
      ;;
    notifications/initialized)
      printf '%s\n%s\n' "$NOTIF_HEADERS" "202"
      ;;
    tools/call)
      printf '%s%s\n%s\n' "$CALL_HEADERS" "$CALL_BODY_OK" "200"
      ;;
    *)
      echo "unexpected method: $method"
      return 1
      ;;
  esac
}

# ── Scenario 1: happy path — full 3-step handshake, session-id propagated ───
STUB_MODE="happy"
: > "$CALL_LOG_FILE"
result=$(mcp_call_gateway_meta "list_servers" '{}')
rc=$?
check "happy path exits 0" "$([ "$rc" -eq 0 ] && echo true || echo false)"
check "happy path returns downstream JSON text" "$([ "$result" = '{"servers":[{"name":"vn-market","tools_cached":false,"transport":"sse"}]}' ] && echo true || echo false)"
LOG_LINES=$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')
check "happy path made exactly 3 calls" "$([ "$LOG_LINES" -eq 3 ] && echo true || echo false)"
check "step1 (initialize) sent no session-id" "$(sed -n '1p' "$CALL_LOG_FILE" | grep -q '^initialize|session=$' && echo true || echo false)"
check "step2 (notifications/initialized) reused minted session-id" "$(sed -n '2p' "$CALL_LOG_FILE" | grep -q '^notifications/initialized|session=TESTSESSIONID123$' && echo true || echo false)"
check "step3 (tools/call) reused minted session-id" "$(sed -n '3p' "$CALL_LOG_FILE" | grep -q '^tools/call|session=TESTSESSIONID123$' && echo true || echo false)"

# ── Scenario 2: rejects a non-meta tool name — no network attempted ─────────
STUB_MODE="happy"
: > "$CALL_LOG_FILE"
out=$(mcp_call_gateway_meta "task_claim" '{}' 2>&1)
rc=$?
check "non-meta tool_name rejected (rc=2)" "$([ "$rc" -eq 2 ] && echo true || echo false)"
check "non-meta tool_name made zero network calls" "$([ ! -s "$CALL_LOG_FILE" ] && echo true || echo false)"

# ── Scenario 3: missing tool_name ────────────────────────────────────────────
out=$(mcp_call_gateway_meta "" '{}' 2>&1)
rc=$?
check "empty tool_name rejected (rc=2)" "$([ "$rc" -eq 2 ] && echo true || echo false)"

# ── Scenario 4: transport failure on initialize — stop immediately ──────────
STUB_MODE="transport_fail_init"
: > "$CALL_LOG_FILE"
out=$(mcp_call_gateway_meta "list_servers" '{}' 2>&1)
rc=$?
check "transport failure at initialize returns non-zero" "$([ "$rc" -ne 0 ] && echo true || echo false)"
LOG_LINES=$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')
check "transport failure at initialize made exactly 1 call (no notif/call)" "$([ "$LOG_LINES" -eq 1 ] && echo true || echo false)"

# ── Scenario 5: non-2xx on initialize — stop immediately ────────────────────
STUB_MODE="http_error_init"
: > "$CALL_LOG_FILE"
out=$(mcp_call_gateway_meta "list_servers" '{}' 2>&1)
rc=$?
check "HTTP error on initialize returns non-zero" "$([ "$rc" -ne 0 ] && echo true || echo false)"
LOG_LINES=$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')
check "HTTP error on initialize made exactly 1 call" "$([ "$LOG_LINES" -eq 1 ] && echo true || echo false)"

# ── Scenario 6: initialize succeeds but omits mcp-session-id — stop ─────────
STUB_MODE="no_session_id_init"
: > "$CALL_LOG_FILE"
out=$(mcp_call_gateway_meta "list_servers" '{}' 2>&1)
rc=$?
check "missing session-id header returns non-zero" "$([ "$rc" -ne 0 ] && echo true || echo false)"
LOG_LINES=$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')
check "missing session-id header made exactly 1 call" "$([ "$LOG_LINES" -eq 1 ] && echo true || echo false)"

# ── Scenario 7: notifications/initialized rejected — stop before tools/call ─
STUB_MODE="http_error_notif"
: > "$CALL_LOG_FILE"
out=$(mcp_call_gateway_meta "list_servers" '{}' 2>&1)
rc=$?
check "HTTP error on notifications/initialized returns non-zero" "$([ "$rc" -ne 0 ] && echo true || echo false)"
LOG_LINES=$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')
check "HTTP error on notifications/initialized made exactly 2 calls" "$([ "$LOG_LINES" -eq 2 ] && echo true || echo false)"

# ── Scenario 8: tools/call succeeds transport-wise but isError=true ─────────
STUB_MODE="iserror_call"
: > "$CALL_LOG_FILE"
out=$(mcp_call_gateway_meta "list_servers" '{}' 2>&1)
rc=$?
check "isError=true on tools/call returns non-zero" "$([ "$rc" -ne 0 ] && echo true || echo false)"
LOG_LINES=$(wc -l < "$CALL_LOG_FILE" | tr -d ' ')
check "isError=true still completed all 3 steps" "$([ "$LOG_LINES" -eq 3 ] && echo true || echo false)"

# ── Regression: existing stateless mcp_call() untouched (still defined) ─────
check "mcp_call() still defined after adding mcp_call_gateway_meta()" "$([ "$(type -t mcp_call)" = "function" ] && echo true || echo false)"

echo ""
echo "TOTAL: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
