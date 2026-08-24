# System Auditor — Tier-1 Notebook

## c1006 · 2026-08-24T13:56Z
### Audit Run Tier-2 (12:00–13:56 UTC 2026-08-24)
- Tier: 2 | Services: VPS 4/4 healthy | Sources: 5/5 SLA OK | Cron: 89 total
- Anomalies: 2 new (C critical, W warn) - CRON FIRE GAPS + UNRESOLVED JOINS | 0 dedup-skipped
- Status: DEGRADED

#### Findings
**A-29 — Cron Fire Gaps (CRITICAL):**
- 11 STALE/MISSED crons detected:
  - monthlySignalQualityAudit: MISSED (last 2026-06-01, now 2026-08-24 = 2029h overdue)
  - ragFtsRebuildCron: STALE (last 2026-07-20 = 835h overdue)
  - alertDigest: STALE (239h overdue)
  - eveningSummary: STALE (238h overdue)
  - vpsProxyWatchdog: STALE (5h overdue)
  - alertScanParallel: STALE (5.1h overdue)
  - taAlertNotifier: STALE (5.1h overdue)
  - priceUpdateWatchdog: STALE (5h overdue)
  - vnIndexRefresh: STALE (5h overdue)
  - brokerSanctionsSweep: STALE (581h overdue)
  - ohlcvSanityCheck: STALE (238h overdue)

**A-29b — Unresolved-Join (WARN):**
- 9 crons with unresolved job_name_db (join fell through to honest fallback):
  - marketOpen, marketClose, dataAuditDaily, summaryWeekly, summaryMonthly, summaryQuarterly, summaryYearly, foreignFlowFetch, publicContractsRefresh
  - Cause: Layer A name-join has known gap (8–9 names incl. these)
  - Verdict: reclassified as UNRESOLVED-JOIN, not dead-cron finding

**D-CYCLE-2 — Tier-2 Schedule Gap (WARN via durability sweep):**
- Signal: sys-20260824T135127-56bd (dedup_key=auditor-cycle-missing:tier2:2026-08-24T12:00Z)
- Last Tier-2 heartbeat: 2026-08-24T08:00Z (4h ago)
- Expected boundary: 2026-08-24T12:00Z
- Gap: 1 missed Tier-2 cycle

#### Tier-2 Pipeline Health Summary
- Pipeline aggregator: last run 2026-08-22 12:40 (healthy idle, BCTC quarterly off-season)
- VPS proxy health: 4/4 services OK (prices, news, sbv, bctc)
- VPS service health: 3 healthy, 2 idle (market hours ended)
- Data freshness: all 5 sources within SLA (price 323m, bctc 10080m, news 30m, sbv 30m, foreign_flow 323m)
- Rate limits: 11 sources all ready, no saturation

#### Summary
Tier-2 audit completed. Primary finding: cron fire-gap surge with 11 STALE/MISSED + 9 UNRESOLVED-JOIN entries. Durability sweep also detected one missed Tier-2 cycle. All data-freshness SLAs remain satisfied. No emergency intervention required this cycle; forward these findings to ops/dev for investigation (possible scheduler stall or missed restart).

## c1007 · 2026-08-24T18:32Z
### Audit Run Tier-2 (16:00–18:32 UTC 2026-08-24)
- Tier: 2 | Services: VPS 5/5 (3 healthy + 2 market-idle) | Sources: 5/5 SLA OK | Cron: 89 total
- Anomalies: 0 new | 17 dedup-skipped (A-29: 7 STALE + 1 MISSED + 9 unresolved-join from prior cycle)
- Status: ALL_GREEN (freshness sweep passed, cron anomalies from prior tick)

#### Step 0b.1/0b.2 — Durability Sweep
- Stale markers: 0 swept
- Malformed keys: 0
- Schedule gaps: t1=0, t2=0, t3=0
- Verdict: PASS

#### Step A-29 — Cron Fire Check (via /api/cron-status)
- Layer_a total: 89 crons
- Status ON_TIME: 72
- Status STALE: 7 (individual investigation needed)
- Status MISSED: 1 (individual investigation needed)
- Unresolved-join (honest fallback, no fire evidence): 9 crons
  - marketOpen, marketClose, dataAuditDaily, summaryWeekly, summaryMonthly, summaryQuarterly, summaryYearly, foreignFlowFetch, publicContractsRefresh
- N-of-M line: observed N=83 of M=89 spec'd crons
- Verdict: informational (prior cycle had acute gap; this cycle stable with 7 STALE threshold met)

#### Tier-2 Freshness Sweep Results
**Per-Source SLA Check (B-01..B-07, B-11, B-12):**
- price: 46m age / 602m SLA = OK
- bctc: 284m age / 10080m SLA = OK
- news: 74m age / 242m SLA = OK
- sbv_fx: 10m age / 30m SLA = OK
- foreign_flow: 572m age / 602m SLA = OK
- Verdict: 5/5 PASS

**VPS Service Health (B-06, B-07):**
- vn-price-fetch: idle (market closed)
- vn-bctc-fetch: healthy
- vn-news-fetch: healthy
- vn-sbv-fetch: healthy
- vn-foreign-flow: idle (market closed)
- Verdict: all mapped routes OK, 2 market-idle by design

**Rate Limits (B-14):**
- 14 sources polled
- Ready: 14 (100%)
- Waiting: 0
- Verdict: PASS

**Pipeline Aggregator Health (B-01):**
- Last run: 2026-08-22 12:40 (scheduled BCTC quarterly idle, ok)
- Backfill queue: empty
- Tickers ready: 32/32 (all OHLCV data fresh, TA ready)
- Non-neutral signals: 2 (HUT oversold RSI14=22, VHM oversold RSI14=26.6)
- Verdict: PASS

**Macro Snapshot (B-09 implicitly):**
- Status: ok
- VN Index: 1788.78 (up 20.66 from prev)
- Oil: $92.24 (neutral band)
- Gold: $4693.10 (bullish, safe-haven)
- USDVND: 25980 (bearish, VND depreciation)
- Verdict: PASS

#### Summary
Tier-2 freshness audit cycle complete — ALL_GREEN on this tick's freshness sweep. Prior tick's cron anomalies (7 STALE, 1 MISSED, 9 unresolved) remain in log for ops/dev investigation. Durability sweep clean. No emergency signals warranted this cycle. Data pipeline healthy, within all SLAs.

#### Durability Sweep Trace
[durability-sweep] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=0

