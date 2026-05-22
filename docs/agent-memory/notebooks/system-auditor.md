# System Auditor — Notebook

**Last updated:** 2026-05-22T14:33:16Z | **Current Tier:** TIER-1 | **Sprint:** 1970+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (14:33–14:34 UTC 2026-05-22) — CURRENT

**Tier:** 1 (Runtime Ping)
**Duration:** 1 min | **Containers checked:** 11/11 | **Health endpoints:** 10/11 (1 timeout) | **Restart counts:** all 0
**Memory pressure:** all <85% (max 47% mcp-server) | **Circuit breakers:** 16/16 green
**EPIPE/ECONNRESET in 30m logs:** 0 occurrences
**Anomalies detected:** 0 NEW anomalies

### Findings

**Container Status (A-01 through A-11):**
- mcp-server: Up 11h (healthy) ✓
- api-gateway: Up 42h+ (healthy) ✓
- stock-price: Up 10h (healthy) ✓
- technical-analysis: Up 42h+ (healthy) ✓
- macro-indicators: Up 42h+ (healthy) ✓
- kinh-dich-service: Up 42h+ (healthy) ✓
- alert-engine: Up 42h+ (healthy) ✓
- pdf-extractor: Up 42h+ (healthy) ✓
- rag-service: Up 41h (healthy) ✓
- news-fetch: Up 42h+ (healthy) ✓
- frontend: Up 42h (healthy) ✓
- Status: PASS (11/11 UP)

**Health Endpoints (A-12 through A-20):**
- mcp-server:3000 → 200 OK ✓
- api-gateway:4000 → 200 OK ✓
- stock-price:5010 → 200 OK ✓
- technical-analysis:5003 → 200 OK ✓
- macro-indicators:5004 → 200 OK ✓
- kinh-dich-service:5005 → 200 OK ✓
- alert-engine:5006 → 200 OK ✓
- pdf-extractor:5001 → 200 OK ✓
- rag-service:5002 → 200 OK ✓
- news-fetch:5008 → 200 OK ✓
- frontend:3001 → TIMEOUT (no /health endpoint) — running, container healthy
- Status: 10/11 PASS (INFO level for frontend — no endpoint)

**Restart Count (A-21):**
- All 11 services: 0 restarts (clean)
- Status: PASS

**Memory Pressure (A-30):**
- mcp-server: 47.12% ✓
- stock-price: 2.02% ✓
- alert-engine: 2.44% ✓
- pdf-extractor: 2.26% ✓
- All < 85% threshold
- Status: PASS

**Circuit Breaker Status (via get_system_status):**
- 16/16 sources reporting OK (cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, tradingEconomics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch)
- Status: PASS (16/16 green)

**Cron Health (A-29):**
- Major jobs (intelligenceCycleJob, alertScanParallelJob, freshnessSlaMonitor, newsHeadlinesRefresh): 99–100% success
- systemAuditTier1: Expected every 30 min. Last fire 14:03Z, next expected 14:33Z (on schedule).
- Known carry-over issues (within 7-day dedup window):
  - A-21: vnstockFundamentalsRefresh crashed (gate to 2026-05-22T21:00Z) — SUPPRESS BUG
  - A-21b: vnstockTradingStatsRefresh 50% success (gate to 2026-05-22T21:00Z) — SUPPRESS BUG
  - A-21c: dailyDashboardJob ENOENT /docs/data/project-stats.json (gate to 2026-05-22T16:30Z) — SUPPRESS BUG
- bctcReparseJob: 85.4% (known NFR-3 defer-freeze, canonical)
- Reuters + Trading-Econ RSS circuits: 88 failures each (fallback operational, A-31 canonical)
- Status: PASS (no new gaps > 2× cadence)

**EPIPE Crash Check (A-31):**
- Query: `docker logs --since=30m mcp-server | grep -c "EPIPE|ECONNRESET"` = 0
- Status: PASS (no transient pipe errors)

**Data Freshness Snapshot (per get_system_status):**
- HOSE prices: 0.8h age (fresh)
- News RSS: 0.4h age (fresh)
- SBV FX: 0.1h age (fresh)
- Commodities: 0.8h age (fresh)
- Polymarket: 0.1h age (fresh)
- BCTC: 12.0h age (stale, continuing B-08 observation from Tier-2)
- Status: PASS snapshot (freshness anomalies detected in Tier-2, not Tier-1 scope)

