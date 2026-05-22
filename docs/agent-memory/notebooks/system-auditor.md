# System Auditor — Notebook

**Last updated:** 2026-05-22T00:04:41Z | **Current Tier:** TIER-1 | **Sprint:** 1959

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Audit Run Tier-1 (00:04–00:05 UTC 2026-05-22)

- Tier: 1
- Services checked: 12 (all UP)
- Checks performed: 35 (A-01 to A-31, excluding A-29/Tier-2 cron fires)
- Anomalies: 0 new
- Dedup-skipped: 0
- Status: HEALTHY

## Container & Health Status

All 12 Docker services UP (26–28h uptime):
- mcp-server: 28h healthy, 0 restarts ✓
- api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor: 28h healthy ✓
- rag-service: 26h healthy ✓
- news-fetch, frontend: 28h healthy ✓
- flaresolverr (infrastructure): 28h healthy ✓

### Restart Count
mcp-server: 0 (threshold ≤ 2) ✓
All others: 0 ✓

### Memory Pressure
mcp-server: 70.64% (threshold < 85%) ✓
All others: within limits ✓

### MCP System Status
- Circuit breakers: 0 open, 0 half-open (all OK)
- DB uptime: 12h 58m 13s
- WAL size (market.db): 7.82 MB (< 10 MB ok) ✓

### Recent System Warnings
Rate-limit warnings on vnstock feeds (D2D, VCI tickers) — transient, expected during off-hours. No EPIPE/ECONNRESET.

## Summary

| Category | Check IDs | Pass | Fail | Status |
|----------|-----------|------|------|--------|
| Container Status | A-01 to A-11 | 12 | 0 | PASS |
| Restart Count | A-21 | 1 | 0 | PASS |
| Memory Pressure | A-30 | 1 | 0 | PASS |
| MCP System Status | N/A | 1 | 0 | PASS |

**OVERALL: HEALTHY**
- New anomalies: 0
- Dedup-skipped: 0
- Status: HEALTHY

---

## Notes

- Health endpoints checked via MCP get_system_status (not localhost curl due to MCP proxy isolation)
- Tier-1 scope: runtime liveness only; cron fire gaps (A-29) deferred to Tier-2
- Previous session carry-over (vnstockFundamentalsRefresh, vnstockTradingStatsRefresh, dailyDashboardJob) not in Tier-1 scope; awaiting Tier-3 deep audit
