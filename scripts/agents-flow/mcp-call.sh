#!/usr/bin/env bash
# scripts/agents-flow/mcp-call.sh
#
# Shared JSON-RPC-over-curl helper for calling vn-market MCP tools from bash
# scripts (cowork-tick-preflight.sh, dev-team-tick-preflight.sh — TOKEN-ECONOMY-
# TICK-PREFLIGHT WU-1/WU-2). Built ONCE per architect risk note R1 — do not
# reinvent this transport per script.
#
# Live-verified mechanics (docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md):
#   - POST to /mcp works STATELESS — no prior `initialize` handshake needed.
#   - Response is SSE-framed: "event: message\ndata: {...}\n" — NOT plain JSON.
#   - Tool errors surface as `.result.isError == true` with a plain-text message
#     in `.result.content[0].text` — NOT a JSON-RPC-level `.error` field.
#   - HTTP status is 200 for both success and tool-error; only transport-level
#     failures (connection refused, timeout, DNS) are non-200/no-response.
#
# Contract:
#   mcp_call <tool_name> <json_args>
#     tool_name  — bare MCP tool name, e.g. "task_claim" (always a literal at
#                  each call site — never a variable built from agent-authored text)
#     json_args  — a JSON object string (default "{}"), e.g. '{"task_id":"x"}'
#   stdout: .result.content[0].text on success
#   exit code: 0 on success, non-zero on error (isError / transport failure /
#              timeout / malformed response) with detail on stderr
#
# DRAIN-INJECTION-SAFE: the request body is built exclusively via
# `jq -n --arg name --argjson args` — tool_name and args are always bound
# parameters, never raw string concatenation into the JSON body or the curl
# command line.
#
# Usage (sourced — the normal case):
#   source scripts/agents-flow/mcp-call.sh
#   result=$(mcp_call "task_list_held" '{}') || { echo "failed: $result" >&2; exit 1; }
#
# Usage (standalone CLI — manual/live testing):
#   scripts/agents-flow/mcp-call.sh task_list_held '{}'
#
# Deps: bash, jq, curl (all system-standard — no new runtime deps).

# ── Internal: single HTTP attempt, returns "<sse_body>\n<http_code>" on stdout ──
_mcp_call_curl() {
  local url="$1" body="$2" timeout_s="$3"
  curl -sS --max-time "$timeout_s" -w '\n%{http_code}' \
    -X POST "$url" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d "$body" 2>&1
}

# ── Internal: parse one SSE response body, print .result.content[0].text ──────
_mcp_call_parse() {
  local sse_body="$1" tool_name="$2"
  local data_line json_part is_error text rpc_err

  data_line=$(printf '%s\n' "$sse_body" | grep -m1 '^data: ')
  if [ -z "$data_line" ]; then
    echo "[mcp-call] ERROR: no SSE 'data:' line in response (tool=$tool_name): $(printf '%s' "$sse_body" | tr '\n' ' ' | cut -c1-200)" >&2
    return 1
  fi
  json_part="${data_line#data: }"

  if ! printf '%s' "$json_part" | jq -e . >/dev/null 2>&1; then
    echo "[mcp-call] ERROR: malformed JSON in SSE data (tool=$tool_name): $(printf '%s' "$json_part" | cut -c1-200)" >&2
    return 1
  fi

  is_error=$(printf '%s' "$json_part" | jq -r '.result.isError // false')
  if [ "$is_error" = "true" ]; then
    text=$(printf '%s' "$json_part" | jq -r '.result.content[0].text // "(no detail)"')
    echo "[mcp-call] ERROR: tool=$tool_name isError=true: $text" >&2
    return 1
  fi

  # Belt-and-suspenders: surface a JSON-RPC-level .error too, though the
  # live-verified contract says tool errors use isError, not .error.
  rpc_err=$(printf '%s' "$json_part" | jq -c '.error // empty')
  if [ -n "$rpc_err" ]; then
    echo "[mcp-call] ERROR: tool=$tool_name JSON-RPC error: $rpc_err" >&2
    return 1
  fi

  text=$(printf '%s' "$json_part" | jq -r '.result.content[0].text // empty')
  if [ -z "$text" ]; then
    echo "[mcp-call] ERROR: tool=$tool_name empty result text" >&2
    return 1
  fi

  # FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED (AC-4): NOT every tool handler in
  # this codebase sets `.result.isError` on every failure path — confirmed live
  # (2026-07-30) that post_agent_signal's generic catch-all returned an
  # `Error: <message>` TEXT body with isError left unset/false, which this
  # function previously treated as a normal SUCCESS (returning that text on
  # stdout with rc=0). The `Error:` prefix is this codebase's established,
  # repo-wide convention for a failed tool call (see e.g. agentSignalTools.ts,
  # multiple handlers) — treat it as a failure here too, belt-and-suspenders,
  # for every caller of mcp_call(), not just the one tool that surfaced this.
  case "$text" in
    "Error:"*)
      echo "[mcp-call] ERROR: tool=$tool_name text-prefixed-error (isError not set): $(printf '%s' "$text" | cut -c1-200)" >&2
      return 1
      ;;
  esac

  printf '%s' "$text"
  return 0
}

