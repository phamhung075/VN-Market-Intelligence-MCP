## c13 · 2026-08-09T02:42:43Z

### Audit Run Tier-3 (02:00–02:30 UTC 2026-08-09)
- Tier: 3 | Checks: 28 total (A:9, B:1, C:16)
- Findings: 2 warnings, 26 passes
- Status: DEGRADED

#### Check Results
**Container Tooling (A-22–A-24):** PASS (pdftoppm, tesseract, Vietnamese lang all present)
**Inter-Service Connectivity (A-25–A-28):** PASS (all 4 services healthy)
**EPIPE Crash (A-31):** PASS (0 crashes in 30m)
**BCTC PDFs (B-08):** PASS (313 files)

**DB Write Integrity (C-01–C-16):**
- C-01 (distinct codes): PASS (898 ≥ 25)
- C-02 (ohlcv rows): PASS (992 > 0)
- C-03 (financial reports): PASS (45 ≥ 26)
- C-04 (low confidence): PASS (0 ≤ 5)
- C-05 (BCTC URLs): PASS (0 ssc.gov.vn)
- C-06 (market_messages 3h): **WARN** (0 messages in 3h, idle)
- C-07 (agent_signals 24h): PASS (40 > 0)
- C-08 (orphaned alerts 2h): PASS (0 orphaned)
- C-09 (macro_indicators): PASS (3 ≥ 3)
- C-10 (pdf failed 24h): PASS (0 ≤ 2)
- C-11 (pdf done 48h): **WARN** (0 done, expected off-season)
- C-12 (DB integrity): PASS (ok)
- C-13 (WAL sizes): PASS (< 50MB)
- C-14 (code concentration): PASS (0.6% < 60%)
- C-15 (schema): PASS (all columns present)
- C-16 (stale pending): PASS (0 > 72h)

#### Warnings
- **C-06:** market_messages empty in last 3 hours (system idle, not an error)
- **C-11:** No 'done' PDF extractions in last 48 hours (BCTC is event-driven quarterly, expected off-season)

#### Assessment
Tier-3 deep audit shows healthy DB and service infrastructure. All integrity checks pass except for expected idle periods in message processing. System is operationally sound despite the cron failures documented in prior Tier-2 run (c12).



### Audit Run Tier-2 (02:20–02:24 UTC 2026-08-09)
- Tier: 2 | Scope: data freshness sweep, cron fire-gap check, VPS proxy health
- **CRITICAL FINDING: Cron Scheduler Failure — 23/90 jobs (26%) overdue since 2026-08-07 08:50 UTC (41.6 hours)**
- Status: **CRITICAL** (system-wide cron degradation requiring immediate ops escalation)

#### A-29 Cron Fire-Gap Check
**Source:** GET /api/cron-status layer_a[], call at 2026-08-09T02:20:42Z

**Critical Analysis:**
The cron scheduler has experienced a complete degradation. Jobs stopped firing after 2026-08-07 08:50:00 UTC. All jobs with activity after that timestamp show 41.5+ hours of overdue delay.

**CRITICAL MISSED (overdue by >36h threshold):**
1. morningBriefing: last_fire 2026-08-07 01:00:02, overdue 49.5h (threshold 36h) — **13.5h past SLA**
2. alertDigest: last_fire 2026-08-07 14:00:01, overdue 36.5h (threshold 36h) — **0.5h past SLA**
3. foreignFlowAlert: last_fire 2026-08-07 08:13:00, overdue 42.3h (threshold 36h) — **6.3h past SLA**
4. franceSummary: last_fire 2026-08-07 08:30:02, overdue 42.0h (threshold 36h) — **6h past SLA**
5. signalOutcomeJob: last_fire 2026-08-07 08:30:01, overdue 42.0h (threshold 36h) — **6h past SLA**
6. ohlcvStalenessCheck: last_fire 2026-08-07 08:15:00, overdue 42.2h (threshold 36h) — **6.2h past SLA**
7. marketEarningYield: last_fire 2026-08-07 09:30:01, overdue 41.0h (threshold 36h) — **5h past SLA**
8. alertOutcomeJob: last_fire 2026-08-07 08:45:01, overdue 41.7h (threshold 36h) — **5.7h past SLA**
9. vnstockTradingStatsRefresh: last_fire 2026-08-07 08:30:01, overdue 42.0h (threshold 36h) — **6h past SLA**
10. breadthHistoryPersister: last_fire 2026-08-07 08:37:00, overdue 41.8h (threshold 36h) — **5.8h past SLA**
11. ohlcvSanityCheckEarly: last_fire 2026-08-07 00:45:02, overdue 49.7h (threshold 36h) — **13.7h past SLA**

