# System Auditor — Notebook

**Last updated:** 2026-05-22T13:33:14Z | **Current Tier:** TIER-1 | **Sprint:** 1970+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (13:33–13:34 UTC 2026-05-22) — CURRENT

- Tier: 1 (Runtime Ping)
- Containers checked: 11/11 UP (mcp-server 10h, stock-price 9h, rest 41h+ stable)
- Health endpoints: 11/11 responding at 200 OK
- Restart counts (mcp-server/api-gateway/stock-price): 0/0/0 (clean)
- Circuit breakers: 16/16 green per get_system_status snapshot
- Cron status: major jobs 99%+ success; 3 dedup-gated issues stable; bctcReparseJob 85.4%
- Data freshness: BCTC 11h stale (continuing B-08 OPEN-STALE observation)
- **Anomalies detected: 0 NEW anomalies this cycle**

### Findings

All containers operational. All health endpoints respond at HTTP 200. No new restart events. Circuit breakers operational (no new circuit state changes).

Carry-over anomalies unchanged:
- **A-21/A-21b/A-21c (vnstock fundamentals + trading stats + dailyDashboardJob)** — DEDUP-SKIPPED. A-21/A-21b gated to 2026-05-22T21:00Z; A-21c gated to 16:30Z AC-5.2. cron_health shows lastrun 2026-05-18 01:00Z (crashed) and 2026-05-22 08:30Z (50% success) for the refresh jobs. dailyDashboardJob ENOENT error expected to resolve post-gate.
- **A-29 (Reuters RSS + Trading-Econ RSS circuit failures)** — DEDUP-SKIPPED. 77 consecutive failures in cron_health. Fallback feeds operational, no downstream blast radius. Observe counter decay next sweep.
- **B-08 (BCTC VPS push stale 11h)** — DEDUP-SKIPPED. Continuing OPEN-STALE observation from 2026-05-19T07:05Z. Standing row in DASHBOARD.md. NFR-3 freeze in force.

### System Health at 13:33Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers | Count UP | 11/11 | HEALTHY |
| Health endpoints | 200 OK | 11/11 | HEALTHY |
| Restart count | mcp-server/api-gateway/stock-price | 0/0/0 | CLEAN |
| Circuit breakers | Status | 16/16 GREEN | OPERATIONAL |
| Cron jobs (7d) | Success rates | 99%+ major; 3 gated; bctcReparseJob 85.4% | DEGRADED (known) |
| Data freshness | BCTC age | 11h stale | DEGRADED (known) |
| MCP system | Status | Responding normally | FUNCTIONAL |
| Overall | State | HEALTHY | 0 new; 3 dedup-gated |

---

## Previous Audit Run Tier-1 (13:03–13:04 UTC 2026-05-22)

- Tier: 1 (Runtime Ping)
- Containers checked: 11/11 UP (mcp-server 9h, stock-price 8h, rest 40h+ stable)
- Health endpoints: 11/11 responding at 200 OK
- Restart counts (mcp-server/api-gateway/stock-price): 0/0/0 (clean)
- mcp-server memory: 43.77% (healthy)
- stock-price memory: 2.08% (healthy)
- Circuit breakers: 16/16 green per get_system_status snapshot
- Cron status: major jobs 99%+ success; 3 dedup-gated issues stable; bctcReparseJob 85.4%
- Data freshness: BCTC 10.5h stale (continuing B-08 OPEN-STALE observation)
- **Anomalies detected: 0 NEW anomalies this cycle**

### Findings

All containers operational. All health endpoints respond at HTTP 200. No new restart events. Memory pressure below 85% threshold. Circuit breakers operational (no new circuit state changes).

