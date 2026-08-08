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

# ── A-30 investigate-gate: PER-CONTAINER decision (FIX-AUDITOR-TIER1-A30-
# MEM-SINGLE-CONTAINER-SCOPE, po_redispatch_ruling_20260808T1445Z) ──────────
# ROOT CAUSE this closes: the OLD gate below computed ONE baseline (mcp-
# server's own MemPerc) and let it decide, for the WHOLE fleet, whether the
# A-30 deep-probe ran this cycle — rag-service was never independently
# sampled regardless of its own condition. DEMONSTRATED live, same-day
# matched pair 29min apart: c51 14:04:04Z mcp-server 89.69% (>=85) -> gate
# ENGAGED -> rag-service named, 96.91% BELOW-FLOOR, DEGRADED; c53 14:33:16Z
# mcp-server 84.75% (<85) -> gate SKIPPED -> rag-service line ABSENT
# entirely, ALL_GREEN, despite rag independently sitting at 92.81-98.78% the
# whole time. The ONLY variable that changed was mcp-server's own percentage
# crossing 85. Fixed by evaluating the gate PER CONTAINER: every RUNNING,
# memory-capped container gets its OWN baseline sample and its OWN
# ENGAGE/SKIP decision, entirely independent of every other container's.
#
# Defined OUTSIDE the standalone-execution guard below (same reason
# _classify_curl_exit is) so a test harness can source this file and call
# these functions directly against a stubbed `docker`, replaying the c51/c53
# matched pair and proving per-container independence, without spawning a
# real deep-probe subprocess — see docs/agents/system-auditor/probe.test.sh.

# Pure decision, no docker/subprocess calls — testable in isolation.
_a30_gate_decision() {
  local pct="$1"
  if awk -v p="${pct:-0}" 'BEGIN{exit !(p>=85)}'; then
    echo "ENGAGE"
  else
    echo "SKIP"
  fi
}

# Every RUNNING container that declares a memory cap, resolved LIVE from the
# daemon (never a hardcoded name list, never docker-compose.yml — config-
# truth drifts from runtime-truth, see this row's own root_cause). Uncapped
# containers (HostConfig.Memory==0, e.g. mcp-gateway) are skipped: their
# MemPerc is against total HOST memory, not a per-container headroom signal,
# and is not comparable against the 85% gate. Same live resolution PLANE A's
# _check_mem_creep() already uses (scripts/agents-flow/auditor-tier1-
# probe.sh) — kept independent here (not sourced) since this loop has no
# other dependency on that file and probe.sh already owns its own REPO_ROOT
# seam.
_a30_resolve_capped_containers() {
  local ids inspect_out name cap
  ids=$(docker ps -q 2>/dev/null)
  [ -z "$ids" ] && return 1
  # shellcheck disable=SC2086
  inspect_out=$(docker inspect -f '{{.Name}} {{.HostConfig.Memory}}' $ids 2>/dev/null)
  [ -z "$inspect_out" ] && return 1
  while read -r name cap; do
    [ -z "$name" ] && continue
    name="${name#/}"
    case "$cap" in ''|*[!0-9]*) continue ;; esac
    [ "$cap" -eq 0 ] && continue
    printf '%s\n' "$name"
  done <<< "$inspect_out"
}

# Invokes the deep-probe subprocess for one container. A30_DEEP_PROBE_CMD is
# a TEST-ONLY override seam (default: real subprocess call) — production
# callers never set it. probe.test.sh sets it to a stub function so a
# fixture can assert WHICH containers engaged without spawning a real
# docker/bash subprocess (verify-a30-mcp-memory-reclamation.sh has its own,
# separately-verified test suite — this loop's job is only the per-container
# ENGAGE/SKIP decision, not re-testing that script's own verdict logic).
_a30_invoke_deep_probe() {
  local ctr="$1"
  if [ -n "${A30_DEEP_PROBE_CMD:-}" ]; then
    "$A30_DEEP_PROBE_CMD" "$ctr"
    return $?
  fi
  CONTAINER="$ctr" bash "$REPO_ROOT/scripts/audits/verify-a30-mcp-memory-reclamation.sh" 6 13
}

# Full gate: every capped, running container samples its OWN baseline and is
# ENGAGE/SKIP'd independently. Prints one line per SKIPped container, or the
# deep-probe subprocess's own JSON block per ENGAGEd one — tier1-probe.md's
# A-30 section parses however many JSON blocks appear (zero, one, or many),
# never assuming exactly zero or one the way the old single-container gate
# implicitly did.
_a30_run_investigate_gate() {
  local ctr pct decision
  while IFS= read -r ctr; do
    [ -z "$ctr" ] && continue
    pct=$(docker stats --no-stream --format '{{.Name}}\t{{.MemPerc}}' 2>/dev/null \
          | awk -v c="$ctr" -F'\t' '$1==c {gsub(/%/,"",$2); print $2}')
    if [ -z "$pct" ]; then
      echo "[A-30] ${ctr}: baseline probe FAILED — stats unavailable"
      continue
    fi
    decision=$(_a30_gate_decision "$pct")
    if [ "$decision" = "ENGAGE" ]; then
      echo "[A-30] ${ctr}: baseline ${pct}% >= 85% investigate-gate — ENGAGE deep-probe"
      _a30_invoke_deep_probe "$ctr" || echo "[A-30] ${ctr}: deep-probe subprocess FAILED: $?"
    else
      echo "[A-30] SKIP deep-probe — ${ctr} baseline ${pct}% < 85% investigate-gate"
    fi
  done < <(_a30_resolve_capped_containers)
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
# OOMKilled check, no VmHWM/VmRSS check). For EVERY running, memory-capped
# container whose own baseline sample is ≥85% (FIX-AUDITOR-TIER1-A30-MEM-
# SINGLE-CONTAINER-SCOPE, po_redispatch_ruling_20260808T1445Z: the gate is
# now evaluated PER CONTAINER — see _a30_run_investigate_gate() above for the
# c51/c53 matched-pair evidence this closes), engage the existing multi-probe
# discriminator (scripts/audits/verify-a30-mcp-memory-reclamation.sh — 6
# probes/13s spacing, state re-read before+after the window, OOMKilled/
# ExitCode+FinishedAt death signatures, discontinuity vs jitter-dip
# classification, VmHWM-vs-cgroup-cap gated behind its own host-side headroom
# pre-check — see FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-
# RECLAMATION-DIP + this row's Amendments A/B) as a subprocess, once per
# breaching container. Each subprocess's verdict/reason JSON is that
# container's own SELF-CONTAINED evidence bundle — tier1-probe.md's A-30
# override section parses however many JSON blocks appear this cycle (zero,
# one, or many); this script never compares across cycles or across
# containers.
echo "--- memory pressure multi-probe reclamation (A-30) ---"
_a30_run_investigate_gate
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