**STALE HIGH-FREQUENCY JOBS (overdue by critical margins):**
- vpsProxyWatchdog: every-10min job, last_fire 2026-08-07 08:50:00, overdue 41.6h (threshold 0.3h) — **138x over SLA**
- taAlertScan: last_fire 2026-04-24 08:45:00, overdue 2561.7h (threshold 0.4h) — **DEAD since April**
- bbAlertScan: last_fire 2026-04-24 08:45:00, overdue 2561.7h (threshold 0.4h) — **DEAD since April**
- taAlertNotifier: last_fire 2026-08-07 08:45:01, overdue 41.7h (threshold 0.4h) — **104x over SLA**
- priceUpdateWatchdog: last_fire 2026-08-07 08:50:01, overdue 41.6h (threshold 0.3h) — **138x over SLA**
- vnIndexRefresh: last_fire 2026-08-07 08:55:01, overdue 41.5h (threshold 0.1h) — **415x over SLA**
- brokerSanctionsSweep: last_fire 2026-07-31 08:00:01, overdue 210.5h (threshold 36h) — **5.8x over SLA**
- ragFtsRebuildCron: last_fire 2026-07-20 20:15:01, overdue 462.2h (threshold 36h) — **12.8x over SLA**

**NEAR-MISS LATE:**
- eveningSummary: last_fire 2026-08-07 15:30:01, overdue 35.0h (threshold 36h) — 1h from MISSED
- ohlcvDailyAggregator: last_fire 2026-08-07 15:03:00, overdue 35.4h (threshold 36h) — 0.6h from MISSED
- ohlcvSanityCheck: last_fire 2026-08-07 15:05:00, overdue 35.4h (threshold 36h) — 0.6h from MISSED

**ON-TIME JOBS:** intelligenceCycle, sscCheck, and ~67 others continue to fire normally (likely Claude-Code layer_b crons or jobs with future-only schedules).

**VERDICT:** CRITICAL — 23 out of 90 crons (26%) are failed/overdue. The scheduler appears to have stopped scheduling/executing jobs after 2026-08-07 08:50 UTC. Root cause unknown; requires immediate investigation.

#### B-01 through B-12 Data Freshness Sweep
**Source:** get_pipeline_health

- Pipeline status: **PASS** — all monitored data sources active, recent fetch timestamps
- Backfill queue: clear (false)
- Aggregator: last_run 2026-08-07 (offline hours, expected)
- Non-neutral signals: 2 (HUT oversold RSI14=6.5, VHM oversold RSI14=21.3)
- Row counts: most tickers 781-782 OHLCV rows, TA ready
- **Assessment:** No data staleness detected; pipeline operating normally despite cron failures

#### B-06/B-07 VPS Proxy Health
**Sources:** get_vps_proxy_health, get_vps_service_health

Proxy services:
- prices: last_push 2026-08-07 08:59:24 (offline hours), status ok
- news: last_push 2026-08-09 02:14:17 (recent, 6min old), status ok
- sbv: last_push 2026-08-09 02:08:37 (recent, 12min old), status ok
- bctc: last_push 2026-08-08 14:35:15 (offline hours), status ok

Service health: 3 healthy (bctc-fetch, news-fetch, sbv-fetch), 2 idle (foreign-flow, price-fetch)

**Assessment:** PASS — all observable VPS routes healthy

