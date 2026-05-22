# System Auditor — Notebook

**Last updated:** 2026-05-22T06:33:14Z | **Current Tier:** TIER-1 | **Sprint:** 1960+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (06:33–06:34 UTC 2026-05-22)

- Tier: 1 (Runtime Ping)
- Containers checked: 11/11 UP (mcp-server healthy, all core services healthy)
- Health endpoints: 11/11 responding at 200 (all services returning healthy)
- mcp-server restart count: 0 (clean, no restarts since container start)
- mcp-server memory: 43.48% (healthy, well below 85% threshold)
- Circuit breakers: 16/16 GREEN (all data source fallback paths operational)
- Cron success rate: 95%+ major recurrent jobs (intelligenceCycleJob 99.4%, alertScanParallelJob 100%, freshnessSlaMonitor 100%, pipelineWatchdog 100%)
- Anomalies detected: 0 NEW (pre-known jobs still gated)

### Pre-gated anomalies (no re-report):
- A-21/A-21b: vnstockFundamentalsRefresh + vnstockTradingStatsRefresh (crashed 4d+, gated 22T21Z) — DEDUP SKIP
- A-21c: dailyDashboardJob ENOENT (ops deployed, observe gate 16:30Z) — DEDUP SKIP
- A-29: bctcReparseJob 85.7% success_rate (DEFER-FREEZE NFR-3, 1954c owns root) — DEDUP SKIP
- B-08: BCTC VPS stale 71.4h (reported Tier-2 06:30Z, within dedup window) — DEDUP SKIP

### System Status at 06:33Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers | Status | 11/11 UP | HEALTHY |
| Health endpoints | 200 OK | 11/11 responding | HEALTHY |
| mcp-server restart | Count | 0 | CLEAN |
| mcp-server memory | % used | 43.48% | HEALTHY (< 85%) |
| Circuit breakers | Status | 16/16 GREEN | OPERATIONAL |
| Cron jobs | Success rate (7d) | 95%+ major | HEALTHY (pre-gated 4 jobs stable) |
| Overall | State | HEALTHY | No NEW runtime issues |

---

## Audit Summary

**Tier-1 COMPLETE**: All 9 microservices + 2 infrastructure services (api-gateway, frontend) operational. No new anomalies detected. All pre-known issues remain gated per prior triage. 0 new critical findings.

**Next scheduled audits:**
- Tier-1 (Tier-1 Runtime Ping): 2026-05-22T07:03Z (every 30 min)
- Tier-2 (Data Freshness Sweep): 2026-05-22T10:30Z (every 4h, prior run 06:30Z)
- Tier-3 (Deep DB Integrity): 2026-05-23T02:00Z (daily at 02:00 UTC)

