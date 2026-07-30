#!/usr/bin/env bash
# docs/agents/system-auditor/probe.sh
# READ-ONLY deterministic evidence collector for Tier-1 audit.
# NO mutations: no stop/start/restart/rm. Failures are evidence — print them, exit 0.
# SSOT: docs/data/system-map.json .project.infrastructure.docker.host_runtime_set
#
# Probe paths aligned to capability_manifest (verified 2026-06-06):
#   mcp-server:3000   /health (200)
#   api-gateway:4000  /health (200)
#   macro-indicators:5004 /health (200)
#   pdf-extractor:5001    /health (200)
#   frontend:3001     /     (200) — no /health route, root serves 200
#
# Container names: docker ps uses full compose names (vn-market-intelligence-mcp-<svc>-1).
# Derived dynamically via docker ps filter — never hardcoded short names.

# ── Portable path resolution (mirrors scripts/emit-audit-signal.sh) ──────────
# Never rely on CWD-is-repo-root-at-invocation — this script must resolve its
# own REPO_ROOT so the A-30 deep-probe subprocess call below works regardless
# of caller CWD. Deliberately OUTSIDE the standalone-execution guard below —
# harmless to compute even when this file is sourced for unit-testing
# _classify_curl_exit().
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ── A2 (FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE, 2026-07-30) ─────────
# Classify curl's own exit code instead of collapsing every transport
# failure mode into one opaque CURL_ERR token. Mirrors
# docs/architecture-briefs/2026-07-29-apigw-health-capability-probe-latency.md
# §3 verbatim. Defined OUTSIDE the standalone-execution guard below so a test
# harness can `source` this file (which, thanks to that guard, does NOT run
# the real docker/curl probe body) and call this function directly with
# synthetic exit codes — see docs/agents/system-auditor/probe.test.sh.
_classify_curl_exit() {
  case "$1" in
    28) echo "CLIENT_TIMEOUT" ;;
    7)  echo "CONN_REFUSED" ;;
    6)  echo "DNS_FAIL" ;;
    52) echo "EMPTY_REPLY" ;;
    *)  echo "CURL_ERR_$1" ;;
  esac
}

# ── Standalone execution guard ────────────────────────────────────────────────
# Same pattern already used by scripts/emit-audit-signal.sh and
# scripts/agents-flow/auditor-tier1-probe.sh: the real evidence-collector body
# below only runs when this file is EXECUTED directly
# (bash docs/agents/system-auditor/probe.sh — unchanged real invocation, every
# existing caller unaffected), never when sourced by a test harness for
# _classify_curl_exit() above. `set -euo pipefail` is scoped to this guarded
# block only, so sourcing this file for the unit test must not mutate the
# sourcing test script's own shell options.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
set -euo pipefail

echo "=== AUDITOR PROBE $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
echo ""

# ── Container status (host_runtime_set per system-map.json) ──────────────────
echo "--- docker ps -a ---"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.RunningFor}}" 2>&1 || echo "[PROBE] docker ps FAILED: $?"
echo ""

# ── Health endpoints (ports + probe paths from system-map.json) ──────────────
# Format: "label:port:path:expected_status"
# frontend has no /health route — probe root (/) which returns 200.
#
# FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE (2026-07-30):
# A1 — --max-time raised 3s->5s (client-budget FLOOR ONLY — the cheap,
#      immediate half). Router's 2026-07-29T09:05-09:12Z 23-sample
#      re-measurement (architecture brief §6a) put the highest live
#      api-gateway /health latency at 3780ms; 5000ms clears that with ~32%
#      margin while adding at most 2s of Tier-1 wall time (not the
#      theoretical ~24s Half-B-sized worst case), and only on an endpoint
#      that actually times out. The OTHER A1 half — repointing this probe
#      target at the new /healthz liveness route — stays soft-blocked on
#      FIX-APIGW-HEALTH-CAPABILITY-PROBE-GATE-PARALLEL-SINGLEFLIGHT's own
#      /healthz decoupling (still BACKLOG as of this task) — NOT done here,
#      the URL below is unchanged.
# A2 — capture curl's own exit code before the `||` fallback erases it, and
#      classify it via _classify_curl_exit() above (CLIENT_TIMEOUT/
#      CONN_REFUSED/DNS_FAIL/EMPTY_REPLY/CURL_ERR_<n>) instead of collapsing
#      every transport failure mode into one opaque CURL_ERR token (brief
#      §3). A real non-200 HTTP response (curl itself succeeded) is
#      UNCHANGED from before — still printed as "FAIL (HTTP <code>)"
#      verbatim, never routed through this classification: a genuine
#      application-level error is stronger evidence than an opaque
#      transport blip and was never the ambiguous case this fix targets.
# The N-consecutive debounce (A3) for transport-classified FAILs below is
# wired in the CONSUMER (docs/agents/system-auditor/flow/tier1-probe.md's
# own Health Endpoints section + tier1-overrides.md) — the only place any
# A-xx emit decision is made for this loop (this script never calls
# emit-audit-signal.sh itself, for ANY check, by existing design — A-20's
# own emit call below is likewise in tier1-probe.md, not here). Keeping the
# debounce out of this file keeps this collector single-shot per
# invocation, with zero added wall time and zero new persisted state here.
echo "--- health endpoints ---"
for entry in \
  "mcp-server:3000:/health" \
  "api-gateway:4000:/health" \
  "macro-indicators:5004:/health" \
  "pdf-extractor:5001:/health" \
  "frontend:3001:/"; do
  svc="${entry%%:*}"
  rest="${entry#*:}"
  port="${rest%%:*}"
  path="${rest#*:}"
  curl_exit=0
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:${port}${path}" 2>/dev/null) || curl_exit=$?
  if [ "$http_code" = "200" ]; then
    echo "[health] ${svc}:${port}${path} OK (HTTP ${http_code})"
  elif [ "$curl_exit" -ne 0 ]; then
    reason=$(_classify_curl_exit "$curl_exit")
    echo "[health] ${svc}:${port}${path} FAIL (${reason}, curl_exit=${curl_exit}, budget=5000ms)"
  else
    echo "[health] ${svc}:${port}${path} FAIL (HTTP ${http_code})"
  fi
