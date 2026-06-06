#!/usr/bin/env bash
# docs/agents/system-auditor/probe.sh
# READ-ONLY deterministic evidence collector for Tier-1 audit.
# NO mutations: no stop/start/restart/rm. Failures are evidence — print them, exit 0.
# SSOT: docs/data/system-map.json .project.infrastructure.docker.host_runtime_set

set -euo pipefail
echo "=== AUDITOR PROBE $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
echo ""

# ── Container status (host_runtime_set per system-map.json) ──────────────────
echo "--- docker ps -a ---"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.RunningFor}}" 2>&1 || echo "[PROBE] docker ps FAILED: $?"
echo ""

# ── Health endpoints (ports from system-map.json .project.microservices[]) ──
echo "--- health endpoints ---"
for svc_port in \
  "mcp-server:3000" \
  "api-gateway:4000" \
  "macro-indicators:5004" \
  "pdf-extractor:5001" \
  "frontend:3001"; do
  svc="${svc_port%%:*}"
  port="${svc_port##*:}"
  result=$(curl -sf --max-time 3 "http://localhost:${port}/health" 2>&1) && \
    echo "[health] ${svc}:${port} OK: ${result:0:80}" || \
    echo "[health] ${svc}:${port} FAIL (exit $?)"
done
echo ""

# ── Restart count (mcp-server) ───────────────────────────────────────────────
echo "--- restart count ---"
docker inspect mcp-server --format "RestartCount={{.RestartCount}}" 2>&1 || echo "[PROBE] docker inspect FAILED: $?"
echo ""

# ── Memory pressure (mcp-server) ─────────────────────────────────────────────
echo "--- memory pressure ---"
docker stats --no-stream mcp-server --format "MemPerc={{.MemPerc}} MemUsage={{.MemUsage}}" 2>&1 || echo "[PROBE] docker stats FAILED: $?"
echo ""

# ── Disk space ───────────────────────────────────────────────────────────────
echo "--- disk df -h / ---"
df -h / 2>&1 || echo "[PROBE] df FAILED: $?"
echo ""

echo "=== PROBE DONE ==="
exit 0
