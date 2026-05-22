# System Auditor — Notebook

**Last updated:** 2026-05-22T00:35:10Z | **Current Tier:** TIER-1 | **Sprint:** 1960

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Audit Run Tier-1 (00:34–00:35 UTC 2026-05-22)

- Tier: 1
- Services checked: 12 (all UP, 27–29h uptime)
- Health endpoints checked: 11 (all 200 OK)
- Restart count: mcp-server=0 (threshold ≤ 2) ✓
- Memory pressure: mcp-server=70.90% (threshold < 85%) ✓
- Anomalies: 0 NEW
- Dedup-skipped: 0 (prior Tier-3 findings still active)
- Status: HEALTHY (runtime layer)

---

## Container & Health Status

All 12 Docker services UP:
- mcp-server: 29h healthy, 0 restarts ✓
- api-gateway: 28h healthy ✓
- stock-price: 28h healthy ✓
- technical-analysis: 28h healthy ✓
- macro-indicators: 28h healthy ✓
- kinh-dich-service: 28h healthy ✓
- alert-engine: 28h healthy ✓
- pdf-extractor: 28h healthy ✓
- rag-service: 27h healthy ✓
- news-fetch: 28h healthy ✓
- frontend: 28h healthy ✓
- flaresolverr (infrastructure): 28h healthy ✓

### Health Endpoints

All 11 service health endpoints returning HTTP 200:
- Port 3000 (mcp-server): OK ✓
- Port 4000 (api-gateway): OK ✓
- Port 5010 (stock-price): OK ✓
- Port 5003 (technical-analysis): OK ✓
- Port 5004 (macro-indicators): OK ✓
- Port 5005 (kinh-dich-service): OK ✓
- Port 5006 (alert-engine): OK ✓
- Port 5001 (pdf-extractor): OK ✓
- Port 5002 (rag-service): OK ✓
- Port 5008 (news-fetch): OK ✓
- Port 3001 (frontend): OK ✓

### Restart Count

mcp-server: 0 (threshold ≤ 2) ✓

### Memory Pressure

mcp-server: 70.90% (threshold < 85%) ✓

---

## MCP System Status

**Circuit Breakers**: All 16 sources OK, no open/half-open states ✓

**Recent System Errors**: 10 warnings (vnstock:* RATE_LIMITED, backing off/max retries) — transient, not blocking ✓

**Cron Health**: 108 total jobs defined. Last hour: all core cycles firing (askQueueCheck, bctcPdfPull, bctcQueueEnricher, wallCheckpoint, etc.) ✓

---

## Prior Tier-3 Findings (Still Active)

From 2026-05-22T00:30–00:31 UTC audit:

| check_id | severity | source | status |
|---|---|---|---|
| A-21 | CRITICAL | vnstockFundamentalsRefresh CRASHED 4d | OPEN |
| A-21b | CRITICAL | vnstockTradingStatsRefresh CRASHED 4d | OPEN |
| A-21c | CRITICAL | dailyDashboardJob ENOENT /docs/data/project-stats.json | OPEN |
| B-04 | CRITICAL | ssc-iboard prices 16h stale (10m SLA) | OPEN |
| B-08 | CRITICAL | bctc-push 65h stale (6h SLA in Q1/Q2) | OPEN |
| B-12 | CRITICAL | foreign-flow 24h stale (10m SLA) | OPEN |

**Note**: Tier-1 focuses on runtime health. These are data freshness / cron anomalies from the prior Tier-3 deep audit. Ops/dev zones own remediation per DASHBOARD.md.

---

## Summary

**Tier-1 STATUS: HEALTHY**
- All 12 containers UP
- All 11 health endpoints returning 200
- mcp-server: 0 restarts, 70.90% memory
- All circuit breakers OK
- 0 new anomalies detected

**System Runtime Layer**: PASS ✓
**Data Freshness Layer**: DEGRADED (see Tier-3 findings)
**DB Integrity Layer**: PENDING next Tier-3 cycle (02:00 UTC)

---

## Telegram Notification

Sent to WORK channel at 00:35 UTC:
> [system-auditor] Tier-1 complete 00:35 UTC — 12/12 services UP, 11/11 health OK, 0 anomalies detected | Status: HEALTHY
