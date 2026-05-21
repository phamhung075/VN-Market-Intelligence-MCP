# System Auditor — Notebook

**Last updated:** 2026-05-21T23:34:43Z | **Current Tier:** TIER-1 | **Sprint:** 1959

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Audit Run Tier-1 (23:34–23:36 UTC 2026-05-21)

- Tier: 1
- Services checked: 12 (all UP)
- Checks performed: 38 (A-01 to A-31)
- Anomalies: 0 new
- Dedup-skipped: 3 (vnstockFundamentalsRefresh, vnstockTradingStatsRefresh, dailyDashboardJob carry-over from 2026-05-21T22:10:00Z)
- Status: HEALTHY

## Container & Health Status

All 12 Docker services UP (27–28h uptime):
- mcp-server: 28h healthy, 0 restarts ✓
- api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch: 27h healthy ✓
- frontend: 27h healthy ✓
- flaresolverr: 27h healthy ✓

### Health Endpoints — All 200 OK
- Port 3000 (mcp-server): OK
- Port 4000 (api-gateway): OK
- Port 5010 (stock-price): OK
- Port 5003 (technical-analysis): OK
- Port 5004 (macro-indicators): OK
- Port 5005 (kinh-dich-service): OK
- Port 5006 (alert-engine): OK
- Port 5001 (pdf-extractor): OK
- Port 5002 (rag-service): OK
- Port 5008 (news-fetch): OK

### Memory & Resource
All services < 85% memory; highest: 72.42% ✓

### Restart Count
mcp-server: 0 (threshold ≤ 2) ✓

### Inter-Service Connectivity
- stock-price:5000 → OK
- technical-analysis:5003 → OK
- alert-engine:5006 → OK
- pdf-extractor:5001 → OK

### Error Monitoring
- EPIPE/ECONNRESET (30m): 0 ✓
- No system errors detected

### MCP System Status
All circuit breakers OK (0 open, 0 half-open).

## Cron Health Observations

**Note:** The following jobs are in error state but carry over from prior Tier-2 audit (2026-05-21T22:10:00Z):

- **vnstockFundamentalsRefresh**: CRASHED 2026-05-18 01:00 (72+ hours down) — needs dev-mcp-server escalation on next Tier-3
- **vnstockTradingStatsRefresh**: CRASHED 2026-05-18 08:30 (65+ hours down) — needs dev-mcp-server escalation on next Tier-3
- **dailyDashboardJob**: ERROR ENOENT `/docs/data/project-stats.json` — confirm mount on next Tier-3

These are known issues within dedup window. **Not escalating to BUG channel in this Tier-1.**

## Summary

| Category | Check IDs | Pass | Fail | Status |
|----------|-----------|------|------|--------|
| Container Status | A-01 to A-11 | 12 | 0 | PASS |
| Health Endpoints | A-12 to A-20 | 10 | 0 | PASS |
| Restart Count | A-21 | 1 | 0 | PASS |
| Memory Pressure | A-30 | 12 | 0 | PASS |
| Inter-Service | A-25 to A-28 | 4 | 0 | PASS |
| EPIPE Check | A-31 | 1 | 0 | PASS |

**OVERALL: HEALTHY**
- New anomalies: 0
- Dedup-skipped: 3 (carry-over from prior audit)
- Status: HEALTHY

---

## Carry-over (next session)

From current Tier-1 audit (2026-05-21T23:34:43Z):
- **vnstockFundamentalsRefresh**: CRASHED (awaiting Tier-3 escalation)
- **vnstockTradingStatsRefresh**: CRASHED (awaiting Tier-3 escalation)
- **dailyDashboardJob**: ERROR ENOENT (awaiting Tier-3 escalation)
