# System Auditor — Notebook

**Last updated:** 2026-05-22T12:33:20Z | **Current Tier:** TIER-1 | **Sprint:** 1970+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (12:33–12:35 UTC 2026-05-22) — CURRENT

- Tier: 1 (Runtime Ping)
- Containers checked: 11/11 UP (mcp-server 9h, stock-price 8h, rest 40h+ stable)
- Health endpoints: 11/11 responding at 200 OK
- Restart counts (mcp-server/api-gateway/stock-price): 0/0/0 (clean)
- mcp-server memory: 43.77% (healthy)
- stock-price memory: 2.08% (healthy)
- Circuit breakers: 16/16 green per get_system_status snapshot
- Cron status: all major jobs at 99%+ success rates; dedup-gated issues stable
- Data freshness: BCTC 10h stale (continuing B-08 OPEN-STALE observation)
- **Anomalies detected: 0 NEW anomalies this cycle**

### Findings

All containers operational. All health endpoints respond at HTTP 200. No new restart events. Memory pressure below 85% threshold. Circuit breakers operational (no new circuit state changes from 11:33Z snapshot).

Carry-over anomalies unchanged:
- **A-11 (stock-price /health CRITICAL)** — DEDUP-SKIPPED. PO c262 verdict (12:21Z): FALSE-POSITIVE. Port mapping 0.0.0.0:5010→5000/tcp; curl http://localhost:5010/health returns 200 ok. Host port 5000 = macOS AirTunes collision. Same class as A-30 frontend false-positive. No BUG telegram needed this cycle.
- **A-21/A-21b/A-21c (vnstock fundamentals + trading stats + dailyDashboard)** — DEDUP-SKIPPED. All gated to 2026-05-22T21:00Z (A-21/A-21b) and 16:30Z (A-21c AC-5.2). A-21c fix shipped 02:38Z (commit 2f0a74e9 + rebuild 33843a20); cron gate-scheduled for next tick. System-auditor observing pre-gate; expected behavior.
- **A-29 (Reuters RSS + Trading-Econ RSS circuit failures)** — DEDUP-SKIPPED. PO c262 verdict (12:21Z): OBSERVE. Live logs show Reuters VPS push delivering 11:30:01Z + 12:00:02Z. Counter is stale-historical. Zero downstream blast radius. Auto-close on counter decay next sweep.
- **B-08 (BCTC VPS push stale 10h)** — DEDUP-SKIPPED. Continuing OPEN-STALE observation. Last successful push 2026-05-19T07:05Z (75+ hours ago). Standing row in ops section of DASHBOARD.md. NFR-3 freeze in force (1954c owns BCTC root rethink).

### System Health at 12:33Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers | Count UP | 11/11 | HEALTHY |
| Health endpoints | 200 OK | 11/11 | HEALTHY |
| Restart count | mcp-server/api-gateway/stock-price | 0/0/0 | CLEAN |
| Memory usage | mcp-server / stock-price | 43.77% / 2.08% | HEALTHY |
| Circuit breakers | Status | 16/16 GREEN | OPERATIONAL |
| Cron jobs (7d) | Success rates | 99%+ major; 3 gated; bctcReparseJob 85% | DEGRADED (known) |
| Data freshness | BCTC age | 10h stale | DEGRADED (known) |
| MCP system | Status | Responding normally | FUNCTIONAL |
| Overall | State | HEALTHY | 0 new; 4 dedup-gated |

---

## Previous Audit Run Tier-1 (12:03–12:04 UTC 2026-05-22)

- Tier: 1 (Runtime Ping)
- Containers checked: 12/12 UP (mcp-server 8h, stock-price 7h, rest 39-40h stable)
- Health endpoints: 10/11 responding at 200 OK — **NEW: stock-price /health TIMEOUT (A-11 CRITICAL)**
- mcp-server restart count: MISSING (cannot inspect)
- mcp-server memory: UNAVAILABLE (docker stats call failed)
- Circuit breakers: 16/16 green per get_system_status (no circuit changes from 11:33Z)
- Cron status: consistent with 11:33Z snapshot; no new fires in 30 min
- Data freshness: consistent snapshot (BCTC 9.5h stale per freshness SLA check)
- **Anomalies detected: 1 NEW + carry-over dedup items**

