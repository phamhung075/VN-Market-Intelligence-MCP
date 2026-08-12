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

# ── T14-T17 (FIX-AUDITOR-A30-DEEPPROBE-TRUNCATES-ON-SECOND-CONTAINER-RAG-
# SERVICE, 2026-08-12): parallel dispatch + per-container watchdog deadline.
# ROOT CAUSE this closes: the OLD _a30_run_investigate_gate invoked every
# ENGAGEd container's deep-probe SEQUENTIALLY and SYNCHRONOUSLY, so total
# wall time was sum(per-container time) — with 2+ ENGAGEd containers this
# exceeded tier1-probe.md's <120s wall-time target and whichever container
# was probed SECOND got killed by the caller's own external timeout with
# ZERO buffered output (notebook c41 RAW-PROBE: pdf-extractor 1st completed,
# rag-service 2nd truncated after only its ENGAGE line). T14 proves 2
# ENGAGEd containers' deep-probes now run CONCURRENTLY (wall time <<
# sum-of-durations). T15 proves a stub that never returns is watchdog-killed
# at its own deadline and emits the AC-3 structured INCONCLUSIVE/truncated
# marker instead of vanishing. T16 proves PRINT order stays deterministic
# (engage order) even when the SLOWER container finishes LAST. T17 is the
# pure deadline-arithmetic unit check. Same c51/c53-shaped docker() stub
# (mcp-server + rag-service, both capped) reused from T10-T13 above,
# redeclared per block below (same pattern already used at each T-block
# boundary in this file — `stats` %-percentages here are deliberately both
# >=85% so BOTH containers ENGAGE, unlike T11-T13's single-engage replay).
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
      printf 'vn-market-intelligence-mcp-mcp-server-1\t90.00%%\n'
      printf 'vn-market-intelligence-mcp-rag-service-1\t90.00%%\n'
      return 0
      ;;
    *) return 1 ;;
  esac
}

# T14: both containers' stub sleeps 3s each. Sequential (the pre-fix shape)
# would take >=6s; concurrent must take well under that.
_stub_3s() { sleep 3; echo "ENGAGED:$1"; }
A30_DEEP_PROBE_CMD="_stub_3s"
T14_START=$(date +%s)
T14_OUT="$(_a30_run_investigate_gate)"
T14_END=$(date +%s)
T14_ELAPSED=$((T14_END - T14_START))
check "T14 parallel dispatch: 2x3s deep-probes complete in <5s wall (sequential would need >=6s; got ${T14_ELAPSED}s)" "true" \
  "$([ "$T14_ELAPSED" -lt 5 ] && echo true || echo false)"
check "T14b both containers' output present after concurrent run" "true" \
  "$([[ "$T14_OUT" == *"ENGAGED:vn-market-intelligence-mcp-mcp-server-1"* ]] && [[ "$T14_OUT" == *"ENGAGED:vn-market-intelligence-mcp-rag-service-1"* ]] && echo true || echo false)"

# T15: force a SHORT deadline (probes=1,interval=1,margin=1 -> deadline=1s)
# and a stub that sleeps far longer than that -> must be watchdog-killed and
# emit the AC-3 structured marker, never silently vanish (this is the exact
# defect this task exists to close: a truncated container with no output).
A30_DEEP_PROBE_PROBES=1
A30_DEEP_PROBE_INTERVAL=1
A30_DEEP_PROBE_DEADLINE_MARGIN_SEC=1
_stub_hang() { sleep 10; echo "SHOULD_NOT_APPEAR:$1"; }
A30_DEEP_PROBE_CMD="_stub_hang"
T15_START=$(date +%s)
T15_OUT="$(_a30_run_investigate_gate)"
T15_END=$(date +%s)
T15_ELAPSED=$((T15_END - T15_START))
check "T15 watchdog kills hung deep-probe well before its 10s sleep completes (elapsed ${T15_ELAPSED}s)" "true" \
  "$([ "$T15_ELAPSED" -lt 8 ] && echo true || echo false)"
check "T15b AC-3 structured marker present (verdict INCONCLUSIVE)" "true" \
  "$([[ "$T15_OUT" == *'"verdict":"INCONCLUSIVE"'* ]] && echo true || echo false)"
check "T15c AC-3 marker carries truncated:true" "true" \
  "$([[ "$T15_OUT" == *'"truncated":true'* ]] && echo true || echo false)"
check "T15d hung stub's own echo never reached stdout (proves the process was actually killed, not just abandoned)" "true" \
  "$([[ "$T15_OUT" != *"SHOULD_NOT_APPEAR"* ]] && echo true || echo false)"
# restore defaults for subsequent tests
A30_DEEP_PROBE_PROBES=6
A30_DEEP_PROBE_INTERVAL=13
A30_DEEP_PROBE_DEADLINE_MARGIN_SEC=30

# T16: deterministic print order — rag-service's stub is SLOWER than
# mcp-server's (2s vs 0.2s), so it finishes LAST, but engage-order
# (mcp-server first, per the docker stats stub order above) must still be
# the PRINT order — proves "parallel EXECUTION" did not also make output
# ORDER nondeterministic for downstream parsers (tier1-probe.md).
_stub_order() {
  case "$1" in
    *rag-service*) sleep 2 ;;
    *) sleep 0.2 ;;
  esac
  echo "ORDERMARK:$1"
}
A30_DEEP_PROBE_CMD="_stub_order"
T16_OUT="$(_a30_run_investigate_gate)"
MCP_POS=$(printf '%s\n' "$T16_OUT" | grep -n "ORDERMARK:vn-market-intelligence-mcp-mcp-server-1" | cut -d: -f1 | head -1)
RAG_POS=$(printf '%s\n' "$T16_OUT" | grep -n "ORDERMARK:vn-market-intelligence-mcp-rag-service-1" | cut -d: -f1 | head -1)
check "T16 print order stays engage-order (mcp-server before rag-service) even though rag-service (slower) finishes last" "true" \
  "$([ -n "$MCP_POS" ] && [ -n "$RAG_POS" ] && [ "$MCP_POS" -lt "$RAG_POS" ] && echo true || echo false)"

# T17: pure deadline arithmetic — no docker/subprocess involved.
A30_DEEP_PROBE_PROBES=6
A30_DEEP_PROBE_INTERVAL=13
A30_DEEP_PROBE_DEADLINE_MARGIN_SEC=30
check "T17 deadline_sec(probes=6,interval=13,margin=30) == 95 ((6-1)*13+30)" "95" "$(_a30_deep_probe_deadline_sec)"

echo ""
echo "probe.test.sh: ${PASS} pass / ${FAIL} fail"
[ "$FAIL" -eq 0 ]
