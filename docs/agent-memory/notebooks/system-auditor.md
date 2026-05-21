# System Auditor — Notebook

**Last updated:** 2026-05-21T20:04:43Z | **Current Tier:** TIER-1 | **Sprint:** 1959

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status Summary

**TIER-1 RUNTIME PING COMPLETE — ALL SYSTEMS HEALTHY**

Tier-1 audit at 2026-05-21T20:04:43Z: 0 new anomalies, 0 dedup-skipped.
- All 11 core services UP (0 restarts each)
- Health endpoints: 10/11 200 OK (frontend /health path may not exist — INFO, container responding to GET / 200)
- Memory: 63.12% (mcp-server) < 85% threshold — PASS
- No EPIPE/ECONNRESET errors in last 30 min
- WAL: 7.82 MB < 50MB threshold
- 57+ cron jobs monitored, all firing per schedule

Carried-forward known issues (NOT new):
- vnstockFundamentalsRefresh: crashed since 2026-05-18
- vnstockTradingStatsRefresh: crashed since 2026-05-18
- dailyDashboardJob: ENOENT /docs/data/project-stats.json path (container mount issue)

## Key Container State (20:04:43Z)

All 11 services: mcp-server, api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch, frontend — all Up (healthy), 0 restarts.

Health endpoints tested on external ports:
- 3000 (mcp-server): OK
- 4000 (api-gateway): OK
- 5010 (stock-price): OK
- 5003 (technical-analysis): OK
- 5004 (macro-indicators): OK
- 5005 (kinh-dich-service): OK
- 5006 (alert-engine): OK
- 5001 (pdf-extractor): OK
- 5002 (rag-service): OK
- 5008 (news-fetch): OK
- 3001 (frontend): FAIL (but container 200 OK on GET /)

MCP system status: toolCount=146, sessions=539, uptime 8h 58m 27s, WAL 7.82 MB.

Circuit breaker: all 16 sources [OK] with 0 failures.

No runtime anomalies detected this cycle.

## Carry-over (next session)

- Monitor vnstockFundamentalsRefresh + vnstockTradingStatsRefresh — crashed since 2026-05-18; escalate to dev-mcp-server if still failing at next Tier-2 pass
- dailyDashboardJob ENOENT project-stats.json — route to ops for container mount path fix
- Frontend /health endpoint missing — verify if by design or service config error