# ── Public: mcp_call <tool_name> <json_args> ──────────────────────────────────
mcp_call() {
  local tool_name="${1:-}"
  # NOTE: default is assigned in two steps ("${2:-}" then explicit '{}') — do NOT
  # collapse to "${2:-{}}"; bash's brace-parsing in parameter-expansion defaults
  # corrupts a literal "{}" argument into "{}}" (confirmed live 2026-07-02).
  local args_json="${2:-}"
  [ -z "$args_json" ] && args_json='{}'

  if [ -z "$tool_name" ]; then
    echo "[mcp-call] ERROR: tool_name is required" >&2
    return 2
  fi
  if ! command -v jq >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
    echo "[mcp-call] ERROR: jq and curl are required" >&2
    return 2
  fi

  local body
  body=$(jq -n --arg name "$tool_name" --argjson args "$args_json" \
    '{jsonrpc:"2.0", id:1, method:"tools/call", params:{name:$name, arguments:$args}}' 2>/dev/null)
  if [ -z "$body" ]; then
    echo "[mcp-call] ERROR: failed to build request body (malformed args_json for tool=$tool_name)" >&2
    return 2
  fi

  local timeout_s="${MCP_CALL_TIMEOUT_S:-10}"
  local urls=("${MCP_HTTP_URL:-http://localhost:3000/mcp}" "https://zenmidi.com/vn-market/mcp")
  local url raw curl_rc http_code sse_body last_err=""

  for url in "${urls[@]}"; do
    raw=$(_mcp_call_curl "$url" "$body" "$timeout_s")
    curl_rc=$?
    if [ $curl_rc -ne 0 ]; then
      last_err="transport failure calling $url (curl exit=$curl_rc): $(printf '%s' "$raw" | tail -c 200)"
      continue
    fi
    http_code=$(printf '%s' "$raw" | tail -n1)
    sse_body=$(printf '%s' "$raw" | sed '$d')
    case "$http_code" in
      2??)
        _mcp_call_parse "$sse_body" "$tool_name"
        return $?
        ;;
      *)
        last_err="HTTP $http_code from $url (tool=$tool_name): $(printf '%s' "$sse_body" | tr '\n' ' ' | cut -c1-200)"
        continue
        ;;
    esac
  done

  echo "[mcp-call] ERROR: $last_err" >&2
  return 1
}