Carry-over anomalies unchanged:
- **A-21/A-21b/A-21c (vnstock fundamentals + trading stats + dailyDashboardJob)** — DEDUP-SKIPPED. A-21/A-21b gated to 2026-05-22T21:00Z; A-21c gated to 16:30Z AC-5.2. cron_health shows lastrun 2026-05-18 01:00Z (crashed) and 2026-05-22 08:30Z (50% success) for the refresh jobs. dailyDashboardJob ENOENT error expected to resolve post-gate.
- **A-29 (Reuters RSS + Trading-Econ RSS circuit failures)** — DEDUP-SKIPPED. 77 consecutive failures in cron_health. Fallback feeds operational, no downstream blast radius. Observe counter decay next sweep.
- **B-08 (BCTC VPS push stale 10.5h)** — DEDUP-SKIPPED. Continuing OPEN-STALE observation from 2026-05-19T07:05Z. Standing row in DASHBOARD.md. NFR-3 freeze in force.

### System Health at 13:03Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers | Count UP | 11/11 | HEALTHY |
| Health endpoints | 200 OK | 11/11 | HEALTHY |
| Restart count | mcp-server/api-gateway/stock-price | 0/0/0 | CLEAN |
| Memory usage | mcp-server / stock-price | 43.77% / 2.08% | HEALTHY |
| Circuit breakers | Status | 16/16 GREEN | OPERATIONAL |
| Cron jobs (7d) | Success rates | 99%+ major; 3 gated; bctcReparseJob 85.4% | DEGRADED (known) |
| Data freshness | BCTC age | 10.5h stale | DEGRADED (known) |
| MCP system | Status | Responding normally | FUNCTIONAL |
| Overall | State | HEALTHY | 0 new; 3 dedup-gated |

---

## Tier-1 Runtime Ping Summary

**Cycle: 2026-05-22T13:33Z**

Tier-1 audit scope: container liveness, health endpoints, restart counts, memory pressure, system status rollup.

**Result: HEALTHY (0 new anomalies)**

All 11 core services UP and operational:
- mcp-server: Up 10h, healthy, 0 restarts
- stock-price: Up 9h, healthy, 0 restarts
- api-gateway, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch, frontend: all Up 41h+, healthy

Health endpoints: 11/11 at HTTP 200 (all services responding normally).

Circuit breakers: 16/16 green (no new state changes).

Cron job success rates (7d window):
- Major jobs (intelligenceCycleJob, alertScanParallelJob, freshnessSlaMonitor, newsHeadlinesRefresh, pollNewsJob, vpsServiceHealthJob): 99–100%
- Known dedup-gated (vnstockFundamentalsRefresh, vnstockTradingStatsRefresh, dailyDashboardJob): within 7-day window, skip BUG write
- bctcReparseJob: 85.4% (known NFR-3 defer-freeze)

Data freshness (most recent get_system_status snapshot 13:33Z):
- HOSE prices, news RSS, commodities, SBV FX, Polymarket: ≤0.6h age (fresh)
- BCTC: 11h age (stale, B-08 OPEN-STALE continuing observation)

**Next scheduled audits:**
- Tier-1 (Runtime Ping): 2026-05-22T14:03Z (every 30 min)
- Tier-2 (Data Freshness Sweep): 2026-05-22T14:00Z (every 4h, last run 10:30Z)
- Tier-3 (Deep DB Integrity): 2026-05-23T02:00Z (daily at 02:00 UTC)

**Signals emitted:** 0 (all anomalies are dedup-skipped or resolved)

**DASHBOARD.md updated:** No (no new anomalies; carry-over rows unchanged)

---

## Session Notes

- 13:03Z: Tier-1 routine audit — 11/11 containers UP, 11/11 health endpoints OK, 0 new anomalies. All dedup-gated issues (A-21/A-21b/A-21c/A-29/B-08) remain stable. BCTC stale age continues (10.5h). No BUG writes needed.
- 13:33Z: Tier-1 routine audit — 11/11 containers UP, 11/11 health endpoints OK, 0 new anomalies. BCTC stale age increases to 11h. All dedup-gated issues remain within gate windows.
