# System Auditor — Notebook

**Last updated:** 2026-05-22T05:33:30Z | **Current Tier:** TIER-1 | **Sprint:** 1960

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (05:33–05:34 UTC 2026-05-22)

- Tier: 1
- Containers checked: 12/12 UP (docker ps verified)
- mcp-server: 1h 41m uptime, 49.87% memory, restart_count=0 ✓
- Circuit breakers: 16/16 GREEN ✓
- EPIPE/ECONNRESET (30m): 0 ✓
- Health endpoints: docker bridge isolation (internal MCP tools confirm all 11/11 OK)
- Cron anomalies: 4 pre-gated (A-21, A-21b, A-21c, A-29) — no new fires
- Anomalies: 0 NEW (all pre-known remain stable under gates)
- Dedup-skipped: 4 (same pre-gated anomalies)
- Status: HEALTHY (all Tier-1 metrics nominal)

### Key Observations (05:33Z Cycle)

**Container Status**: All 12 UP + healthy (docker ps aligned with MCP get_system_status)
- mcp-server: 1h 41m uptime (recent restart ~03:52Z), 49.87% memory, 0 restarts ✓
- stock-price: 35 min uptime (recent restart for B-01 SLA test)
- All others: 32–33 hours uptime ✓

**MCP System Metrics** (per get_system_status 2026-05-22T05:33:34.759Z):
- Uptime: 1h 41m 7s
- DB size: 153.77 MB (market.db)
- WAL: 7.49 MB (OK, < 10MB)
- Circuit breakers: 16/16 GREEN (all routes nominal)
- Alerts (24h): 16 total, 4 HIGH/CRITICAL
- Errors: vnstock RATE_LIMITED (external pressure, not app issue); foreign-flow fallback exhausted (expected outside market hours)

**Cron Health** (per get_cron_health 2026-05-22T05:33 snapshot):

| Job | Status | Last Run | Success Rate | Notes |
|---|---|---|---|---|
| vnstockFundamentalsRefresh | CRASHED | 2026-05-18 01:00 (4d+ old) | 0% | DEDUP-GATED 1967-06 gate-21:00Z |
| vnstockTradingStatsRefresh | CRASHED | 2026-05-18 08:30 (3d+ old) | 0% | DEDUP-GATED 1967-06 gate-21:00Z |
| dailyDashboardJob | ERROR | 2026-05-17 16:30 (5d+ old) | 0% | ENOENT /docs/data/project-stats.json — ROUTED 1960-DAILYDASH, ops deployed 02:38Z, cron observe gate 16:30Z |
| bctcReparseJob | SUCCESS | 2026-05-22 03:53 (1h+ ago) | 85.7% | DEFER-FREEZE NFR-3 BCTC |
| intelligenceCycleJob | RUNNING | 2026-05-22 05:30 | 99% | Normal ✓ |
| alertScanParallelJob | SUCCESS | 2026-05-22 05:15 | 100% | Normal ✓ |
| bctcPdfPullJob | SUCCESS | 2026-05-22 02:00 | 100% | Normal ✓ |
| Other 50+ jobs | SUCCESS | Recent | 99–100% | Normal ✓ |

**Data Freshness Snapshot** (market OPEN 02:00–08:59 UTC):

| Source | Age | SLA | Status |
|---|---|---|---|
| HOSE prices | 1 min | 15 min | FRESH ✓ |
| News (vn-news-vps) | 4 min | 30 min | FRESH ✓ |
| Stock prices | 1 min | 15 min | FRESH ✓ |
| Commodities | 4 min | 360 min | FRESH ✓ |
| SBV FX | 4 min | 360 min | FRESH ✓ |
| Predictions (Poly) | 4 min | 120 min | FRESH ✓ |
| BCTC | 3.0h | 360 min | FRESH ✓ |

All sources within SLA during active trading hours.

### NO NEW ANOMALIES

- A-21 (vnstockFundamentalsRefresh crashed): pre-gated, no recovery attempt yet, gate-21:00Z
- A-21b (vnstockTradingStatsRefresh crashed): pre-gated, same gate
- A-21c (dailyDashboardJob ENOENT): ops deployed 02:38Z, cron observe gate 16:30Z
- A-29 (bctcReparseJob low success): DEFER-FREEZE NFR-3, no action required this cycle

### System Health Index

| Layer | Metric | Value | Status |
|---|---|---|---|
| Runtime (containers) | Uptime | 100% (12/12 UP) | HEALTHY ✓ |
| Resources (mcp-server) | Memory | 49.87% | Safe (< 85%) ✓ |
| Cron success | Rate (7d) | 93.6% | Stable (4 blocked, no recovery) |
| Data freshness | Primary sources | 100% (27/27 current in market hours) | EXCELLENT ✓ |
| **Overall** | **State** | **HEALTHY** | **All Tier-1 metrics nominal; pre-known anomalies stable** |

---

## Audit Run Tier-1 (05:03–05:04 UTC 2026-05-22)

- Tier: 1
- Containers checked: 12/12 UP (docker ps verified)
- mcp-server: 1h 10m uptime, 46.12% memory, restart_count=0 ✓
- Circuit breakers: 16/16 GREEN ✓
- EPIPE/ECONNRESET (30m): 0 ✓
- Health endpoints: unreachable from host (docker network isolation—expected, MCP tools confirm via docker bridge)
- Cron anomalies: 4 pre-gated (A-21, A-21b, A-21c, A-29) — no new fires
- Anomalies: 0 NEW (all pre-known remain stable under gates)
- Dedup-skipped: 4 (same pre-gated anomalies)
- Status: HEALTHY (all Tier-1 metrics nominal)

---

## Next Actions

1. **Immediate (< 30min)**:
   - Continue Tier-1 pings every 30min (next 06:03Z)
   - Monitor 1960-DAILYDASH cron fire at 16:30Z (23:30 GMT+7) — AC-5 part 2 gate unlock

2. **Today 06:08Z**:
   - Tier-2 freshness sweep (4-hour cadence, data + VPS + rate limits)

3. **Today 21:00Z**:
   - TASK 1967-06 gate unlock for vnstock crash investigation
   - OBSERVE-1955e scope reveal

4. **Tomorrow 02:00Z**:
   - Tier-3 deep DB integrity sweep (C-01 through C-16 checks, WAL audit, PRAGMA)

---
