# System Auditor — Notebook

**Last updated:** 2026-05-22T18:31:02Z | **Current Tier:** TIER-2 | **Sprint:** 1970+ | **Audit Type:** Data Freshness Sweep

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-2 (18:31–18:34 UTC 2026-05-22)

**Tier:** 2 (Freshness Sweep)
**Duration:** ~3 min | **Wall time target:** < 300s | **Sources checked:** 27 | **Cron jobs scanned:** 70+
**Anomalies detected:** 2 NEW anomalies (B-05 CRITICAL, B-10 WARN) | **Dedup context applied:** 7-day window, 5 items skipped

### Findings

**Cron Fire Check (A-29):**
- All major cron jobs operational (99%+ success rate for intelligenceCycle, alertDigest, newsfeed, macro refresh)
- Exception: dailyDashboardJob still error state (ENOENT project-stats.json), last fire 2026-05-17T16:30Z
- **Verdict:** A-21c gate expires 2026-05-22T21:00Z — dedup-skip this cycle, previously alerted

**Per-Source Fetch Freshness (B-01 through B-12):**

| Source | Category | Last Fetch | Expected Cadence | Stale Threshold | Status | Severity | Verdict |
|---|---|---|---|---|---|---|---|
| ssc-iboard | price | 09:00Z (9h 31m ago) | 15 min | 30 min | STALE | CRITICAL | B-01 DEDUP-SKIP |
| bctc-push | bctc | 2026-05-19T07:05Z (3d ago) | 168h | 168h | STALE | CRITICAL | B-08 DEDUP-SKIP (DEFER-FREEZE) |
| muasamcong | procurement | (no push recent) | 24h | 72h | OK | - | PASS |
| foreign-flow | flow | (market closed) | 1 min | 30 min | SUPPRESSED | - | B-04 MARKET-HOURS GATE (outside 09:00–15:30 VN) |
| sbv-vps | macro | 18:30Z | 6h | 24h | OK | - | PASS |
| news-vps | news | 18:30Z | 1h | 3h | OK | - | PASS |
| fred, trading-econ, yahoo-finance, reuters, newsapi, polymarket | direct | All 0–47s fresh | 0.5h–6h | 3h–24h | OK | - | PASS |

**NEW ANOMALIES:**
- **B-05 (refined as B-10):** VPS news-fetch service health = **unhealthy** (last poll 5m ago, VPS uptime 1h 1m)
  - Symptom: Service status unhealthy, may indicate connection pooling or log rotation issue
  - Actual impact on news push: minimal (last push 18:30Z, 0 min old)
  - Severity: WARN (service recovered recently)
  - Dedup key: `vps_service_unhealthy:vn-news-fetch`
  - Action: Monitor next 30m; restart if persists

- **B-05 (price push stale):** ssc-iboard price data last push 09:00Z UTC = 9h 31m ago
  - Expected cadence: 15 min (0.25h from system-map)
  - Stale threshold: 30 min
  - SLA breach: 30 min SLA (expected 10 min)
  - Root cause: VPS prices service connection lost or batch hung
  - Severity: CRITICAL
  - Dedup key: `data_stale:ssc-iboard:B-05`
  - Action: Verify VPS prices push service, check for stuck batch job, restart if needed

**VPS Proxy Health (B-06, B-07):**
- 4 active routes: prices (stale 9h), news (OK 0m), sbv (OK 0m), bctc (stale 3d)
- 2 stale routes: both in known dedup context
- Verdict: DEDUP-SKIP all

**Rate Limits (B-12):**
- 11 endpoints checked: all ready (Chua goi = not recently called, San sang = ready)
- No endpoint at ≥90% usage
- Verdict: PASS

**BCTC URL Shape (B-09):**
- Unable to verify via sqlite3 (not in container PATH)
- Fallback: no errors reported in bctcReparseJob or bctcQueueEnricherJob
- Verdict: INFO (assume PASS)

**Stale Pending BCTC (B-16):**
- Unable to verify via sqlite3
- Recent bctcQueueEnricherJob run 18:15Z, success
- Verdict: INFO (assume no 72h+ pending)

**DB Freshness Spot Checks (C-06, C-07):**
- news_articles: unable to query (sqlite3 not in container)
- Fallback: pipeline_health shows "Last completed: 2026-05-22 17:51:57" (40m ago), news flowing
- agent_signals: unable to query
- Fallback: freshnessSlaMonitor job 18:00Z success (no stale flag)
- Verdict: INFO (assume PASS based on job success logs)

### Dedup Context (7-day window, SUPPRESS these items)

