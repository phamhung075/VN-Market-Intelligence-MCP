#!/usr/bin/env bash
# scripts/agents-flow/mcp-call.test.sh
#
# Regression test for FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-
# NOT-CONFIRMED-ROWS (AC-4): mcp_call()'s SSE-response parser (_mcp_call_parse)
# must treat an `Error:`-prefixed response TEXT as a failure even when the
# tool handler did not set `.result.isError` — confirmed live (2026-07-30)
# that post_agent_signal's generic catch-all does exactly this on a genuine
# DB-write throw, and this function previously returned rc=0 (success) with
# that text on stdout, which is how a caller (scripts/emit-audit-signal.sh's
# _run_e1()) miscounted a failed write as a successful post_agent_signal call.
#
# Stubs `_mcp_call_curl` (function-override after sourcing — same pattern as
# mcp-call-gateway-meta.test.sh) so NO real network calls are made anywhere in
# this suite.
#
# Run:
#   bash scripts/agents-flow/mcp-call.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS
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

TMPDIR_TEST=$(mktemp -d /private/tmp/mcp-call-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

STUB_SSE_BODY=""
STUB_HTTP_CODE="200"
STUB_CURL_RC=0

# ── Stub — overrides the real single-attempt curl helper. mcp_call() calls
# this once per candidate URL; returning rc=0 on the first URL means the
# second (fallback) URL is never tried. ─────────────────────────────────────
_mcp_call_curl() {
  if [ "$STUB_CURL_RC" -ne 0 ]; then
    echo "simulated transport failure"
    return "$STUB_CURL_RC"
  fi
  printf '%s\n%s\n' "$STUB_SSE_BODY" "$STUB_HTTP_CODE"
  return 0
}

sse_ok() {
  local text="$1"
  printf 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"%s"}]}}' "$text"
}

sse_iserror() {
  local text="$1"
  printf 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"isError":true,"content":[{"type":"text","text":"%s"}]}}' "$text"
}

reset_case() {
  STUB_SSE_BODY=""
  STUB_HTTP_CODE="200"
  STUB_CURL_RC=0
}

# ── T1: normal success, no Error: prefix, isError absent ────────────────────
reset_case
STUB_SSE_BODY=$(sse_ok "signal posted, id=42")
OUT1=$(mcp_call "post_agent_signal" '{}' 2>"$TMPDIR_TEST/t1.err")
RC1=$?
check "T1 normal-success exit=0" "$([ "$RC1" -eq 0 ] && echo true || echo false)"
check "T1 normal-success returns text" "$([ "$OUT1" = "signal posted, id=42" ] && echo true || echo false)"

# ── T2: isError=true (existing contract, unchanged) ─────────────────────────
reset_case
STUB_SSE_BODY=$(sse_iserror "explicit tool rejection")
mcp_call "post_agent_signal" '{}' >/dev/null 2>"$TMPDIR_TEST/t2.err"
RC2=$?
check "T2 isError=true non-zero exit" "$([ "$RC2" -ne 0 ] && echo true || echo false)"

# ── T3 (AC-4, the defect this task closes): Error:-prefixed text, isError
# NOT set — must now be treated as a failure, not silently returned as the
# "success" payload. ─────────────────────────────────────────────────────────
reset_case
STUB_SSE_BODY=$(sse_ok "Error: database disk image is malformed (simulated corrupt btree)")
mcp_call "post_agent_signal" '{}' >/dev/null 2>"$TMPDIR_TEST/t3.err"
RC3=$?
check "T3 error-text-no-isError non-zero exit" "$([ "$RC3" -ne 0 ] && echo true || echo false)"
check "T3 error-text-no-isError stderr mentions text-prefixed-error" "$(grep -q 'text-prefixed-error' "$TMPDIR_TEST/t3.err" && echo true || echo false)"

# ── T4: text merely CONTAINS the substring "error" but does not START with
# the literal "Error:" prefix — must NOT false-positive. ────────────────────
reset_case
STUB_SSE_BODY=$(sse_ok "0 errors found, all checks passed")
OUT4=$(mcp_call "post_agent_signal" '{}' 2>"$TMPDIR_TEST/t4.err")
RC4=$?
check "T4 substring-error-not-prefix exit=0" "$([ "$RC4" -eq 0 ] && echo true || echo false)"
check "T4 substring-error-not-prefix returns text unchanged" "$([ "$OUT4" = "0 errors found, all checks passed" ] && echo true || echo false)"

# ── T5: malformed JSON in SSE data (existing contract, unchanged) ───────────
reset_case
STUB_SSE_BODY='event: message
data: not-json-at-all'
mcp_call "post_agent_signal" '{}' >/dev/null 2>"$TMPDIR_TEST/t5.err"
RC5=$?
check "T5 malformed-json non-zero exit" "$([ "$RC5" -ne 0 ] && echo true || echo false)"

# ── T6: transport failure — both URLs exhausted (existing contract) ────────
reset_case
STUB_CURL_RC=7
mcp_call "post_agent_signal" '{}' >/dev/null 2>"$TMPDIR_TEST/t6.err"
RC6=$?
check "T6 transport-failure non-zero exit" "$([ "$RC6" -ne 0 ] && echo true || echo false)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
