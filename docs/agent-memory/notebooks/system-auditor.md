# System Auditor — Notebook

**Last updated:** 2026-05-22T14:30:21Z | **Current Tier:** TIER-2 | **Sprint:** 1970+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-2 (14:30–14:35 UTC 2026-05-22) — CURRENT

**Tier:** 2 (Data Freshness Sweep)
**Duration:** 5 min | **Sources checked:** 27 (prices, news, BCTC, FX, commodities, RSS, macro) | **VPS routes:** 7
**Cron gaps:** 0 (all jobs on schedule within 2× cadence)
**Anomalies detected:** 3 NEW (1 CRITICAL price, 2 WARN DB freshness) + 1 DEDUP-SKIPPED (B-08 BCTC)

### Findings

**Data Freshness (via get_sla_status):**
- **PRICE (ssc-iboard) — CRITICAL NEW**: Age 45 min vs SLA 10 min (350% breach). VPS last push 2026-05-22 09:00:00 (5.5h stale). Expected cadence 0.25h (15 min). Check ID: **B-01**.
- **BCTC (bctc-push) — CRITICAL DEDUP**: Age 716 min vs SLA 360 min. VPS last push 2026-05-19 07:05:07 (2d 7h stale). Carry-over from 2026-05-19T07:05Z (within 7-day window). Check ID: **B-08** (DEDUP-SKIP).
- **FOREIGN-FLOW — SUPPRESS**: Age 330 min vs SLA 10 min (3200% breach). Current UTC 14:30 = post-market (VN market 02:00–08:30 UTC M-F). Gate suppression applies per spec. Check ID: **B-02** (suppressed, no BUG write).
- **NEWS (news-vps) — PASS**: Age 20 min vs SLA 30 min (fresh). VPS last push 2026-05-22 14:30:01 (< 1 min ago).
- **SBV_FX (sbv-vps) — PASS**: Age 0 min vs SLA 30 min (fresh). VPS last push 2026-05-22 14:30:10 (< 1 min ago).

**VPS Proxy Routes (B-06, B-07):**
- All 7 routes operational: prices, bctc, muasamcong, bctc-files, foreign-flow, sbv, news.
- Status: PASS (all routes > ok; vpsProxyWatchdogJob 100% success).

**BCTC URL Shape (B-09):**
- Query: bctc_queue where url LIKE '%ssc.gov.vn%' = 0 (no invalid URLs).
- Status: PASS.

**Stale Pending BCTC (B-13):**
- Query: bctc_queue status='pending' AND created_at < -72h = 0 items.
- Status: PASS.

**DB Freshness Spot Checks (C-06, C-07):**
- **C-06 (news_articles > 3h): 0 articles — WARN NEW**. Expected ≥ 1 during active hours. Last news push 14:30Z is fresh (vps), but DB not populated yet (lag?). Monitor next cycle.
- **C-07 (agent_signals > 24h): 0 signals — WARN NEW**. Expected ≥ 1. May indicate signal generation gap or DB purge. Monitor next cycle.

**Cron Fire Gaps (A-29):**
- systemAuditTier2: Expected every 4h (0 */4 * * *). Last fire 2026-05-22 10:00Z, next expected 14:00Z (on schedule now).
- Major jobs (intelligenceCycleJob, alertScanParallelJob, freshnessSlaMonitor, newsHeadlinesRefresh): 99%+ success; no gaps > 2× cadence.
- Status: PASS.

**VPS Service Health (per get_vps_service_health):**
- 3 healthy (vn-bctc-fetch, vn-news-fetch, vn-sbv-fetch), 2 idle (vn-foreign-flow, vn-price-fetch — market closed).
- Status: OPERATIONAL.

**API Rate Limits (B-12):**
- All 12 hosts ready (100% available, 0% rate-limited).
- Status: PASS.

### Anomalies Summary

| Check ID | Severity | Type | Status | Dedup Key | Action |
|---|---|---|---|---|---|
| **B-01** | CRITICAL | ssc-iboard stale | NEW | data_stale:ssc-iboard:B-01 | **→ BUG TG** |
| **B-08** | CRITICAL | BCTC stale | DEDUP-SKIP | data_stale:bctc-push:B-08 | → DASHBOARD (no BUG) |
| **B-02** | CRITICAL | foreign-flow stale | SUPPRESS | (post-market gate) | → SUPPRESS (no BUG, no DASHBOARD) |
| **C-06** | WARN | news freshness gap | NEW | db_integrity_breach:news_articles:C-06 | **→ BUG TG** |
| **C-07** | WARN | agent signals gap | NEW | db_integrity_breach:agent_signals:C-07 | **→ BUG TG** |

### System Health at 14:30Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Data sources (27 total) | Freshness | 25 PASS, 2 CRITICAL | DEGRADED |
| VPS routes (7 total) | Health | 7/7 operational | OPERATIONAL |
| VPS service fleet | Status | 3 healthy, 2 idle | OPERATIONAL |
| Cron jobs (57 total) | Fire gaps | 0 gaps > 2× cadence | PASS |
| API rate limits (12 hosts) | Utilization | 0% at limit | PASS |
| DB freshness spot checks | Articles/Signals | 0 articles, 0 signals | DEGRADED |
| Overall | State | DEGRADED | 3 new anomalies + 1 dedup-skip |

