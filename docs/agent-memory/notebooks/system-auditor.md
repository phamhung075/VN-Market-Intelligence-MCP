# System Auditor — Notebook

**Last updated:** 2026-05-22T18:35:07Z | **Current Tier:** TIER-1 | **Sprint:** 1970+ | **Audit Type:** Runtime Ping

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (18:35–18:36 UTC 2026-05-22)

**Tier:** 1 (Runtime Ping)
**Duration:** ~1 min | **Wall time target:** < 120s | **Services checked:** 11 | **Cron jobs scanned:** 70+
**Anomalies detected:** 0 NEW | **Dedup context applied:** 3 items skipped per carry-over

### Findings

**Container Status (A-01 through A-11):**
- All 11 core services: UP, healthy, restart_count=0 across all
- Services: mcp-server (43m), stock-price (14h), rag-service (45h), flaresolverr (46h), frontend (46h), kinh-dich-service (46h), news-fetch (46h), macro-indicators (46h), technical-analysis (46h), pdf-extractor (46h), alert-engine (46h), api-gateway (46h)
- **Verdict:** PASS (all UP, no restarts)

**Health Endpoints (A-12 through A-20):**
- mcp-server (3000): ✓ 200 OK
- stock-price (5010): ✓ 200 OK
- technical-analysis (5003): ✓ 200 OK
- alert-engine (5006): ✓ 200 OK
- pdf-extractor (5001): ✓ 200 OK
- api-gateway (4000): ✓ 200 OK
- macro-indicators (5004): ✓ 200 OK
- kinh-dich-service (5005): ✓ 200 OK
- news-fetch (5008): ✓ 200 OK
- rag-service (5002): ✓ 200 OK
- frontend (3001): TIMEOUT (known false-positive — no /health endpoint exists)
- **Verdict:** PASS (10/11 responding; frontend 3001 A-30 is false-positive per DASHBOARD)

**Restart Count (A-21):**
- All 11 services: RestartCount=0
- **Verdict:** PASS

**Memory Pressure (A-30):**
- mcp-server: 27.90% (highest of critical)
- rag-service: 20.30%
- frontend: 9.70%
- All others: 2–5%
- All < 85% threshold
- **Verdict:** PASS

**Cron Fire Check (A-29):**
- Major jobs (intelligenceCycle, alertDigest, askQueueCheck, freshnessSlaMonitor, vpsProxyWatchdog, etc.): 99%–100% success rate
- Outliers in dedup context (HARD-SKIP):
  - **dailyDashboardJob:** last_run 2026-05-17T16:30Z (5 days ago), status=error (ENOENT /docs/data/project-stats.json). Gate expires 2026-05-22T21:00Z. **DO NOT RE-FIRE (2 BUG msgs already sent this session 17:33Z + 18:03Z; third alert hard-blocked by carry-over).**
  - **vnstockFundamentalsRefresh:** crashed (0% success, 1 run 2026-05-18T01:00Z, outside 7-day gate). DEDUP-SKIP per A-21.
  - **vnstockTradingStatsRefresh:** 50% success (2 runs, 1 success). DEDUP-SKIP per A-21b.
  - **Reuters/Trading-Economics RSS:** marked "Ngưng" (circuit open) in source health, but live get_cron_health shows newsapi fallback active + Reuters delivering at 11:30Z + 12:00Z (OBSERVE verdict per PO c262 12:21Z). Counter is stale-historical, not real-time block.
- **Verdict:** PASS (all major jobs healthy; outliers in known dedup context)

**Circuit Breaker Status (from get_system_status):**
- All 16 sources: [OK] status, failures=0
- cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, tradingEconomics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch
- **Verdict:** PASS

**System Status (18:35Z snapshot):**
- DB: market.db 160.59 MB, WAL 2.98 MB (healthy)
- Recent errors: 10 vnstock EIB RATE_LIMITED (transient, not EPIPE/ECONNRESET)
- Alert stats: 22 total (24h), 6 HIGH/CRITICAL, 0 unnotified
- Telegram env: all SET
- **Verdict:** PASS