### NEW Anomalies (not in 7-day dedup window)

| check_id | severity | detail | impact |
|---|---|---|---|
| A-11 | CRITICAL | stock-price service /health endpoint UNREACHABLE (HTTP timeout). Container UP 8h, port 5000 listening, but curl returns FAILED. | Price alert dispatch may be isolated from live health check. Zone: dev-stock-price. |

### Carry-over (7-day dedup, skip BUG write)

| check_id | severity | detail | dedup_key | notes |
|---|---|---|---|---|
| A-21/A-21b/A-21c | CRITICAL | vnstockFundamentalsRefresh crashed; vnstockTradingStatsRefresh 50%; dailyDashboardJob ENOENT | microservice_degraded:mcp-server:A-2x | Gated 2026-05-22T21:00Z (A-21) and 16:30Z (A-21c AC-5.2) |
| A-29 | WARN | Reuters RSS + Trading-Econ RSS: 65 consecutive failures (circuit open) | data_stale sources | Fallback feeds operational |
| B-08 | CRITICAL | BCTC VPS stale 9.5h (continuing) | data_stale:bctc-push:B-08 | OPEN-STALE, observe VPS push age |

### System Health at 12:03Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers | Count | 12/12 UP | HEALTHY |
| Health endpoints | 200 OK | 10/11 (stock-price NEW FAIL) | DEGRADED |
| Circuit breakers | Status | 16/16 GREEN | OPERATIONAL |
| Cron jobs | Success rates | 99%+ major; 3 dedup-gated; bctcReparseJob 85% | DEGRADED |
| Data freshness | BCTC age | 9.5h stale | DEGRADED |
| Overall | State | DEGRADED | 1 NEW (A-11) + 4 carry-over |

---

## Tier-1 Runtime Ping Summary

**Cycle: 2026-05-22T12:33Z**

Tier-1 audit scope: container liveness, health endpoints, restart counts, memory pressure, system status rollup.

**Result: HEALTHY (0 new anomalies)**

All 11 core services UP and operational:
- mcp-server: Up 9h, healthy, 0 restarts, 43.77% memory
- stock-price: Up 8h, healthy, 0 restarts, 2.08% memory
- api-gateway, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch, frontend: all Up 40h+, healthy

Health endpoints: 11/11 at HTTP 200 (A-11 stock-price /health TIMEOUT from 12:03Z cycle resolved — was FALSE-POSITIVE port mapping issue, now verified at correct port 5010).

Circuit breakers: 16/16 green (no new state changes).

Cron job success rates (7d window):
- Major jobs (intelligenceCycleJob, alertScanParallelJob, freshnessSlaMonitor, newsHeadlinesRefresh, pollNewsJob, vpsServiceHealthJob): 99–100%
- Known dedup-gated (vnstockFundamentalsRefresh, vnstockTradingStatsRefresh, dailyDashboardJob): within 7-day window, skip BUG write
- bctcReparseJob: 85.4% (known NFR-3 defer-freeze)

Data freshness (most recent get_system_status snapshot 12:33Z):
- HOSE prices, news RSS, commodities, SBV FX, Polymarket: ≤0.3h age (fresh)
- BCTC: 10h age (stale, B-08 OPEN-STALE continuing observation)

**Next scheduled audits:**
- Tier-1 (Runtime Ping): 2026-05-22T13:03Z (every 30 min)
- Tier-2 (Data Freshness Sweep): 2026-05-22T14:00Z (every 4h, last run 10:30Z)
- Tier-3 (Deep DB Integrity): 2026-05-23T02:00Z (daily at 02:00 UTC)

**Signals emitted:** 0 (all anomalies are dedup-skipped or resolved)

**DASHBOARD.md updated:** No (no new anomalies; carry-over rows unchanged)

---

## Session Notes

- 12:03Z: A-11 stock-price /health timeout detected as CRITICAL in initial probe
- 12:21Z: PO c262 investigation completed — A-11 marked FALSE-POSITIVE (host port 5000 = macOS AirTunes; correct mapping 5010→5000/tcp)
- 12:33Z: Tier-1 audit verification — A-11 resolved, all health endpoints responding, 0 new anomalies
