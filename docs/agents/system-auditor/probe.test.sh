#!/usr/bin/env bash
# docs/agents/system-auditor/probe.test.sh
#
# Regression test for FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE (A2) —
# exercises _classify_curl_exit() in isolation via `source` (the standalone-
# execution guard in probe.sh prevents the real docker/curl probe body from
# running when sourced, same pattern as scripts/emit-audit-signal.test.sh /
# scripts/agents-flow/auditor-tier1-probe.test.sh). NO real docker/network
# calls are made by this test.
#
# Run:
#   bash docs/agents/system-auditor/probe.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROBE_SH="$SCRIPT_DIR/probe.sh"

if [ ! -f "$PROBE_SH" ]; then
  echo "ERROR: probe script not found at $PROBE_SH" >&2
  exit 1
fi

PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label (expected='$expected' actual='$actual')"
    FAIL=$((FAIL + 1))
  fi
}

# Source the script under test — the guard (`[[ "${BASH_SOURCE[0]}" == "${0}" ]]`)
# means the real docker/curl probe body does NOT execute here, only the
# function definitions above it (SCRIPT_DIR/REPO_ROOT resolution +
# _classify_curl_exit) run.
# shellcheck source=./probe.sh
source "$PROBE_SH"

# ── T1-T5: the 4 named curl exit codes from architecture brief §3 + the
# catch-all fallback for an unrecognized code ──────────────────────────────
check "T1 exit=28 -> CLIENT_TIMEOUT" "CLIENT_TIMEOUT" "$(_classify_curl_exit 28)"
check "T2 exit=7 -> CONN_REFUSED"    "CONN_REFUSED"   "$(_classify_curl_exit 7)"
check "T3 exit=6 -> DNS_FAIL"        "DNS_FAIL"       "$(_classify_curl_exit 6)"
check "T4 exit=52 -> EMPTY_REPLY"    "EMPTY_REPLY"    "$(_classify_curl_exit 52)"
check "T5 exit=99 (unrecognized) -> CURL_ERR_99" "CURL_ERR_99" "$(_classify_curl_exit 99)"

# ── T6: never collapses two DISTINCT codes to the SAME opaque token — the
# exact regression this task exists to close (previously every one of these
# printed the identical literal string "CURL_ERR") ─────────────────────────
r28=$(_classify_curl_exit 28)
r7=$(_classify_curl_exit 7)
r6=$(_classify_curl_exit 6)
r52=$(_classify_curl_exit 52)
if [ "$r28" != "$r7" ] && [ "$r7" != "$r6" ] && [ "$r6" != "$r52" ] && [ "$r28" != "$r6" ] && [ "$r28" != "$r52" ] && [ "$r7" != "$r52" ]; then
  echo "PASS: T6 all 4 named codes classify to mutually distinct reasons"
  PASS=$((PASS + 1))
else
  echo "FAIL: T6 two named codes collapsed to the same reason ($r28/$r7/$r6/$r52)"
  FAIL=$((FAIL + 1))
fi

# ── T7: sourcing probe.sh must NOT execute the real probe body (no stray
# "=== AUDITOR PROBE" banner, no docker/curl calls against localhost) — this
# is what the standalone-execution guard exists to prove ──────────────────
SOURCE_OUTPUT=$(bash -c "source '$PROBE_SH'; echo SOURCE_OK" 2>&1)
case "$SOURCE_OUTPUT" in
  *"AUDITOR PROBE"*)
    echo "FAIL: T7 sourcing probe.sh ran the real probe body (guard did not prevent it)"
    FAIL=$((FAIL + 1))
    ;;
  *"SOURCE_OK"*)
    echo "PASS: T7 sourcing probe.sh only defines functions, does not run the probe body"
    PASS=$((PASS + 1))
    ;;
  *)
    echo "FAIL: T7 unexpected output sourcing probe.sh: $SOURCE_OUTPUT"
    FAIL=$((FAIL + 1))
    ;;
esac

# ── T8-T13: A-30 per-container investigate-gate (FIX-AUDITOR-TIER1-A30-MEM-
# SINGLE-CONTAINER-SCOPE, po_redispatch_ruling_20260808T1445Z, AC7) ─────────
# _a30_gate_decision() / _a30_resolve_capped_containers() / _a30_invoke_deep_
# probe() / _a30_run_investigate_gate() are all defined outside the
# standalone-execution guard (same reason _classify_curl_exit is) — sourcing
# above already pulled them in. NO real docker/subprocess calls: `docker` is
# stubbed as a shell function and A30_DEEP_PROBE_CMD overrides the real
# verify-a30-mcp-memory-reclamation.sh subprocess with a marker-only stub
# (that script has its own, separately-verified test suite — this file only
# proves the per-container ENGAGE/SKIP decision, never re-tests verdict
# logic that belongs to the other script).