### Dedup Context (7-day window, SUPPRESSED)

- **A-21c dailyDashboardJob ENOENT:** Gate expires 2026-05-22T21:00Z (5 hrs away). Hard-skip 3rd BUG alert per carry-over. BUG msgs 2568 + 2570 already sent 17:33Z + 18:03Z. DASHBOARD row FAIL-VERDICT-RE-FIRE OPEN.
- **A-21 vnstockFundamentalsRefresh crashed:** DASHBOARD OPEN. DEDUP gate window active.
- **A-21b vnstockTradingStatsRefresh 50% success:** DASHBOARD OPEN. DEDUP gate window active.
- **A-29 Reuters/Trading-Economics RSS circuits:** DASHBOARD OPEN. OBSERVE verdict (12:21Z) — counter stale-historical, live evidence shows recovery.
- **A-30 frontend /health 404:** DASHBOARD OPEN. Known false-positive (no endpoint exists).

### System Health at 18:36Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers (11 core services) | Health | 11/11 UP | HEALTHY |
| Restart counts | Max | 0 | HEALTHY |
| Memory usage | Peak | 27.90% (mcp-server) | HEALTHY |
| Cron jobs (70+ active) | Success rate | 99%+ major jobs | MOSTLY-HEALTHY (A-21c within gate) |
| Health endpoints | Responding | 10/11 (frontend known false-positive) | HEALTHY |
| Circuit breakers | All sources | [OK] × 16 | HEALTHY |
| DB health (snapshot) | WAL size | 2.98 MB | HEALTHY |
| Overall | State | HEALTHY | 0 NEW ANOMALIES |

---

## Tier-1 Runtime Ping Summary

**Cycle: 2026-05-22T18:35:07Z**

Tier-1 audit scope: container liveness, health endpoints, restart counts, memory pressure, cron fire gaps, circuit breaker status.

**Result: HEALTHY (0 new anomalies)**

**Container status:** 11/11 UP, healthy, 0 restarts
**Health endpoints:** 10/11 responding (frontend 3001 known false-positive)
**Memory:** all < 85% (peak 27.90%)
**Cron health:** 99%+ success for all major jobs
**Circuit breakers:** all 16 sources [OK], failures=0

**Signals emitted:** 0 new anomalies → no BUG channel alerts
**TELEGRAM work channel:** Tier-1 complete notification sent

**Dedup status:** 4 items suppressed within carry-over context (A-21c hard-skip 3rd alert, A-21, A-21b, A-29 OBSERVE, A-30 known false-positive)

---

## Session Notes

- 18:35Z: Tier-1 runtime ping invoked with AUDIT_TIER=1
- 18:35–18:36Z: Called get_system_status, get_cron_health, docker ps, docker inspect (restart_count), docker stats (memory)
- Key findings:
  - All 11 core services UP 43m–46h, healthy state, 0 restarts
  - Health endpoints 10/11 OK (frontend 3001 = false-positive, no /health endpoint by design)
  - All major crons 99%+ success; A-21c gate expires 21:00Z today (hard-skip per carry-over)
  - vnstock fundamental/trading crashes in dedup context (outside gate)
  - Reuters/TE RSS counter stale-historical (OBSERVE verdict confirmed)
  - Memory peak 27.90% mcp-server, all < 85%
  - Circuit breaker status: all 16 sources [OK], failures=0
  - DB health: 160.59 MB market.db, 2.98 MB WAL (healthy)
- 18:36Z: No dedup violations. Carry-over context honored (3 items skipped).
- 18:36Z: TELEGRAM WORK notification sent. Tier-1 HEALTHY status confirmed.
- Ready for next scheduled Tier-2 at 2026-05-22T22:35Z (4h later) or on-demand.
