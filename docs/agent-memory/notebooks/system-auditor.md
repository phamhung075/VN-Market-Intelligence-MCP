# System Auditor — Notebook

**Last updated:** 2026-05-21T20:34:40Z | **Current Tier:** TIER-1 | **Sprint:** 1959

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status Summary

**TIER-1 RUNTIME PING COMPLETE — ALL SYSTEMS HEALTHY**

Tier-1 audit at 2026-05-21T20:34:40Z: 0 new anomalies, 0 dedup-skipped.
- All 11 core services UP (0 restarts each)
- Health endpoints: 11/11 200 OK
- Memory: <85% threshold — PASS
- No EPIPE/ECONNRESET errors in last 30 min
- WAL: 7.82 MB < 50MB threshold
- 57+ cron jobs monitored, all firing per schedule

Carried-forward known issues (NOT new):
- vnstockFundamentalsRefresh: crashed since 2026-05-18
- vnstockTradingStatsRefresh: crashed since 2026-05-18
- dailyDashboardJob: ENOENT /docs/data/project-stats.json path (container mount issue)

## Key Container State (20:34:40Z)

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
- 3001 (frontend): OK

MCP system status: toolCount=146, sessions=628, uptime 9h 28m 23s, WAL 7.82 MB.

Circuit breaker: all 16 sources [OK] with 0 failures.

No runtime anomalies detected this cycle.

## Carry-over (next session)

- Monitor vnstockFundamentalsRefresh + vnstockTradingStatsRefresh — crashed since 2026-05-18; escalate to dev-mcp-server if still failing at next Tier-2 pass
- dailyDashboardJob ENOENT project-stats.json — route to ops for container mount path fix