# ── mcp_call_gateway_meta — stateful bridge to the 3 gateway META-tools ───────
# (FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE, follow-up from
# docs/architecture-briefs/2026-07-08-gateway-blind-cli-handshake-spike.md §2/§5b)
#
# mcp_call() above deliberately targets the STATELESS downstream vn-market
# endpoint — no prior handshake needed. The gateway endpoint
# (https://zenmidi.com/gateway/mcp) is, by contrast, genuinely STATEFUL: a
# compliant client MUST complete initialize -> notifications/initialized ->
# tools/call, reusing the `mcp-session-id` response header minted by step 1,
# or the server rejects the call ("invalid during session initialization").
# This is a SEPARATE function on purpose — different endpoint, different
# protocol contract. Do NOT merge into mcp_call(); do NOT route vn-market
# downstream tool calls through this function.
#
# Covers exactly the 3 gateway meta-tools that have no bash-callable
# equivalent today: list_servers / list_server_tools / search_tools. All
# other tool names belong to vn-market and MUST go through mcp_call().
#
# Live-verified mechanics (this task's implementation probe, 2026-07-08):
#   - Response bodies are SSE-framed exactly like the vn-market endpoint
#     ("event: message\ndata: {...}\n") — _mcp_call_parse() below is reused
#     as-is for the final tools/call response.
#   - `initialize` mints a NEW mcp-session-id on every call (returned as a
#     plain response header, not in the JSON body) — must be captured and
#     replayed on the next two POSTs.
#   - `notifications/initialized` is a one-way notification: HTTP 202,
#     empty body, no JSON-RPC id/result to parse.
#
# Contract (mirrors mcp_call()):
#   mcp_call_gateway_meta <tool_name> <json_args>
#     tool_name — one of "list_servers" | "list_server_tools" | "search_tools"
#     json_args — a JSON object string (default "{}")
#   stdout: .result.content[0].text on success (same shape as mcp_call())
#   exit code: 0 on success, non-zero on error — detail on stderr

# ── Internal: one HTTP attempt against the gateway endpoint. Uses `curl -i`
# (headers + body on stdout) because, unlike the stateless helper above, this
# caller needs the `mcp-session-id` response header, not just the body.
# Returns "<headers>\n<body>\n<http_code>" on stdout. ────────────────────────
_mcp_call_gateway_curl() {
  local url="$1" body="$2" timeout_s="$3" session_id="$4"
  local session_args=()
  if [ -n "$session_id" ]; then
    session_args=(-H "mcp-session-id: $session_id")
  fi
  curl -sS -i --max-time "$timeout_s" -w '\n%{http_code}' \
    -X POST "$url" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    "${session_args[@]}" \
    -d "$body" 2>&1
}

# ── Internal: extract the `mcp-session-id` response header (case-insensitive,
# CRLF-stripped) from a raw curl -i blob. Prints empty string if absent. ─────
_mcp_gateway_session_id() {
  printf '%s\n' "$1" | grep -i '^mcp-session-id:' | head -n1 | cut -d: -f2- | tr -d ' \r\n'
}

# ── Internal: strip HTTP response headers from a raw curl -i blob, printing
# only the body (everything after the first blank CRLF-terminated line). ────
_mcp_gateway_strip_headers() {
  printf '%s\n' "$1" | awk 'BEGIN{h=1} { gsub(/\r$/,""); if (h==1) { if ($0=="") { h=0 }; next } print }'
}

