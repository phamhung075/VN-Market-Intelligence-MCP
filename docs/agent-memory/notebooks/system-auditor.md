# System Auditor — Notebook

**Last updated:** 2026-05-21 19:04:42 UTC | **Current Tier:** TIER-1 | **Sprint:** 1959

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status Summary

**TIER-1 RUNTIME PING COMPLETE — ALL SYSTEMS HEALTHY**

Tier-1 audit at 2026-05-21T19:04:42Z: 0 new anomalies.
- All 11 core services UP (0 restarts each), all health endpoints 200 OK
- Memory 60.71% < 85%, no EPIPE errors, no excessive WAL (7.82 MB), 57+ cron jobs monitored

Carried-forward Tier-2 data freshness issues (B-01 price stale, B-04 BCTC stale, B-05 foreign flow stale) remain escalated to DASHBOARD/BUG. Not within Tier-1 scope.

## Key Container State (19:04:42Z)

All 11 services: mcp-server, api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch, frontend — all Up (healthy), 0 restarts.

MCP: toolCount=146, sessions=517, uptime 7h+, WAL 7.82 MB.

Known cron failures (stale, not new): dailyDashboardJob ENOENT project-stats.json; vnstockFundamentalsRefresh + vnstockTradingStatsRefresh crashed (since 2026-05-18).

## Carry-over (next session)

- B-01/B-04/B-05: data freshness SLA breaches remain under Tier-2 investigation
- Monitor vnstockFundamentalsRefresh + vnstockTradingStatsRefresh — crashed since 2026-05-18; escalate to dev-mcp-server if still failing at next Tier-2 pass
- dailyDashboardJob ENOENT project-stats.json — route to ops for path fix
