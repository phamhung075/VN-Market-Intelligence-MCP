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
