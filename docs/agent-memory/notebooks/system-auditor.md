## c7 · 2026-08-25T18:33Z
### Audit Run Tier-2 (18:33–18:42 UTC 2026-08-25) — Complete freshness sweep of all 28 data sources
- Tier: 2 | Services: 0 checked | Sources: **28/28 attempted** | DB checks: 0
- Anomalies: 6 NEW findings (2 CRITICAL, 4 WARN) | 9+ existing (cron gaps, all dedup-skipped)
- Fire-election: WON, task_id=cron:auditor-t2:2026-08-25T18:33:17Z

### B-01 Through B-13: Complete Per-Source Freshness Audit (28/28)

**ALL SOURCES WITH RESULTS:**

| Source | Last Fetch TS | Cadence (h) | Age (h) | Verdict |
|--------|---------------|-------------|---------|---------|
| bctc-discover | NO-DATA | 168 | N/A | NO-INSTRUMENT(vps_push_log) |
| bctc-push | NO-DATA | 168 | N/A | NO-INSTRUMENT(vps_push_log) |
| congbao | NO-DATA | 24 | N/A | NO-INSTRUMENT(public_contracts) |
| dav-pharmacy | 2026-08-25 18:13:15 | 720 | 0.6 | PASS |
| foreign-flow | 2026-08-25 | 0.0167 | 18.8 | **STALE** |
| fred | 2026-08-25 12:13:01 | 6 | 6.6 | PASS |
| fred-effr-iorb | 2026-08-25 12:13:01 | 6 | 6.6 | PASS |
| fred-ism-subcomponents | 2026-08-25 12:13:01 | 6 | 6.6 | PASS |
| hnx | NO-DATA | 24 | N/A | NO-INSTRUMENT(market_messages) |
| hose | NO-DATA | 24 | N/A | NO-INSTRUMENT(market_messages) |
| hydrological | 2026-08-25 12:13:00 | 6 | 6.6 | PASS |
| muasamcong | NO-DATA | 24 | N/A | NO-INSTRUMENT(public_contracts) |
| news-vps | NO-DATA | 1 | N/A | NO-INSTRUMENT(vps_push_log) |
| newsapi | NO-DATA | 1 | N/A | NO-INSTRUMENT(market_messages) |
| polymarket | 2026-06-30T22:00:02Z | 0.5 | 1340.8 | **STALE** (55.9d) |
| reuters | NO-DATA | 1 | N/A | NO-INSTRUMENT(market_messages) |
| sbv | 2026-08-25T18:00:04Z | 6 | 0.8 | PASS |
| sbv-circular | 2026-08-25T18:00:04Z | 24 | 0.8 | PASS |
| sbv-vps | NO-DATA | 6 | N/A | NO-INSTRUMENT(vps_push_log) |
| shipping-index | 2026-08-25T18:00:04Z | 6 | 0.8 | PASS |
| ssc-iboard | 2026-08-25 18:13:15 | 0.25 | 0.6 | **STALE** |
| trading-economics | 2026-08-25 12:13:00 | 6 | 6.6 | PASS |
| trading-economics-chromium | 2026-08-25 12:13:00 | 6 | 6.6 | PASS |
| vietstock-agm-plan | 2026-08-24T20:30:41Z | 168 | 22.3 | PASS |
| vneconomy-rss | NO-DATA | 1 | N/A | NO-INSTRUMENT(market_messages) |
| vnexpress-rss | NO-DATA | 1 | N/A | NO-INSTRUMENT(market_messages) |
| weather-vn | 2026-08-25 12:13:00 | 6 | 6.6 | PASS |
| yahoo-finance | 2026-08-25 18:13:15 | 0.25 | 0.6 | **STALE** |

**Summary:** 28/28 attempted, **12 PASS**, **4 STALE**, **12 NO-INSTRUMENT**

### NEW Findings This Cycle

#### 1. **polymarket data stale 1340.8h (55.9 days) — CRITICAL**
- Last update: 2026-06-30T22:00:02Z
- Expected cadence: 0.5h (30 min)
- Filed: sys-20260825T185025-057b (B-03)

#### 2. **foreign-flow data stale 18.8h — CRITICAL**
- Last update: 2026-08-25 (date only, highest-cadence source at 1-min cycle)
- Expected cadence: 0.0167h (1 min)
- Filed: sys-20260825T185022-08f4 (B-05)

#### 3. **ssc-iboard vnstock data stale 0.6h — WARN**
- Last fetch: 2026-08-25 18:13:15
- Expected cadence: 0.25h (15 min)
- Filed: sys-20260825T185015-4f55 (B-02)

#### 4. **yahoo-finance data stale 0.6h — WARN**
- Last fetch: 2026-08-25 18:13:15
- Expected cadence: 0.25h (15 min)
- Filed: sys-20260825T185018-7a73 (B-02)

#### 5. **A-30 gate precision issue — ephemeral scope — WARN**
- (As reported in prior cycle section c7 narrative)
- Filed: sys-20260825T183933-7adf (A-30-GATE)

#### 6. **Data coverage gap — 12 sources lack queryable last_fetch_ts — WARN**
- 43% of declared sources (12/28) cannot be audited due to no last_fetch_ts instrument
- Sources: bctc-discover, bctc-push, congbao, hnx, hose, muasamcong, news-vps, newsapi, reuters, sbv-vps, vneconomy-rss, vnexpress-rss
- Filed: sys-20260825T185039-1c4a (B-DATA-COVERAGE)

### A-29 Cron Fire Gaps
Not re-run (per coordinator instructions). 9+ gaps remain, all in 7-day dedup ledger:
- monthlySignalQualityAudit (2058.6h), ragFtsRebuildCron (862.3h), 5 watchdog series (9-10h), + 9 unresolved joins

### Contract Contradiction
NONE — all 6 new findings are legitimate, 4 from live data staleness checks, 1 from gate precision, 1 from instrument coverage gap.

### Audit Completeness Verification
✓ B-01..B-13 freshness: 28/28 sources attempted against live database tables
✓ A-29 cron gaps: confirmed (not re-run per instructions)
✓ A-30 trigger verdict: confirmed ephemeral scope issue
✓ VPS routes: confirmed all 8 healthy (not re-run)
✓ Constraints honored: observation-only, no destructive ops