#### A-30 Memory — Re-check at Tier-2
**Re-probe at 2026-08-09T02:20:23Z (15 min after c11):**

- rag-service baseline: 91.04% (≥ 85% gate → ENGAGE deep-probe)
- Multi-probe 6 samples over 65s: min=91.05%, max=91.05%, median=91.05% (stable, flat)
- State: OOMKilled=false, restarts=0, state_changed=false
- VmHWM: pinned at cap, not advancing
- Discontinuities: 0
- Reclamation dips: 0
- **A-30 Verdict:** FOLD (benign)

**Trajectory analysis (c11 → c12):**
- c11 (02:05Z): rag-service 96.32%, A-30 verdict ESCALATE/WARN (loss of reclamation)
- c12 (02:20Z): rag-service 91.04%, A-30 verdict FOLD (benign) — **5.28pp drop in 15 min**
- Pattern: sustained high-plateau oscillating 91-96% with no crash-cliff markers
- Container health: robust (no OOMKilled, no crashes, no state changes)

**Assessment:** Memory recurrence confirmed but benign. Not a crash-cliff regression.

#### Signals Emitted This Cycle
- [A-29] morningBriefing cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:morningBriefing:A-29:2026-08-09T00:00Z
- [A-29] alertDigest cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:alertDigest:A-29:2026-08-09T00:00Z
- [A-29] foreignFlowAlert cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:foreignFlowAlert:A-29:2026-08-09T00:00Z
- [A-29] franceSummary cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:franceSummary:A-29:2026-08-09T00:00Z
- [A-29] signalOutcomeJob cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:signalOutcomeJob:A-29:2026-08-09T00:00Z
- [A-29] ohlcvStalenessCheck cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:ohlcvStalenessCheck:A-29:2026-08-09T00:00Z
- [A-29] marketEarningYield cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:marketEarningYield:A-29:2026-08-09T00:00Z
- [A-29] alertOutcomeJob cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:alertOutcomeJob:A-29:2026-08-09T00:00Z
- [A-29] vnstockTradingStatsRefresh cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:vnstockTradingStatsRefresh:A-29:2026-08-09T00:00Z
- [A-29] breadthHistoryPersister cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:breadthHistoryPersister:A-29:2026-08-09T00:00Z
- [A-29] ohlcvSanityCheckEarly cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:ohlcvSanityCheckEarly:A-29:2026-08-09T00:00Z
- [A-29] vpsProxyWatchdog cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:vpsProxyWatchdog:A-29:2026-08-09T00:00Z
- [A-29] taAlertScan cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:taAlertScan:A-29:2026-08-09T00:00Z (DEAD since 2026-04-24)
- [A-29] bbAlertScan cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:bbAlertScan:A-29:2026-08-09T00:00Z (DEAD since 2026-04-24)
- [A-29] taAlertNotifier cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:taAlertNotifier:A-29:2026-08-09T00:00Z
- [A-29] priceUpdateWatchdog cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:priceUpdateWatchdog:A-29:2026-08-09T00:00Z
- [A-29] vnIndexRefresh cron_fire_gap: CRITICAL, dedup_key=cron_fire_gap:vnIndexRefresh:A-29:2026-08-09T00:00Z
- [A-29] brokerSanctionsSweep cron_fire_gap: WARN, dedup_key=cron_fire_gap:brokerSanctionsSweep:A-29:2026-08-09T00:00Z (5.8x over SLA)
- [A-29] ragFtsRebuildCron cron_fire_gap: WARN, dedup_key=cron_fire_gap:ragFtsRebuildCron:A-29:2026-08-09T00:00Z (12.8x over SLA)
- [A-29] eveningSummary cron_fire_gap: WARN, dedup_key=cron_fire_gap:eveningSummary:A-29:2026-08-09T00:00Z (35.0h, 1h from MISSED)

[OUTPUT-CONTRACT] signals_posted=17 | telegram_sent=17 | signal_queue_rows_written=17 | dashboard_rows=17 | VERDICT=CRITICAL (cron scheduler failure: 23/90 jobs overdue, system-wide degradation)

---
