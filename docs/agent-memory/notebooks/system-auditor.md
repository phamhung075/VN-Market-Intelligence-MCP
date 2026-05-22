# System Auditor — Notebook

**Last updated:** 2026-05-22T08:03:52Z | **Current Tier:** TIER-1 | **Sprint:** 1970+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (08:03–08:04 UTC 2026-05-22)

- Tier: 1 (Runtime Ping)
- Containers checked: 11/11 UP (mcp-server 4h 10m, stock-price 3h, rest 34-36h stable)
- Health endpoints: 10/11 responding at 200 (frontend 404 = no /health endpoint by design, false-positive acked 03:05Z)
- mcp-server restart count: 0 (no NEW restarts)
- mcp-server memory: 40.62% (healthy, < 85% threshold)
- Circuit breakers: 16/16 GREEN (all data source fallback paths operational)
- Cron success rates (7d):
  - Major jobs ≥99% (intelligenceCycleJob 99.4%, alertScanParallelJob 100%, freshnessSlaMonitor 100%)
  - Pre-known failures in dedup window (within 7d, skip re-report):
    - vnstockFundamentalsRefresh 0% (crashed 2026-05-18, gated 22T21Z; A-21/A-21b dedup-skip)
    - vnstockTradingStatsRefresh 0% (crashed 2026-05-18, gated 22T21Z; A-21b dedup-skip)
    - dailyDashboardJob 0% (ENOENT /docs/data/project-stats.json bug, last report 2026-05-22T01:04:44Z; A-21c dedup-skip)
    - bctcReparseJob 85.7% (84 runs, 72 success, freeze NFR-3; A-29 dedup-skip last report 01:04Z)
- VPS services: 5/5 healthy per vpsServiceHealthJob (vn-bctc-fetch, vn-foreign-flow, vn-news-fetch, vn-price-fetch, vn-sbv-fetch)
- Data freshness: BCTC 5.5h age (within SLA for current window)
- Anomalies detected: 0 NEW (all pre-known, within 7-day dedup window)

### Pre-gated/dedup-skip anomalies (no re-report):
- A-21/A-21b: vnstockFundamentalsRefresh + vnstockTradingStatsRefresh (crashed 4d+, gated 22T21Z) — DEDUP SKIP (last report 01:04Z)
- A-21c: dailyDashboardJob ENOENT (ops gate 16:30Z AC-5.2) — DEDUP SKIP (last report 01:04Z)
- A-29: bctcReparseJob 85.7% success_rate (DEFER-FREEZE NFR-3, 1954c owns root) — DEDUP SKIP (last report 01:04Z)
- A-30: frontend /health 404 (no /health endpoint by design; false-positive acked 2026-05-22T03:05:01Z) — DEDUP SKIP
- B-08: BCTC VPS 5.5h fresh (reported Tier-2 2026-05-22T06:30:21Z as 71.4h stale at that time; zone=dev-mcp-server) — monitoring, within 7d window but stale window recovered to 5.5h

### System Status at 08:04Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers | Status | 11/11 UP | HEALTHY |
| Health endpoints | 200 OK | 10/11 (frontend 404=design) | HEALTHY |
| mcp-server restart | Count | 0 | CLEAN |
| mcp-server memory | % used | 40.62% | HEALTHY |
| Circuit breakers | Status | 16/16 GREEN | OPERATIONAL |
| Cron jobs | Success rate (7d) | 99%+ major; pre-gated jobs stable | HEALTHY |
| MCP system | Status | responding (146 tools, sessions ok) | OPERATIONAL |
| Overall | State | HEALTHY | No NEW runtime issues |

---

## Audit Summary

**Tier-1 COMPLETE (08:03–08:04 UTC)**: All 11 services operational. 10/11 health endpoints responsive (frontend 404 = expected, by design). MCP system healthy with 146 tools available. No NEW anomalies detected. All pre-known issues remain in 7-day dedup window per prior triage:
- A-21/A-21b gated 22T21Z
- A-21c observe 16:30Z (AC-5.2)
- A-29 freeze NFR-3
- A-30 false-positive acked
- B-08 BCTC VPS within 7d monitoring window (reported 06:30Z this morning as stale; recovered to 5.5h fresh as of 08:00Z system status check)

Cron jobs showing healthy execution patterns. Stock-price container restarted 3h ago (normal restart, no crash pattern). No escalation warranted.

**Next scheduled audits:**
- Tier-1 (Runtime Ping): 2026-05-22T08:33Z (every 30 min)
- Tier-2 (Data Freshness Sweep): 2026-05-22T10:00Z (every 4h, prior run 06:30Z)
- Tier-3 (Deep DB Integrity): 2026-05-23T02:00Z (daily at 02:00 UTC)
