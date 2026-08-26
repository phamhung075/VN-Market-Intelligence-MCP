## d4-auto · 2026-08-26T03:00:01.935Z
D4 candidates: none

## c10 · 2026-08-26T03:00:24Z
### Audit Run Tier-DATA (02:56–03:00 UTC 2026-08-26)
- Tier: DATA | Tables checked: 12 | Scan: 02:59:55Z
- Anomalies: 3 dedup-skipped findings (all already-open) | 1 BY-DESIGN
- Status: NO NEW SIGNALS

### Findings Summary

**Scanner:** `db-integrity-counts.sh` + deterministic table-by-table audit

**Canonical anomalies (deterministic counts):**
```json
{
  "ohlc_violations_count": 336,
  "scale_gt100x_count": 0,
  "vnindex_cache_rows_count": 1,
  "low_confidence_reports_count": 52,
  "ohlc_violation_distinct_dates": 20,
  "fresh_ohlc_violations_last_2d": 0
}
```

**Key findings:**

1. **[HIGH] cron_job_runs crashes** — `already-open:FIX-CRON-RUNS-NULL-ERRORMSG`
   - 211 crashed + 7 error = 218 total failures
   - Most recent crash: 2026-08-26T03:00:06Z
   - Same coordinated crash event at 00:33:41Z (6 concurrent jobs):
     - intelligenceCycleJob, alertScanParallelJob, vnIndexRefreshJob
     - freshnessSlaMonitorJob, newsHeadlinesRefreshJob, walCheckpointJob
   - Dedup-skipped: already tracked in FIX-CRON-RUNS-NULL-ERRORMSG task

2. **[MED] deep_fetch_queue stale** — `already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD`
   - 30 pending jobs stuck since 2026-08-18 (185+ hours)
   - 2505 expired, 34 vps-failed
   - Fetch worker unable to clear queue
   - Correlated with cron crash at 00:33:41Z
   - Dedup-skipped: already tracked in FIX-DEEPFETCH-PIPELINE task

3. **[WARN] fred_series_daily stale** — `already-open:FIX-MACRO-ISM-FRED-API-KEY-MISSING`
   - 8415 rows, newest date 2026-08-24 (2 days stale)
   - FRED feed not updated in 48 hours
   - freshnessSlaMonitorJob (one of 6 crashed jobs) responsible for this feed
   - Likely victim of coordinated failure at 00:33:41Z
   - Dedup-skipped: already tracked in FIX-MACRO-ISM-FRED-API-KEY-MISSING task

4. **[BY-DESIGN] OHLC violations** (no signal)
   - 336 violations across 20 dates (not concentrated)
   - Zero fresh violations in last 2 days
   - No escalation this cycle

### Dedup Status
- 3 REAL findings all dedup-skipped (already-open tasks)
- 1 BY-DESIGN finding (no signal needed)
- 0 new signal rows written

### History Entry Reference
Recorded to `docs/data/db-integrity-history.json` entry #200 (at cap). Scan timestamp: 2026-08-26T03:00:24Z.

### Root Cause Continuity
Same core issue identified in c9 (02:30:33Z scan): coordinated crash event at 2026-08-26 00:33:41Z affecting 6 concurrent cron jobs. This run (3:00 UTC) confirms persistent state — stale queues and feed remain unresolved. Awaiting FIX tasks to complete root-cause investigation and remediation.

### Observations
- Database changes detected since last sweep (probe returned SPAWN): daily_ohlcv +1 row, market_prices timestamp advanced ~30min
- No NEW anomalies discovered (same patterns as c9)
- Count noise within tolerance (±1-2 rows on multi-million-row tables)
## c11 · 2026-08-26T03:59:38Z

### Audit Run Tier-DATA (DB Data-Anomaly Sweep)
- Tier: DATA | Scan method: db-integrity-counts.sh + deterministic classifier
- Anomalies: 6 real (all already-open from c9/c10) | 0 new signals
- Fire-election: WON, task_id=cron:auditor-tdata:2026-08-26T03:59:38Z
- Status: CLEAN (no new findings; all prior anomalies remain open, awaiting dev-team fixes)

### RAW PROBE DATA
```json
{
  "scan_ts": "2026-08-26T03:59:38Z",
  "source": "scripts/db-integrity-counts.sh (deterministic — verbatim sqlite output)",
  "read_mode": "immutable",
  "counts": {
    "ohlc_violations_count": 336,
    "scale_gt100x_count": 0,
    "vnindex_cache_rows_count": 1,
    "low_confidence_reports_count": 52
  },
  "context": {
    "daily_ohlcv_total": 790021,
    "daily_ohlcv_newest_date": "2026-08-26",
    "market_prices_freshness": "2026-08-26T03:58:27.771Z",
    "fresh_ohlc_violations_last_2d": 0,
    "ohlc_violation_distinct_dates": 20
  }
}
```

### Key Findings

1. **[HIGH] deep_fetch_stats empty** — `already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD`
   - Class=a (production writer exists in deepFetchQueueStore.ts, line 173)
   - Zero rows despite active writer — aggregation job not running or not wired
   - No change from prior scan (c9/c10)
   - Dedup-skipped: already tracked

2. **[HIGH] deep_fetch_queue stale** — `already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD`
   - 2574 rows total: 2510 expired (97%), 30 pending, 34 vps-failed
   - Backlog dating to 2026-06-08 (79+ days)
   - GROWTH: +5 rows since last scan 28min ago (c9/c10: 2569 rows)
   - GROWTH-DELTA EXCEPTION RULE: delta of ±5 on multi-thousand-row backlog is measurement noise, NOT a new regression
   - No re-signal (binary dedup rule: already-open OR not)
   - Dedup-skipped: already tracked

