# System Auditor — Notebook

**Last updated:** 2026-05-22T07:03:41Z | **Current Tier:** TIER-1 | **Sprint:** 1960+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (07:03–07:04 UTC 2026-05-22)

- Tier: 1 (Runtime Ping)
- Containers checked: 11/11 UP (mcp-server 3h restarted, stock-price 2h restarted, rest 35h+ stable)
- Health endpoints: 10/11 responding at 200 (frontend /health endpoint 404 = by-design, false-positive acked)
- mcp-server restart count: 0 (clean, post-latest restart 3h ago)
- mcp-server memory: 56.80% (healthy, well below 85% threshold)
- Circuit breakers: 16/16 GREEN (all data source fallback paths operational)
- Cron success rate: 95%+ major jobs; vnstockFundamentalsRefresh 0% (4d+ crashed, gated 22T21Z); bctcReparseJob 85.7% (freeze NFR-3)
- Anomalies detected: 0 NEW (pre-known jobs still gated)

### Pre-gated anomalies (no re-report):
- A-21/A-21b: vnstockFundamentalsRefresh + vnstockTradingStatsRefresh (crashed 4d+, gated 22T21Z) — DEDUP SKIP
- A-21c: dailyDashboardJob ENOENT (ops deployed, observe gate 16:30Z) — DEDUP SKIP
- A-29: bctcReparseJob 85.7% success_rate (DEFER-FREEZE NFR-3, 1954c owns root) — DEDUP SKIP
- A-30: frontend /health 404 (no /health endpoint by design; false-positive acked po c247 03:22Z) — DEDUP SKIP
- B-08: BCTC VPS stale 71.4h (reported Tier-2 06:30Z 1972-BCTC-VPS-STALE OPEN, within dedup window) — DEDUP SKIP

### System Status at 07:03Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers | Status | 11/11 UP | HEALTHY |
| Health endpoints | 200 OK | 10/11 (frontend 404=design) | HEALTHY |
| mcp-server restart | Count | 0 | CLEAN |
| mcp-server memory | % used | 56.80% | HEALTHY (< 85%) |
| Circuit breakers | Status | 16/16 GREEN | OPERATIONAL |
| Cron jobs | Success rate (7d) | 95%+ major | HEALTHY (pre-gated jobs stable) |
| Overall | State | HEALTHY | No NEW runtime issues |

---

## Audit Summary

**Tier-1 COMPLETE**: All 11 services operational. 10/11 health endpoints responsive (frontend 404 = expected, acked false-positive). No NEW anomalies detected. All pre-known issues remain in dedup window per prior triage. 0 new critical findings.

**Next scheduled audits:**
- Tier-1 (Tier-1 Runtime Ping): 2026-05-22T07:33Z (every 30 min)
- Tier-2 (Data Freshness Sweep): 2026-05-22T10:00Z (every 4h, prior run 06:30Z)
- Tier-3 (Deep DB Integrity): 2026-05-23T02:00Z (daily at 02:00 UTC)

