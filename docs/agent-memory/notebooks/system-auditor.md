# System Auditor — Notebook

**Last updated:** 2026-05-22T11:33:58Z | **Current Tier:** TIER-1 | **Sprint:** 1970+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (11:33–11:33 UTC 2026-05-22) — CURRENT

- Tier: 1 (Runtime Ping)
- Containers checked: 11/11 UP (mcp-server 8h, stock-price 7h, rest 38-39h stable; no NEW restarts)
- Health endpoints: 11/11 responding at 200 OK
- mcp-server restart count: 0 (clean, no new restarts)
- mcp-server memory: 40.58% (healthy, no pressure)
- Circuit breakers: 16/16 operational; **2 sources at 65 consecutive failures** (Reuters RSS, Trading-Econ RSS marked "Ngưng")
- Cron success rates (7d) per get_cron_health:
  - Major jobs ≥99% (intelligenceCycleJob 99.4%, alertScanParallelJob 100%, freshnessSlaMonitor 100%, newsHeadlinesRefresh 99.1%, pollNewsJob 99.0%)
  - **NEW CRITICAL:** dailyDashboardJob 0% (ENOENT /docs/data/project-stats.json; observe gate 2026-05-22T16:30Z AC-5.2)
  - Dedup-skip (within 7d window):
    - vnstockFundamentalsRefresh: crashed 2026-05-18T01:00Z (A-21, gated 2026-05-22T21:00Z)
    - vnstockTradingStatsRefresh: 50% success (A-21b, gated 2026-05-22T21:00Z)
    - bctcReparseJob: 85.4% success (A-29, freeze NFR-3)
- VPS services: 5/5 healthy per vpsServiceHealthJob
- Data freshness per get_system_status (11:33Z):
  - HOSE prices: 0.3h ✓
  - News RSS: 0.1h ✓
  - Stock prices: 2.6h (normal range)
  - Commodities: 0.3h ✓
  - SBV FX: 0.1h ✓
  - Polymarket: 0.1h ✓
  - **BCTC: 9.0h** (stale, continuing trend from carry-over B-08)
- EPIPE/ECONNRESET count last 30m: 0 (clean)
- MCP tools: responding normally
- **Anomalies detected: 2 NEW + 2 dedup-skip**

### NEW Anomalies (not in 7-day dedup window)

| check_id | severity | detail | impact |
|---|---|---|---|
| A-29 | WARN | Reuters RSS + Trading-Econ RSS: 65 consecutive failures (circuit open) | No news fetch for these 2 sources; fallback to other RSS feeds active |
| A-21c | CRITICAL | dailyDashboardJob: ENOENT /docs/data/project-stats.json (0.0% success rate) | Daily dashboard generation blocked; observe gate 2026-05-22T16:30Z AC-5.2 |

### Carry-over (7-day dedup, skip BUG write)

| check_id | severity | detail | dedup_key | gate |
|---|---|---|---|---|
| A-21 | CRITICAL | vnstockFundamentalsRefresh crashed | microservice_degraded:mcp-server:A-21 | 2026-05-22T21:00Z |
| A-21b | CRITICAL | vnstockTradingStatsRefresh 50% success | microservice_degraded:mcp-server:A-21b | 2026-05-22T21:00Z |
| B-08 | WARN | BCTC VPS stale 9.0h+ | data_stale:bctc-push:B-08 | OPEN-STALE |

### System Health at 11:33Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers | Count | 11/11 UP (mcp-server 8h, stock-price 7h, rest 38-39h) | HEALTHY |
| Health endpoints | 200 OK | 11/11 | HEALTHY |
| mcp-server restart | Count | 0 (no new restarts) | CLEAN |
| mcp-server memory | Usage | 40.58% | HEALTHY |
| Circuit breakers | Status | 14/16 GREEN; Reuters+Trading-Econ OPEN | DEGRADED |
| Cron jobs (7d) | Success rate | 99%+ major; 2 at 0% (A-21/A-21c), 1 at 50% (A-21b) | DEGRADED |
| VPS services | Status | 5/5 healthy | OPERATIONAL |
| Data freshness | Age (h) | BCTC 9.0h; others ≤2.6h | DEGRADED (B-08 stale) |
| MCP system | Tools | operational | FUNCTIONAL |
| Overall | State | DEGRADED | 2 NEW + 2 carry-over |

---

## Tier-1 Complete Summary

**Audit Run: 2026-05-22T11:33:13Z (Tier-1 Runtime Ping)**

All 11 core services UP and operational. 11/11 health endpoints responsive. MCP system functional with 2 news source circuits open (65 failures each).

**2 NEW anomalies detected (severity: 1 CRITICAL, 1 WARN):**
- A-29: Reuters RSS + Trading-Econ RSS circuit open (65 failures each)
- A-21c: dailyDashboardJob ENOENT /docs/data/project-stats.json (observe gate 2026-05-22T16:30Z AC-5.2)

**2 carry-over issues remain in dedup window (skip BUG, append DASHBOARD):**
- A-21/A-21b: vnstockFundamentalsRefresh + vnstockTradingStatsRefresh (observe gate 2026-05-22T21:00Z)
- B-08: BCTC VPS stale 9.0h+ (continuing, OPEN-STALE)

**Signals emitted:** 1 (BUG: A-29 Reuters/Trading-Econ)
**DASHBOARD.md updated:** yes (2 rows added under system-auditor section)

**Next scheduled audits:**
- Tier-1 (Runtime Ping): 2026-05-22T12:03Z (every 30 min)
- Tier-2 (Data Freshness Sweep): 2026-05-22T14:00Z (every 4h)
- Tier-3 (Deep DB Integrity): 2026-05-23T02:00Z (daily at 02:00 UTC)