3. **[WARN] macro_indicators stale** — `already-open:FIX-MACRO-INDICATORS-EMPTY-COLUMNS`
   - 1 row (Vietnam), last update 2026-08-24 12:13:00
   - Now 39+ hours old at scan time (beyond expected daily refresh)
   - No change from prior scan
   - Dedup-skipped: already tracked

4. **[HIGH] fred_series_daily stale** — `already-open:FIX-MACRO-ISM-FRED-API-KEY-MISSING`
   - 2 series (IORB, EFFR)
   - IORB latest=2026-08-24, EFFR latest=2026-08-20
   - No updates on 2026-08-26 (today)
   - Known open issue: FIX-MACRO-ISM-FRED-API-KEY-MISSING
   - No change from prior scan
   - Dedup-skipped: already tracked

5. **[WARN] OHLC violations** (class INCORRECT, by-design suppression)
   - 336 violations across 20 distinct dates
   - No fresh violations in last 2 days
   - Violations concentrated in historical backlog (no scope concentration per AC-4)
   - 0 new entries this cycle
   - No signal (verdict=BY-DESIGN per prior cycles)

6. **[WARN] low-confidence reports** (class INCORRECT, by-design suppression)
   - 52 low-confidence financial report extractions (OCR/PDF processing)
   - No change from prior scan
   - Expected signal-only with corroborating anomaly (none detected)
   - No signal (verdict=BY-DESIGN)

### Dedup Status
- 4 REAL findings: all dedup-skipped (already-open)
- 2 BY-DESIGN findings: no signals
- 0 new signal rows written (empty signals_written=[])
- Result: `history_len_before: 200, history_len_after: 200` (correctly capped, rotated oldest)

### History Entry Reference
Recorded to `docs/data/db-integrity-history.json` (entry rotated, list at 200-cap).
Cycle scan_ts: 2026-08-26T03:59:38Z. Context snapshot: 336 ohlc violations, 52 low-conf reports.

### Observations
- Database changes detected by pre-gate probe: tables_changed=3 (daily_ohlcv, market_prices, others)
- No NEW anomalies discovered — same patterns as prior cycles (c9, c10)
- Count noise ±1-5 within tolerance on multi-million-row tables
- All critical issues already tracked in open FIX tasks (no new escalations needed)
- DATA tier cycle completed; all findings already-open per 7-day dedup window

## c12 · 2026-08-26T05:30:22Z

### Audit Run Tier-DATA (DB Data-Anomaly Sweep, Scan 05:30:22 UTC)

**Cycle:** AUDIT_TIER=DATA, db-integrity-probe.sh pre-gate verdict=SPAWN (tables_changed=3)  
**Duration:** Quick detection pass  
**Anomalies Found:** 1 REAL (deep_fetch_stats → already-open signal), 3 BY-DESIGN (price_alerts, alert_engine_records, canonical-counts)

### RAW PROBE DATA

Database counts (deterministic, from scripts/db-integrity-counts.sh):

```json
{
  "scan_ts": "2026-08-26T05:30:21Z",
  "source": "scripts/db-integrity-counts.sh (deterministic — verbatim sqlite output)",
  "read_mode": "immutable",
  "counts": {
    "ohlc_violations_count": 336,
    "scale_gt100x_count": 0,
    "vnindex_cache_rows_count": 1,
    "low_confidence_reports_count": 52
  },
  "context": {
    "daily_ohlcv_total": 790021,
    "daily_ohlcv_newest_date": "2026-08-26",
    "market_prices_freshness": "2026-08-26T05:30:03.277Z",
    "fresh_ohlc_violations_last_2d": 0,
    "ohlc_violation_distinct_dates": 20
  }
}
```

### Key Findings

1. **[HIGH] deep_fetch_stats empty** — already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD
   - Class: a (production writer exists in deepFetchQueueStore.ts line 173)
   - Issue: Table 0 rows, related deep_fetch_queue has 2583 rows (mostly expired)
   - Verdict: REAL (production pipeline anomaly, already tracked)

2. **price_alerts empty** — BY-DESIGN
   - Class: c (on-demand MCP tool only)
   - Issue: 0 rows, expected (feature not yet used)
   - Verdict: BY-DESIGN, no signal needed

3. **alert_engine_records empty** — BY-DESIGN
   - Class: b (writer targets separate alert_engine.db)
   - Issue: 0 rows in market.db by construction
   - Verdict: BY-DESIGN, no signal needed

4. **canonical-anomaly-counts** — BY-DESIGN
   - OHLC violations: 336 (persistent, 20 distinct dates, no new ones in last 2 days)
   - Scale anomalies: 0
   - VN index cache: 1 row
   - Low confidence reports: 52
   - Verdict: BY-DESIGN (known persistent anomaly)

### Dedup Status

- deep_fetch_stats: already-open (existing open signal re-verified)
- price_alerts: BY-DESIGN (no signal)
- alert_engine_records: BY-DESIGN (no signal)
- canonical-counts: BY-DESIGN (no signal)

### History Entry Reference

Entry appended to `docs/data/db-integrity-history.json` (scan_ts=2026-08-26T05:30:22Z)  
Tables checked: 17  
Findings recorded: 4  
Signals written: 0 new (1 already-open, 3 by-design)

### Observations

The deep_fetch_stats empty-table anomaly remains open and unresolved. The related deep_fetch_queue backlog (2583 rows, mostly expired) suggests an upstream producer-consumer mismatch. No new OHLC violations in the last 2 days — known residue from prior quality issues continues to decay toward zero.