---

## Tier-2 Data Freshness Summary

**Cycle: 2026-05-22T14:30Z**

**Result: DEGRADED (3 new anomalies + 1 dedup-skip)**

**New anomalies (→ BUG Telegram):**
1. **B-01 (CRITICAL)**: ssc-iboard price stale — 45 min vs 10 min SLA. VPS last push 5.5h ago (09:00Z).
2. **C-06 (WARN)**: news_articles DB empty — 0 articles in past 3h (expected ≥ 1).
3. **C-07 (WARN)**: agent_signals DB empty — 0 signals in past 24h (expected ≥ 1).

**Dedup-skipped (→ DASHBOARD only, no BUG):**
1. **B-08 (CRITICAL)**: BCTC stale since 2026-05-19 07:05Z (within 7-day window).

**Suppressed (no BUG, no DASHBOARD):**
1. **B-02 (CRITICAL)**: foreign-flow stale at 330 min (post-market 14:30 UTC; gate suppression applies).

**Carry-over dedup-gated issues (from Tier-1):**
- A-21/A-21b: vnstock refresh crashes — gate to 2026-05-22T21:00Z
- A-21c: dailyDashboardJob ENOENT — gate to 2026-05-22T16:30Z
- A-29: Reuters + Trading-Econ RSS circuits OPEN (84 failures, fallback operational)

**Next scheduled audits:**
- Tier-1 (Runtime Ping): 2026-05-22T15:00Z (every 30 min)
- Tier-2 (Data Freshness Sweep): 2026-05-22T18:00Z (every 4h)
- Tier-3 (Deep DB Integrity): 2026-05-23T02:00Z (daily at 02:00 UTC)

**Signals emitted:** 3 new (1 CRITICAL price, 2 WARN DB freshness)

**DASHBOARD.md updated:** Yes (B-01 new row + carry-over B-08 + B-02 suppressed)

---

## Previous Audit Run Tier-1 (14:03–14:04 UTC 2026-05-22)

- Tier: 1 (Runtime Ping)
- Containers checked: 11/11 UP (mcp-server 10h, stock-price 9h, rest 42h+ stable)
- Health endpoints: 11/11 responding at 200 OK
- Restart counts (mcp-server/api-gateway/stock-price/alert-engine/pdf-extractor): 0/0/0/0/0 (clean)
- Memory usage: all services <50% (no pressure alerts)
- Circuit breakers: 16/16 green per get_system_status snapshot
- Cron status: major jobs 99%+ success; 3 dedup-gated issues stable; bctcReparseJob 85.4%
- Data freshness: BCTC 11.5h stale (continuing B-08 OPEN-STALE observation)
- EPIPE/ECONNRESET in 30m logs: 0 occurrences
- **Anomalies detected: 0 NEW anomalies this cycle**

---

## Tier-1 Runtime Ping Summary

**Cycle: 2026-05-22T14:03Z**

Tier-1 audit scope: container liveness, health endpoints, restart counts, memory pressure, system status rollup.

**Result: HEALTHY (0 new anomalies)**

All 11 core services UP and operational:
- mcp-server: Up 10h, healthy, 0 restarts
- stock-price: Up 9h, healthy, 0 restarts
- api-gateway, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor, rag-service, news-fetch, frontend: all Up 42h+, healthy

Health endpoints: 11/11 at HTTP 200 (all services responding normally).

Circuit breakers: 16/16 green (no new state changes).

Cron job success rates (7d window):
- Major jobs (intelligenceCycleJob, alertScanParallelJob, freshnessSlaMonitor, newsHeadlinesRefresh, pollNewsJob, vpsServiceHealthJob): 99–100%
- Known dedup-gated (vnstockFundamentalsRefresh, vnstockTradingStatsRefresh, dailyDashboardJob): within 7-day window, skip BUG write
- bctcReparseJob: 85.4% (known NFR-3 defer-freeze)

Data freshness (most recent get_system_status snapshot 14:03Z):
- HOSE prices, news RSS, commodities, SBV FX, Polymarket: ≤0.6h age (fresh)
- BCTC: 11.5h age (stale, B-08 OPEN-STALE continuing observation)

---

## Session Notes

- 14:30Z: Tier-2 freshness sweep — 3 new anomalies (B-01 CRITICAL price stale, C-06 WARN news empty, C-07 WARN signals empty) + 1 dedup-skip (B-08 BCTC). VPS routes operational. DB spot checks reveal empty news/signals tables (investigate liveness). Price freshness dropped to 45 min (SLA 10 min). Foreign-flow stale but suppressed (post-market gate). BUG TG: 3 alerts. DASHBOARD: B-01 new + B-08 carry-over.
