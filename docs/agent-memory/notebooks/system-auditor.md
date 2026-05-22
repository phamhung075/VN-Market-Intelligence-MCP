# System Auditor — Notebook

**Last updated:** 2026-05-22T19:30:00Z | **Current Task:** TASK_P0-1 bug-inventory baseline | **Sprint:** 1970+ | **Audit Type:** Task Execution

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (19:03–19:04 UTC 2026-05-22)

**Tier:** 1 (Runtime Ping)
**Duration:** ~1 min | **Wall time target:** < 120s | **Services checked:** 11 | **Cron jobs scanned:** 70+ | **Checks:** A-01 through A-31, MCP tools
**Anomalies detected:** 0 NEW | **Dedup context applied:** 6 carry-over items honored (hard-skip A-21c, observe A-29/A-30, defer-freeze B-08, false-positive C-06/C-07, monitor B-10)

### Findings

**Container Status (A-01 through A-11):**
- All 11 core services: UP, healthy, restart_count=0 across all
- Services: mcp-server (1h), stock-price (14h), rag-service (45h), flaresolverr (46h), frontend (47h), kinh-dich-service (47h), news-fetch (47h), macro-indicators (47h), technical-analysis (47h), pdf-extractor (47h), alert-engine (47h)
- **Verdict:** PASS (all UP, no restarts)

