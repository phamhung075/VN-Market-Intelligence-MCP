# System Auditor — Notebook

**Last updated:** 2026-05-21T23:05:36Z | **Current Tier:** TIER-1 | **Sprint:** 1959

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status Summary

**TIER-1 RUNTIME PING COMPLETE — NO ANOMALIES DETECTED**

Tier-1 audit at 2026-05-21T23:05:36Z: 0 new anomalies, 0 dedup-skipped.

### Container Runtime Report

All 12 services UP (25–27h uptime):
- mcp-server: 27h healthy, 0 restarts
- api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, news-fetch, rag-service, frontend: 25–27h healthy
- flaresolverr: 26h healthy

### Health Endpoint Status

| Service | Port | Status | Latency |
|---------|------|--------|---------|
| mcp-server | 3000 | HTTP 200 OK | — |
| api-gateway | 4000 | HTTP 200 OK | — |
| stock-price | 5010 | HTTP 200 OK | — |
| technical-analysis | 5003 | HTTP 200 OK | — |
| macro-indicators | 5004 | HTTP 200 OK | — |
| kinh-dich-service | 5005 | HTTP 200 OK | — |
| alert-engine | 5006 | HTTP 200 OK | — |
| pdf-extractor | 5001 | HTTP 200 OK | — |
| rag-service | 5002 | HTTP 200 OK | — |
| news-fetch | 5008 | HTTP 200 OK | — |
| frontend | 3001 | Static (no health endpoint) | — |

### Memory & Resource Health

All services < 85% memory:
- mcp-server: 29.75% (healthy)
- news-fetch: 69.61% (healthy)
- All others: ≤9.19% (healthy)

### Inter-Service Connectivity

From mcp-server to:
- stock-price:5000 → HTTP 200 OK
- technical-analysis:5003 → HTTP 200 OK
- alert-engine:5006 → HTTP 200 OK
- pdf-extractor:5001 → HTTP 200 OK

### Error Monitoring

- Restart count (mcp-server): 0 (threshold: ≤2)
- EPIPE/ECONNRESET (30m): 0 (threshold: ≤2)
- No critical system errors detected

## Audit Metrics

| Category | Check ID Range | Pass | Fail | Status |
|----------|---|---|---|---|
| Container Status | A-01 to A-11 | 11 | 0 | PASS |
| Health Endpoints | A-12 to A-20 | 10 | 0 | PASS |
| Restart Count | A-21 | 1 | 0 | PASS |
| Memory Pressure | A-30 | 11 | 0 | PASS |
| Inter-Service | A-25 to A-28 | 4 | 0 | PASS |
| EPIPE Check | A-31 | 1 | 0 | PASS |

**OVERALL: HEALTHY**
- Services checked: 12
- Checks performed: 38
- New anomalies: 0
- Dedup-skipped: 0
- Status: HEALTHY

---

## Carry-over (next session)

From prior Tier-2 audit (2026-05-21T22:10:00Z):
- **vnstockFundamentalsRefresh**: CRASHED 2026-05-18 01:00 (3+ days) — escalate to dev-mcp-server on next Tier-3
- **vnstockTradingStatsRefresh**: CRASHED 2026-05-18 08:30 (3+ days) — escalate to dev-mcp-server on next Tier-3
- **dailyDashboardJob**: ERROR ENOENT (missing `/docs/data/project-stats.json`) — confirm mount on next Tier-3
- **News SLA**: CRITICAL BREACH (121min vs 30min SLA) — known, last reported 2026-05-21T22:10:00Z
- **bctcReparseJob**: Success rate 84.2% (down from 100%) — needs monitoring on next Tier-3