# T8: pure decision function in isolation — no docker involved.
check "T8 gate_decision 84.75% -> SKIP"  "SKIP"   "$(_a30_gate_decision 84.75)"
check "T9 gate_decision 85.00% -> ENGAGE" "ENGAGE" "$(_a30_gate_decision 85.00)"
check "T9b gate_decision 92.81% -> ENGAGE" "ENGAGE" "$(_a30_gate_decision 92.81)"

# T10: _a30_resolve_capped_containers() skips the uncapped container
# (HostConfig.Memory==0) and lists only the two capped ones.
docker() {
  local sub="$1"; shift
  case "$sub" in
    ps)
      [ "${1:-}" = "-q" ] && { printf 'id-mcp\nid-rag\nid-gw\n'; return 0; }
      return 0
      ;;
    inspect)
      printf '/vn-market-intelligence-mcp-mcp-server-1 3221225472\n'
      printf '/vn-market-intelligence-mcp-rag-service-1 1073741824\n'
      printf '/vn-market-intelligence-mcp-mcp-gateway-1 0\n'
      return 0
      ;;
    *) return 1 ;;
  esac
}
RESOLVED="$(_a30_resolve_capped_containers)"
check "T10 resolve_capped_containers names mcp-server" "true" \
  "$([[ "$RESOLVED" == *"vn-market-intelligence-mcp-mcp-server-1"* ]] && echo true || echo false)"
check "T10 resolve_capped_containers names rag-service" "true" \
  "$([[ "$RESOLVED" == *"vn-market-intelligence-mcp-rag-service-1"* ]] && echo true || echo false)"
check "T10 resolve_capped_containers SKIPS uncapped mcp-gateway (cap=0)" "true" \
  "$([[ "$RESOLVED" != *"mcp-gateway"* ]] && echo true || echo false)"

# ── T11-T13 (AC7, DECISIVE): replay the exact c51/c53 matched-pair condition
# — mcp-server BELOW its own 85% gate, rag-service INDEPENDENTLY at/above it
# — and prove the widened per-container gate engages for rag-service and
# names it, where the OLD single-container gate (mcp-server-only baseline)
# would have skipped the whole fleet and left rag-service invisible. ──────
docker() {
  local sub="$1"; shift
  case "$sub" in
    ps)
      [ "${1:-}" = "-q" ] && { printf 'id-mcp\nid-rag\n'; return 0; }
      return 0
      ;;
    inspect)
      printf '/vn-market-intelligence-mcp-mcp-server-1 3221225472\n'
      printf '/vn-market-intelligence-mcp-rag-service-1 1073741824\n'
      return 0
      ;;
    stats)
      # NOTE: docker stats' own {{.Name}} field has NO leading slash (unlike
      # docker inspect's {{.Name}}, which does — _a30_resolve_capped_
      # containers strips it, matching real docker's own inconsistency here).
      printf 'vn-market-intelligence-mcp-mcp-server-1\t84.75%%\n'
      printf 'vn-market-intelligence-mcp-rag-service-1\t92.81%%\n'
      return 0
      ;;
    *) return 1 ;;
  esac
}
# _stub_deep_probe echoes its own marker to STDOUT rather than mutating a
# variable — _a30_run_investigate_gate is captured via $(...) below, which
# always forks a subshell, so a variable mutated inside would be silently
# discarded on return (same class of pitfall documented in verify-a30-mcp-
# memory-reclamation.test.sh's own header re: its file-based call counter).
_stub_deep_probe() { echo "ENGAGED:$1"; }
A30_DEEP_PROBE_CMD="_stub_deep_probe"
GATE_OUT="$(_a30_run_investigate_gate)"

check "T11 c51/c53 replay: mcp-server (84.75%% < 85%%) -> SKIP line present" "true" \
  "$([[ "$GATE_OUT" == *"SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 84.75%"* ]] && echo true || echo false)"
check "T12 c51/c53 replay: rag-service (92.81%% >= 85%%) -> ENGAGE line present, names rag-service" "true" \
  "$([[ "$GATE_OUT" == *"vn-market-intelligence-mcp-rag-service-1: baseline 92.81% >= 85% investigate-gate — ENGAGE deep-probe"* ]] && echo true || echo false)"
check "T13 c51/c53 replay: deep-probe subprocess actually invoked for rag-service, NOT mcp-server" "true" \
  "$([[ "$GATE_OUT" == *"ENGAGED:vn-market-intelligence-mcp-rag-service-1"* ]] && [[ "$GATE_OUT" != *"ENGAGED:vn-market-intelligence-mcp-mcp-server-1"* ]] && echo true || echo false)"

echo ""
echo "probe.test.sh: ${PASS} pass / ${FAIL} fail"
[ "$FAIL" -eq 0 ]