### Anomalies Summary

| Check ID | Severity | Type | Status | Action |
|---|---|---|---|---|
| (none new) | — | — | CLEAN | PASS |

**Carry-over dedup-gated issues (from Tier-2/prior cycles):**
- A-21: vnstockFundamentalsRefresh crashed (dedup_key: microservice_degraded:mcp-server:A-21, gate 2026-05-22T21:00Z)
- A-21b: vnstockTradingStatsRefresh 50% success (dedup_key: microservice_degraded:mcp-server:A-21b, gate 2026-05-22T21:00Z)
- A-21c: dailyDashboardJob ENOENT (dedup_key: microservice_degraded:mcp-server:A-21c, gate 2026-05-22T16:30Z)
- A-29: Reuters + Trading-Econ RSS circuits (dedup_key: microservice_degraded:mcp-server:A-29, canonical NFR)
- B-01: ssc-iboard stale (DASHBOARD OPEN from Tier-2 14:30Z)
- B-08: BCTC stale (DASHBOARD OPEN, dedup_key: data_stale:bctc-push:B-08)
- C-06: news_articles empty (DASHBOARD OPEN from Tier-2)
- C-07: agent_signals empty (DASHBOARD OPEN from Tier-2)

### System Health at 14:33Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers (11 total) | Health | 11/11 UP | HEALTHY |
| Health endpoints (10 monitored) | Response | 10/10 OK + 1 timeout | HEALTHY |
| Restart counts | Clean | 0 restarts all | HEALTHY |
| Memory pressure | Util | max 47% mcp-server | HEALTHY |
| Circuit breakers (16 total) | Status | 16/16 green | HEALTHY |
| Cron jobs (57 active) | Success rate | 99–100% major jobs | HEALTHY |
| EPIPE/ECONNRESET | 30m window | 0 occurrences | HEALTHY |
| Overall | State | HEALTHY | 0 new anomalies |

---

## Tier-1 Runtime Ping Summary

**Cycle: 2026-05-22T14:33Z**

Tier-1 audit scope: container liveness, health endpoints, restart counts, memory pressure, cron fire gaps, system status rollup.

**Result: HEALTHY (0 new anomalies)**

All 11 core services UP and operational. Health endpoints responding normally (10/11 explicit endpoints, frontend has no /health — INFO level). Restart counts all 0 (clean). Memory all <85%. Circuit breakers 16/16 green. Cron jobs 99–100% success major jobs. No EPIPE/ECONNRESET in past 30m logs.

**Next scheduled audits:**
- Tier-1 (Runtime Ping): 2026-05-22T15:03Z (every 30 min)
- Tier-2 (Data Freshness Sweep): 2026-05-22T18:00Z (every 4h)
- Tier-3 (Deep DB Integrity): 2026-05-23T02:00Z (daily at 02:00 UTC)

**Signals emitted:** 0 new (0 CRITICAL, 0 WARN, 0 INFO new anomalies)

**BUG channel:** No new alerts (3 carry-over dedup-gated items suppressed per 7-day window)

**DASHBOARD.md:** No update (no new findings)

---

## Previous Audit Run Tier-2 (14:30–14:35 UTC 2026-05-22)

- Tier: 2 (Data Freshness Sweep)
- Sources checked: 27 (prices, news, BCTC, FX, commodities, RSS, macro)
- VPS routes: 7/7 operational
- Cron gaps: 0 gaps > 2× cadence
- Anomalies detected: 3 NEW (1 CRITICAL price, 2 WARN DB freshness) + 1 DEDUP-SKIPPED
- DB spot checks: news_articles 0 (expected ≥ 1 in 3h), agent_signals 0 (expected ≥ 1 in 24h)
- Status: DEGRADED (3 new anomalies)

---

## Session Notes

- 14:33Z: Tier-1 runtime ping — 0 new anomalies. All 11 containers UP, 10/11 health endpoints OK (frontend timeout, running), 0 restarts, max mem 47%, 16/16 circuit breakers green, 99–100% cron success, 0 EPIPE in 30m. Carry-over issues (A-21, A-21b, A-21c, A-29) in dedup window, no BUG write. DASHBOARD unchanged. Tier-1 PASS.
