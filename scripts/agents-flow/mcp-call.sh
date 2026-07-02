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

# ── Standalone CLI mode (only when executed directly, not sourced) ───────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [ $# -lt 1 ]; then
    echo "usage: mcp-call.sh <tool_name> [json_args]" >&2
    exit 2
  fi
  mcp_call "$1" "${2:-}"
  exit $?
fi