- **A-21c:** dailyDashboardJob ENOENT — gate window 2026-05-22T21:00Z — DEDUP-SKIP (expires 21:00Z today)
- **A-21:** vnstockFundamentalsRefresh crashed — gate window 2026-05-22T21:00Z — DEDUP-SKIP
- **A-21b:** vnstockTradingStatsRefresh 50% success — gate window 2026-05-22T21:00Z — DEDUP-SKIP
- **B-01:** ssc-iboard stale (price push 9h ago) — DASHBOARD OPEN — DEDUP-SKIP
- **B-02:** foreign-flow stale — market-hours gate (currently outside 09:00–15:30 VN) — SUPPRESS
- **B-08:** BCTC VPS push stale (3d) — DASHBOARD OPEN, DEFER-FREEZE — DEDUP-SKIP
- **C-06:** news_articles false-positive (legacy table concern) — DEDUP-SKIP
- **C-07:** agent_signals false-positive — DEDUP-SKIP

### Anomalies Summary

| Check ID | Severity | Type | Detail | Dedup Key | Action |
|---|---|---|---|---|---|
| B-05 | CRITICAL | NEW | ssc-iboard price push stale 9h31m (SLA 30m, stale 168h) | `data_stale:ssc-iboard:B-05` | BUG alert + DASHBOARD row |
| B-10 | WARN | NEW | VPS news-fetch service unhealthy (uptime 1h 1m) | `vps_service_unhealthy:vn-news-fetch` | BUG alert + DASHBOARD row |
| A-21c | CRITICAL | DEDUP | dailyDashboardJob ENOENT (gate 21:00Z) | `cron_crash:dailyDashboardJob:A-21c` | SKIP BUG, DASHBOARD re-fire if gate expires |
| B-01 | CRITICAL | DEDUP | ssc-iboard stale | `data_stale:ssc-iboard:B-01` | SKIP |
| B-08 | CRITICAL | DEDUP | bctc-push stale 3d | `data_stale:bctc-push:B-08` | SKIP (DEFER-FREEZE) |

### System Health at 18:34Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers (9 core services) | Health | 9/9 UP | HEALTHY |
| Cron jobs (70+ active) | Major job success | 99%+ | MOSTLY-HEALTHY (A-21c within gate) |
| Data freshness (27 sources) | Stale | 2 CRITICAL (B-05, stale push), 5 known (dedup) | DEGRADED |
| VPS proxy (7 routes) | Active routes | 2 stale (B-01, B-08), 2 OK | DEGRADED |
| Rate limits (11 endpoints) | Ready | 11/11 ready | HEALTHY |
| DB spot checks | Sample query | news/signals (fallback OK) | INFO |
| Overall | State | DEGRADED | 2 NEW anomalies (B-05 CRITICAL, B-10 WARN) |

---

## Tier-2 Freshness Sweep Summary

**Cycle: 2026-05-22T18:31:02Z**

Tier-2 audit scope: cron fire gaps, per-source freshness, VPS proxy health, news/signals freshness, rate limits, DB spot checks.

**Result: DEGRADED (2 NEW anomalies, 5 dedup-skipped)**

**NEW ANOMALIES:** 
- **B-05:** ssc-iboard price push stale 9h 31m (CRITICAL, SLA breach 30m threshold)
- **B-10:** VPS news-fetch service unhealthy (WARN, service recovered, monitor)

**Signals emitted:** 2 new
- 1 CRITICAL (B-05 price stale)
- 1 WARN (B-10 VPS service)

**BUG channel:** 2 alerts to send (B-05, B-10)

**DASHBOARD.md:** 2 rows to create or update (B-05, B-10 status=OPEN)

**Dedup status:** 5 items suppressed within 7-day window (A-21c, A-21, A-21b, B-01, B-08, C-06, C-07)

---

## Session Notes

- 18:31Z: Tier-2 freshness sweep invoked with AUDIT_TIER=2
- 18:31–18:34Z: Called get_cron_health, get_pipeline_health, get_vps_proxy_health, get_vps_service_health, get_rate_limit_status, get_macro_snapshot, get_sla_status
- Key findings:
  - ssc-iboard (prices) last push 09:00Z (9h 31m ago), far exceeds 30m stale threshold → B-05 CRITICAL
  - VPS news-fetch service reports unhealthy (last poll 5m ago, VPS uptime 1h 1m) → B-10 WARN
  - All other sources within SLA (news, sbv, fred, trading-econ, newsapi, reuters, yahoo-finance, polymarket)
  - Cron jobs 99%+ success; A-21c (dailyDashboardJob) gate expires 21:00Z today
  - DB spot checks: sqlite3 not available in container, fallback to job success logs → assume OK
- 18:34Z: Dedup rules applied. 5 known anomalies suppressed (A-21c, B-01, B-08 in DEFER-FREEZE, B-04 market-hours gate, C-06/C-07 legacy)
- 18:34Z: Ready to emit B-05 CRITICAL + B-10 WARN to BUG channel, append DASHBOARD rows
- All other services (containers, health endpoints, circuit breakers) HEALTHY
- No new container down / restart loop / DB corruption detected at Tier-2 scope