done
echo ""

# ── Derive mcp-server full container name dynamically ────────────────────────
# Pattern: vn-market-intelligence-mcp-mcp-server-1 (compose project prefix)
MCP_CONTAINER=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep 'mcp-server' | head -1)
if [ -z "$MCP_CONTAINER" ]; then
  MCP_CONTAINER="mcp-server"  # fallback to short name
fi

# ── Restart count ─────────────────────────────────────────────────────────────
echo "--- restart count ---"
docker inspect "${MCP_CONTAINER}" --format "Container={{.Name}} RestartCount={{.RestartCount}}" 2>&1 || echo "[PROBE] docker inspect FAILED (container=${MCP_CONTAINER}): $?"
echo ""

# ── Memory pressure ───────────────────────────────────────────────────────────
echo "--- memory pressure ---"
docker stats --no-stream "${MCP_CONTAINER}" --format "Container={{.Name}} MemPerc={{.MemPerc}} MemUsage={{.MemUsage}}" 2>&1 || echo "[PROBE] docker stats FAILED (container=${MCP_CONTAINER}): $?"
echo ""

# ── Memory pressure multi-probe reclamation gate (A-30, FIX-AUDITOR-A12A20A30-
# FP-REEMIT-CONVERGE) — a single/2-point MemPerc snapshot is NEVER sufficient
# evidence for A-30 (root cause of the 07-23T03:42Z false CRITICAL: a bare
# 2-point, 30-minute-apart MemPerc delta with no multi-probe window, no
# OOMKilled check, no VmHWM/VmRSS check). When the fast baseline snapshot
# above is ≥85%, engage the existing, unmodified multi-probe discriminator
# (scripts/audits/verify-a30-mcp-memory-reclamation.sh — 6 probes/13s spacing,
# OOMKilled + VmHWM/VmRSS + reclamation-dip detection) as a subprocess. The
# verdict/reason JSON it prints is this cycle's SELF-CONTAINED evidence bundle
# — tier1-probe.md's A-30 override section interprets it; this script never
# compares across cycles.
echo "--- memory pressure multi-probe reclamation (A-30) ---"
BASELINE_PCT=$(docker stats --no-stream --format '{{.MemPerc}}' "${MCP_CONTAINER}" 2>/dev/null | tr -d '%') || { echo "[A-30] baseline probe FAILED (container=${MCP_CONTAINER}): $?"; BASELINE_PCT="0"; }
if awk -v p="${BASELINE_PCT:-0}" 'BEGIN{exit !(p>=85)}'; then
  # Tier-1 budget: 6 probes / 13s spacing = 65s span — the exact cadence already
  # validated live 07-19 ("6 probes/65s caught GC dips", per this row's own text).
  # CONTAINER override closes probe.sh's own dynamic-name-vs-hardcoded-default gap
  # (verify-a30's own default is a literal compose name; MCP_CONTAINER is derived).
  CONTAINER="$MCP_CONTAINER" bash "$REPO_ROOT/scripts/audits/verify-a30-mcp-memory-reclamation.sh" 6 13 || echo "[A-30] deep-probe subprocess FAILED (container=${MCP_CONTAINER}): $?"
else
  echo "[A-30] SKIP deep-probe — baseline ${BASELINE_PCT}% < 85% investigate-gate"
fi
echo ""

# ── Disk space ───────────────────────────────────────────────────────────────
echo "--- disk df -h / ---"
df -h / 2>&1 || echo "[PROBE] df FAILED: $?"
echo ""

# ── pdf-extractor in-container multi-probe (A-20, FIX-AUDITOR-A20-MULTIPROBE) ─
# Folded in from docs/agents/system-auditor/flow/tier1-probe.md (TOKEN-ECONOMY-
# TICK-PREFLIGHT WU-3, R9): probe.sh is the single SSOT evidence collector —
# the majority-vote verdict + signal-emit logic still live in tier1-probe.md
# (they make MCP calls; this script never does). A single host-side 200 is not
# sufficient to pass A-20 — a transient 200 between Tesseract runs masked real
# event-loop stalls (c103 false-green saga); 3 in-container exec probes with
# 5s spacing distinguish a live event loop from a wedged one (HTTP 000 = wedged).
echo "--- pdf-extractor in-container multi-probe (A-20) ---"
PDF_CTR=$(docker ps --format '{{.Names}}' 2>/dev/null | grep 'pdf-extractor' | head -1)
if [ -z "$PDF_CTR" ]; then
  echo "[A-20] SKIP in-container probes — pdf-extractor container not found (A-11 already CRITICAL)"
else
  pass_count=0
  for i in 1 2 3; do
    result=$(docker exec "$PDF_CTR" curl -s -o /dev/null -w "%{http_code}" -m 5 http://localhost:5001/health 2>/dev/null || echo "000")
    echo "[A-20-PROBE-${i}] in-container HTTP ${result}"
    [ "$result" = "200" ] && pass_count=$((pass_count + 1))
    [ "$i" -lt 3 ] && sleep 5
  done
  echo "[A-20] pass_count=${pass_count}/3"
fi
echo ""

echo "=== PROBE DONE ==="
exit 0

fi