# ── Public: mcp_call_gateway_meta <tool_name> <json_args> ────────────────────
mcp_call_gateway_meta() {
  local tool_name="${1:-}"
  local args_json="${2:-}"
  [ -z "$args_json" ] && args_json='{}'

  if [ -z "$tool_name" ]; then
    echo "[mcp-call-gateway-meta] ERROR: tool_name is required" >&2
    return 2
  fi
  case "$tool_name" in
    list_servers|list_server_tools|search_tools) ;;
    *)
      echo "[mcp-call-gateway-meta] ERROR: '$tool_name' is not a gateway meta-tool (list_servers|list_server_tools|search_tools) — vn-market downstream tools use mcp_call(), not this function" >&2
      return 2
      ;;
  esac
  if ! command -v jq >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
    echo "[mcp-call-gateway-meta] ERROR: jq and curl are required" >&2
    return 2
  fi

  local url="${MCP_GATEWAY_URL:-https://zenmidi.com/gateway/mcp}"
  local timeout_s="${MCP_CALL_TIMEOUT_S:-10}"
  local raw http_code session_id gw_rc

  # Step 1 — initialize (mints the session; nothing to send as session-id yet)
  raw=$(_mcp_call_gateway_curl "$url" \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"vn-market-repo-bash-bridge","version":"1.0"}}}' \
    "$timeout_s" "")
  gw_rc=$?
  if [ $gw_rc -ne 0 ]; then
    echo "[mcp-call-gateway-meta] ERROR: transport failure on initialize (tool=$tool_name): $(printf '%s' "$raw" | tail -c 200)" >&2
    return 1
  fi
  http_code=$(printf '%s' "$raw" | tail -n1)
  case "$http_code" in
    2??) ;;
    *)
      echo "[mcp-call-gateway-meta] ERROR: HTTP $http_code on initialize (tool=$tool_name): $(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-200)" >&2
      return 1
      ;;
  esac
  session_id=$(_mcp_gateway_session_id "$raw")
  if [ -z "$session_id" ]; then
    echo "[mcp-call-gateway-meta] ERROR: no mcp-session-id header on initialize response (tool=$tool_name)" >&2
    return 1
  fi

  # Step 2 — notifications/initialized (one-way; expects 202, empty body)
  raw=$(_mcp_call_gateway_curl "$url" '{"jsonrpc":"2.0","method":"notifications/initialized"}' "$timeout_s" "$session_id")
  gw_rc=$?
  if [ $gw_rc -ne 0 ]; then
    echo "[mcp-call-gateway-meta] ERROR: transport failure on notifications/initialized (tool=$tool_name): $(printf '%s' "$raw" | tail -c 200)" >&2
    return 1
  fi
  http_code=$(printf '%s' "$raw" | tail -n1)
  case "$http_code" in
    2??) ;;
    *)
      echo "[mcp-call-gateway-meta] ERROR: HTTP $http_code on notifications/initialized (tool=$tool_name): $(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-200)" >&2
      return 1
      ;;
  esac

  # Step 3 — tools/call (the actual meta-tool invocation, same session-id reused)
  local call_body
  call_body=$(jq -n --arg name "$tool_name" --argjson args "$args_json" \
    '{jsonrpc:"2.0", id:2, method:"tools/call", params:{name:$name, arguments:$args}}' 2>/dev/null)
  if [ -z "$call_body" ]; then
    echo "[mcp-call-gateway-meta] ERROR: failed to build request body (malformed args_json for tool=$tool_name)" >&2
    return 2
  fi
  raw=$(_mcp_call_gateway_curl "$url" "$call_body" "$timeout_s" "$session_id")
  gw_rc=$?
  if [ $gw_rc -ne 0 ]; then
    echo "[mcp-call-gateway-meta] ERROR: transport failure on tools/call (tool=$tool_name): $(printf '%s' "$raw" | tail -c 200)" >&2
    return 1
  fi
  http_code=$(printf '%s' "$raw" | tail -n1)
  case "$http_code" in
    2??)
      _mcp_call_parse "$(_mcp_gateway_strip_headers "$(printf '%s' "$raw" | sed '$d')")" "$tool_name"
      return $?
      ;;
    *)
      echo "[mcp-call-gateway-meta] ERROR: HTTP $http_code on tools/call (tool=$tool_name): $(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-200)" >&2
      return 1
      ;;
  esac
}

# ── Standalone CLI mode (only when executed directly, not sourced) ───────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [ $# -lt 1 ]; then
    echo "usage: mcp-call.sh <tool_name> [json_args]" >&2
    exit 2
  fi
  mcp_call "$1" "${2:-}"
  exit $?
fi
