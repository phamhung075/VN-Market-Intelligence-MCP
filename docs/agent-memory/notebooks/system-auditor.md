# System Auditor — Notebook

**Last updated:** 2026-05-22T09:33:48Z | **Current Tier:** TIER-1 | **Sprint:** 1970+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (09:33–09:34 UTC 2026-05-22)

- Tier: 1 (Runtime Ping)
- Containers checked: 11/11 UP (mcp-server 5h, stock-price 4h, rest 35-37h stable)
- Health endpoints: 10/11 responding at 200 (frontend 404 = no /health endpoint by design, expected)
- mcp-server restart count: 0 (NO NEW RESTARTS)
- Circuit breakers: 16/16 GREEN (all data source fallback paths operational)
- Cron success rates (7d) per get_cron_health:
  - Major jobs ≥99% (intelligenceCycleJob 99.4%, alertScanParallelJob 100%, freshnessSlaMonitor 100%, newsHeadlinesRefresh 99.1%, pollNewsJob 99.0%)
  - Pre-known failures in dedup window (within 7d, skip re-report):
    - vnstockFundamentalsRefresh: crashed (A-21, 4d, gated 2026-05-22T21:00Z dedup-skip)
    - vnstockTradingStatsRefresh: running (A-21b, 0% success, gated 2026-05-22T21:00Z dedup-skip)
    - dailyDashboardJob: 0% (ENOENT /docs/data/project-stats.json; A-21c dedup-skip, ops gate 2026-05-22T16:30Z AC-5.2)
    - bctcReparseJob: 85.4% (82 runs, freeze NFR-3; A-29 dedup-skip)
- VPS services: 5/5 healthy per vpsServiceHealthJob (vn-bctc-fetch, vn-foreign-flow, vn-news-fetch, vn-price-fetch, vn-sbv-fetch)
- Data freshness per get_system_status:
  - HOSE prices: 0.1h (fresh, SLA 0.5h)
  - News RSS: 0.5h (fresh, SLA 3h)
  - Stock prices: 0.1h (fresh)
  - Commodities: 0.3h (fresh)
  - SBV FX: 0.1h (fresh)
  - Polymarket: 0.6h (fresh, SLA 2h)
  - BCTC: 6.5h (within SLA for current non-earnings window; Tier-2 DASHBOARD row 1972-BCTC-VPS-STALE notes 71h+ age from earlier scan, recovery status TBD in next Tier-2 sweep)
- EPIPE/ECONNRESET count last 30m: 0 (clean)
- MCP tools: 146 available, responding normally
- Anomalies detected: 0 NEW (all pre-known, within 7-day dedup window per user carry-over context + DASHBOARD)

### System Status at 09:03Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers | Count | 11/11 UP | HEALTHY |
| Health endpoints | 200 OK | 10/11 (frontend 404=by design) | HEALTHY |
| mcp-server restart | Count | 0 | CLEAN |
| Circuit breakers | Status | 16/16 GREEN | OPERATIONAL |
| Cron jobs | Success rate (7d) | 99%+ major; pre-gated jobs stable | HEALTHY |
| VPS services | Status | 5/5 healthy | OPERATIONAL |
| Data freshness | Age (h) | All sources ≤6.5h (SLA compliant) | HEALTHY |
| MCP system | Tools | 146 available | OPERATIONAL |
| Overall | State | HEALTHY | No NEW anomalies |

---

## Audit Summary

**Tier-1 COMPLETE (09:33–09:34 UTC)**: All 11 services UP and operational. 10/11 health endpoints responsive (frontend 404 = expected by design). MCP system healthy with 146 tools available. Data freshness all sources within SLA (≤6.5h). VPS proxy healthy (5/5 services).

No NEW anomalies detected. All pre-known issues remain in 7-day dedup window per user carry-over context + DASHBOARD.md:
- A-21/A-21b vnstockFundamentalsRefresh + vnstockTradingStatsRefresh gated 2026-05-22T21:00Z
- A-21c dailyDashboardJob ENOENT (ops observe gate 2026-05-22T16:30Z AC-5.2)
- A-29 bctcReparseJob 85.4% (DEFER-FREEZE NFR-3)
- A-30 frontend /health 404 (false-positive by design)
- B-08 BCTC VPS freshness (6.5h current, 71h+ noted in earlier Tier-2 at 06:30Z; recovery status pending next Tier-2 sweep)

Cron health good — no escalation warranted.

**Next scheduled audits:**
- Tier-1 (Runtime Ping): 2026-05-22T09:30Z (every 30 min)
- Tier-2 (Data Freshness Sweep): 2026-05-22T10:00Z (every 4h, prior run 06:30Z)
- Tier-3 (Deep DB Integrity): 2026-05-23T02:00Z (daily at 02:00 UTC)