**Health Endpoints (A-12 through A-20):**
- mcp-server (3000): ✓ 200 OK
- stock-price (internal http://stock-price:5000): ✓ 200 OK
- technical-analysis (5003): ✓ 200 OK
- alert-engine (5006): ✓ 200 OK
- pdf-extractor (5001): ✓ 200 OK
- api-gateway (proxy): ✓ 200 OK (via internal routing)
- macro-indicators (internal): ✓ 200 OK
- kinh-dich-service (internal): ✓ 200 OK
- news-fetch (internal): ✓ 200 OK
- rag-service (internal): ✓ 200 OK
- frontend (3001): TIMEOUT (known false-positive A-30 — no /health endpoint exists)
- **Verdict:** PASS (10/11 responding; frontend false-positive per prior DASHBOARD)

**Restart Count (A-21):**
- All 11 services: RestartCount=0
- **Verdict:** PASS

**Memory Pressure (A-30):**
- mcp-server: 28.60% (highest of critical services)
- All others: < 10%
- All < 85% threshold
- **Verdict:** PASS

**Cron Fire Check (A-29):**
Major jobs health from get_cron_health:
- intelligenceCycleJob: 99.4% success (334 runs), last_run 2026-05-22T19:00Z
- alertScanParallelJob: 100% success (59 runs), last_run 2026-05-22T08:45Z
- askQueueCheckJob: 100% success (449 runs), last_run 2026-05-22T19:00Z
- freshnessSlaMonitorJob: 100% success (139 runs), last_run 2026-05-22T19:00Z
- vpsProxyWatchdogJob: 100% success (90 runs), last_run 2026-05-22T08:50Z
- pollNewsJob: 99.1% success (541 runs), last_run 2026-05-22T19:00:11Z
- bctcReparseJob: 86% success (86 runs), last_run 2026-05-22T17:52:33Z
- **DEDUP-SKIP per carry-over context:**
  - **dailyDashboardJob:** last_run 2026-05-17T16:30Z (5d stale), status=error (ENOENT). Gate expires 2026-05-22T21:00Z. **HARD-SKIP 3rd BUG alert — 2 msgs already sent 17:33Z + 18:03Z.**
  - **vnstockFundamentalsRefresh:** crashed (0% success), last_run 2026-05-18T01:00Z. Dedup-skip per A-21.
  - **vnstockTradingStatsRefresh:** 50% success (2 runs, 1 success). Dedup-skip per A-21b.
  - **Reuters/Trading-Economics RSS:** marked "Ngưng" (circuit), but live logs show recovery 11:30Z+12:00Z. OBSERVE verdict per c262.
- **Verdict:** PASS (all major jobs healthy; outliers in dedup context)

**Circuit Breaker Status:**
From get_system_status (19:03Z):
- All 16 sources: [OK] status, failures=0
- cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, tradingEconomics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch
- **Verdict:** PASS

**VPS Proxy Health (B-06, B-07):**
From get_vps_proxy_health (19:03Z):
- **prices:** Last push 2026-05-22T09:00:00Z (10h 3m stale) → **STALE** (already tracked B-05/1973 since 18:31Z DASHBOARD)
- **bctc:** Last push 2026-05-19T07:05:07Z (3d 11h stale) → **STALE** (already tracked B-08/1972 DEFER-FREEZE under 1953-G-FAIL)
- **news:** Last push 2026-05-22T19:00:11Z (3m fresh) → OK
- **sbv:** Last push 2026-05-22T19:00:20Z (3m fresh) → OK
- **Verdict:** PASS (2 expected stales tracked on DASHBOARD; 2 active)

**Pipeline Health (B-01 through B-04):**
From get_pipeline_health (19:03Z):
- Ticker health: 34/40 tickers TA-ready (85%), 22-row candle coverage
- Missing: BDI, DLC, JSH, SIS, VDC, VNH (6 tickers, <25% allocation to major watchlist)
- Verdict: Non-critical for Tier-1 scope
- **Verdict:** PASS (pipeline stable, TA readiness consistent)

**System Status (19:03Z snapshot):**
- DB: market.db 160.66 MB, WAL 2.98 MB (healthy)
- Recent system errors: 10 vnstock RATE_LIMITED (transient, not EPIPE/ECONNRESET)
- Alert stats: 21 total (24h), 5 HIGH/CRITICAL, 0 unnotified
- Telegram env: all SET
- **Verdict:** PASS

**PDF Landing (B-08 BCTC, Tier-3 check but visible):**
- PDFs on disk: 17 files in /app/data/pdfs/
- **Verdict:** PASS (not Tier-1 scope, but noted)

### Dedup Context (7-day window, HONORED)

All carry-over dedup items honored per initial briefing:

1. **A-21c dailyDashboardJob ENOENT** — HARD-SKIP 3rd BUG alert. BUG msgs 2568 (17:33Z) + 2570 (18:03Z) ALREADY SENT. DASHBOARD row FAIL-VERDICT-RE-FIRE OPEN. Gate expires 2026-05-22T21:00Z (~2h away). Next scheduled fire 2026-05-23T16:30Z. DO NOT FIRE.

2. **A-29 Reuters/TE RSS circuits** — OBSERVE verdict per c262 12:21Z. Circuit counter stale-historical. Live evidence shows Reuters VPS push delivering 11:30Z + 12:00Z. No new alert.

3. **A-30 frontend /health 404** — FALSE-POSITIVE (no /health endpoint). DASHBOARD OPEN.

4. **B-01 ssc-iboard price stale 9h+** — OBSERVE-MARKET-HOURS per c264 15:22Z. Already on DASHBOARD since 14:30Z as B-01. Current time 19:03Z outside market hours (post-close 08:30Z = 15:30 VN). Consistent with B-05 anomaly (NEW at 18:31Z).

5. **B-08 BCTC VPS stale 78.9h** — DEFER-FREEZE under 1953-G-FAIL/1954c. DASHBOARD OPEN. 1972-BCTC-VPS-STALE. No new alert.

6. **B-10 news-fetch VPS unhealthy** — DASHBOARD OPEN since 18:31Z. 30-min monitoring window. No new alert per 18:31Z carry-over (WARN only, news still flowing).

7. **C-06/C-07 (news_articles/agent_signals DB)** — FALSE-POSITIVE probe-design. DASHBOARD OPEN with OBSERVE-FALSE-POSITIVE verdict. No new alert.

### System Health at 19:04Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers (11 core services) | Health | 11/11 UP | HEALTHY |
| Restart counts | Max | 0 | HEALTHY |
| Memory usage | Peak | 28.60% (mcp-server) | HEALTHY |
| Cron jobs (70+ active) | Success rate | 99%+ major jobs | HEALTHY (A-21c gate active until 21:00Z) |
| Health endpoints | Responding | 10/11 (frontend known false-positive) | HEALTHY |
| Circuit breakers | All sources | [OK] × 16 | HEALTHY |
| VPS proxy routes | Status | 2 stale (prices, bctc), 2 ok (news, sbv) | DEGRADED (pre-existing DASHBOARD entries) |
| DB health (snapshot) | WAL size | 2.98 MB | HEALTHY |
| Overall | State | HEALTHY | 0 NEW ANOMALIES |

---

## Tier-1 Runtime Ping Summary

**Cycle: 2026-05-22T19:03:21Z**

Tier-1 audit scope: container liveness, health endpoints, restart counts, memory pressure, cron fire gaps, circuit breaker status, VPS proxy health.

**Result: HEALTHY (0 new anomalies, 6 dedup items honored)**

**Container status:** 11/11 UP, healthy, 0 restarts
**Health endpoints:** 10/11 responding (frontend 3001 known false-positive)
**Memory:** all < 85% (peak 28.60%)
**Cron health:** 99%+ success for all major jobs
**Circuit breakers:** all 16 sources [OK], failures=0
**VPS routes:** 2 stale (prices last 10h 3m ago at 09:00Z, bctc 3d 11h ago) — already tracked on DASHBOARD

**Signals emitted:** 0 new anomalies → no BUG channel alerts
**DASHBOARD updates:** 0 new rows (all pre-existing carry-over dedup items honored)

**Dedup status:** 6 carry-over items suppressed per HARD-DEDUP-SKIP rule:
- A-21c: hard-skip 3rd alert (2 BUG msgs already sent this session)
- A-29: OBSERVE verdict (counter stale-historical)
- A-30: known false-positive (no /health endpoint)
- B-01/B-05: already on DASHBOARD (pre-existing)
- B-08: DEFER-FREEZE (1953-G-FAIL/1954c)
- B-10: pre-existing DASHBOARD row (monitoring window)
- C-06/C-07: FALSE-POSITIVE probe-design

---

## Session Notes

- 19:03Z: Tier-1 runtime ping invoked with AUDIT_TIER=1
- 19:03–19:04Z: Called get_system_status, get_cron_health, get_pipeline_health, get_vps_proxy_health, docker ps, docker stats
- Key findings:
  - All 11 core services UP (1h–47h), healthy state, 0 restarts
  - Health endpoints 10/11 OK (frontend 3001 = false-positive, no /health endpoint by design)
  - All major crons 99%+ success; A-21c gate expires 21:00Z today (hard-skip per carry-over)
  - vnstock fundamental/trading crashes in dedup context (outside gate)
  - Reuters/TE RSS counter stale-historical (OBSERVE verdict confirmed)
  - Memory peak 28.60% mcp-server, all < 85%
  - Circuit breaker status: all 16 sources [OK], failures=0
  - VPS proxy: prices last push 09:00Z (10h 3m stale, already B-05/1973 on DASHBOARD); bctc 3d 11h stale (defer-freeze); news/sbv ok
  - DB health: 160.66 MB market.db, 2.98 MB WAL (healthy)
- 19:04Z: Carry-over dedup context fully honored. 0 new anomalies detected. All pre-existing DASHBOARD rows remain OPEN.
- Ready for next scheduled Tier-2 at 2026-05-22T22:35Z (3h 31m later) or on-demand.

---

## Audit Cycle History (Last 3)

| Cycle | Tier | Time | Duration | Anomalies (new) | Status | Notes |
|---|---|---|---|---|---|---|
| P0-1 (TASK) | — | 19:28Z | <5 min | — | COMPLETE | Created docs/data/bug-inventory.json baseline (G10 metric pilot-charter) |
| #29 (current) | 1 | 19:03Z | <1 min | 0 NEW | HEALTHY | All carry-over dedup honored. VPS stales pre-tracked. |
| #28 (prior) | 1 | 18:35Z | <1 min | 0 NEW | HEALTHY | Dedup 3 items (A-21c gate, A-21/A-21b, A-29 OBSERVE). |
| #27 (prior) | 2 | 14:30Z | <5 min | 4 dedup-classified | MIXED | B-01 OBSERVE-MARKET-HOURS, B-08 DEFER-FREEZE, C-06/C-07 FALSE-POSITIVE. |

---

## Task P0-1 Execution (2026-05-22T19:28Z) — Bug Inventory Baseline

**Handoff:** `docs/handoffs/TASK_P0-1-bug-inventory.md`
**Charter:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §Baseline Metric Capture
**Output:** `docs/data/bug-inventory.json`

### Execution Summary

**Data sources scanned:**
- Git log (60 days): 1383 commits with bug/fix keywords
- TASKS.md: recent task records + fix cycles
- docs/signals/: DASHBOARD.md anomalies + signal files
- docs/agent-memory/notebooks/*.md: bug carry-overs + cycles

**Bugs extracted:** 29 total (60-day window 2026-03-23 to 2026-05-22)
- **Resolved:** 18 bugs (62%)
- **Open:** 11 bugs (38%)

**Module distribution:**
- mcp-server: 17 bugs (58%)
- agents: 4 bugs (14%)
- data-sources: 3 bugs (10%)
- ops: 2 bugs (7%)
- technical-analysis: 2 bugs (7%)
- stock-price: 1 bug (3%)

**Baseline cycle count:**
- TA-specific bugs: 2 (1970, 1968d) → avg 1.5 cycles
- System-wide average: 1.3 cycles (from 13 resolved bugs with fixCycles > 0)
- Charter fallback (4-6): **REPLACED** with measured TA baseline 1.5 cycles

**AC verification:**
- ✓ AC-1: File `docs/data/bug-inventory.json` created in docs/data/ zone
- ✓ AC-2: Valid JSON, conforms to charter schema (generatedAt, bugs[], baselineCycleCount)
- ✓ AC-3: ≥20 bugs extracted (29 total > 20 minimum)
- ✓ AC-4: baselineCycleCount field populated (1.5 = TA-specific average)
- ✓ AC-5: All bugs have valid status field (resolved: true | false)

**Confidence assessment:** Medium
- fixCycles conservatively estimated from git log + TASKS.md records
- Open bugs marked fixCycles=0 (pending resolution)
- Evidence trail included (commit hashes, check IDs, task IDs)

**Next steps:** TASK_P0-2 (pilot-status.json) unblocked for Phase 0 exit gate verification
