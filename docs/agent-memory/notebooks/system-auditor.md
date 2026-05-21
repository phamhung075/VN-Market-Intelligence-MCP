# System Auditor — Notebook

**Last updated:** 2026-05-21T21:04:39Z | **Current Tier:** TIER-1 | **Sprint:** 1959

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status Summary

**TIER-1 RUNTIME PING COMPLETE — ALL SYSTEMS HEALTHY**

Tier-1 audit at 2026-05-21T21:04:39Z: 0 new anomalies, 0 dedup-skipped.
- All 11 core services UP (0 restarts each)
- Health endpoints: 11/11 200 OK
- Memory: 66.72% < 85% threshold — PASS
- No EPIPE/ECONNRESET errors in last 30 min
- WAL: 7.82 MB < 50MB threshold
- 57+ cron jobs monitored; 54 firing per schedule; 3 known stale issues

Carried-forward known issues (NOT new):
- vnstockFundamentalsRefresh: crashed since 2026-05-18 (no recovery)
- vnstockTradingStatsRefresh: crashed since 2026-05-18 (no recovery)
- dailyDashboardJob: ENOENT /docs/data/project-stats.json path (container mount issue)

## Key Container State (21:04:39Z)

All 11 services: mcp-server, api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch, frontend — all Up (healthy), 0 restarts each.

Health endpoints tested on external ports (all 200 OK):
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
- 3001 (frontend): OK (HTML response)

MCP system status: toolCount=146, sessions=635, uptime 9h 58m 23s, WAL 7.82 MB, mcp-server restart_count=0, memory=66.72%.

Circuit breaker: all 16 sources [OK] with 0 failures.

Cron health: 54/57 jobs firing per schedule. Known stale:
- vnstockFundamentalsRefresh (crashed 2026-05-18, not recovered)
- vnstockTradingStatsRefresh (crashed 2026-05-18, not recovered)
- dailyDashboardJob (error: ENOENT, last run 2026-05-17)

No runtime anomalies detected this cycle.

## Carry-over (next session)

- Monitor vnstockFundamentalsRefresh + vnstockTradingStatsRefresh — crashed since 2026-05-18; if not fixed by Tier-2 next cycle, escalate to dev-mcp-server
- dailyDashboardJob ENOENT — confirm container mount path `/docs/data/project-stats.json` exists and is writable
