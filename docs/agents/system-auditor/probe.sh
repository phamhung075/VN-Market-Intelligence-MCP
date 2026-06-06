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
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:${port}${path}" 2>/dev/null) || http_code="CURL_ERR"
  if [ "$http_code" = "200" ]; then
    echo "[health] ${svc}:${port}${path} OK (HTTP ${http_code})"
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

# ── Disk space ───────────────────────────────────────────────────────────────
echo "--- disk df -h / ---"
df -h / 2>&1 || echo "[PROBE] df FAILED: $?"
echo ""

echo "=== PROBE DONE ==="
exit 0
