
---

## Cycle: 2026-05-08 GAP-8 Incident Diagnosis & Fix

**Incident**: Market-watcher + news-scout BLOCKED at 03:38, 04:38, 05:38 UTC (non-deterministic)

**Diagnosis**: 
- Docker health: All 9 containers UP
- MCP server: 3.83GB (50% of 7.6GB), 170% CPU, spawning parallel vnstock queries
- **Root cause**: No memory/CPU limits in docker-compose.yml → unbounded growth
- Gateway: 30s SSE timeout loops → cron sessions blocked

**Fix Applied**:
- Added `deploy.resources.limits/reservations` to all 9 services in docker-compose.yml
- mcp-server: 4GB limit/2GB reservation
- rag-service: 2GB limit/1GB reservation
- Others: 512MB limit/256MB reservation
- Services restarted clean, gateway SSE responsive

**Verification**:
✅ All 10 services healthy post-restart
✅ MCP server: 100.6MiB at startup (healthy)
✅ No timeout loops in gateway logs
✅ System memory pressure normalized

**Commit**: b932fcf9 (fix infra resource limits)

**Status**: RESOLVED. Monitor for 48h for regressions.

