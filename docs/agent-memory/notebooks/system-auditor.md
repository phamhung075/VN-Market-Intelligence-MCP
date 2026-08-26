## c15

**Tier:** DATA  
**Tick:** 2026-08-26T09:05:41Z

### Anomalies: 8 found (5 REAL + 3 BY-DESIGN)

**Overview:** Full 17-table DATA sweep completed. Two HIGH-severity queue anomalies (pending items stuck 8 days, stats recording offline). Three additional REAL findings at WARN/MED (job crashes, OHLCV/report quality). Three by-design 0-row tables (unused on-demand features / separate DB writers).

### Findings Detail

#### REAL Anomalies

1. **deep_fetch_queue** — STALE/HIGH (signal: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD)
   - 30 pending items queued 2026-08-18 (8 days old), not advancing
   - Root cause: processor stopped or persistent VPS connectivity error

2. **deep_fetch_stats** — FAIL/HIGH (signal: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD)
   - 0 rows despite 2598-row queue (class=a, production writer exists)
   - Root cause: stat recording logic disabled or unreachable

3. **cron_job_runs** — FAIL/WARN (signal: already-open:FIX-CRON-RUNS-NULL-ERRORMSG)
   - 211 crashed, 7 error total; intelligenceCycleJob 43 crashes (most recent 2026-08-25 04:30Z)
   - Root cause: recent regression or structural job issue

4. **daily_ohlcv** — INCORRECT/WARN (signal: already-open:LINT-OHLCV-WRITE-BYPASS)
   - 336 violations (zero OHLC values), spanning 20 distinct dates
   - Newest violating row: 2026-06-12 (75 days old, stable residue)
   - Root cause: illiquid/delisted tickers or extraction failures, not recent regression

5. **financial_reports** — INCORRECT/MED (signal: already-open:FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE)
   - 52 low-confidence reports (<0.2), 263 total
   - Root cause: OCR/PDF parsing quality issue (Vietnamese PDF layout complexity)

#### By-Design Findings (no signal write)

- **price_alerts**: 0 rows, class=c (on-demand tool only) — INFO
- **alert_engine_records**: 0 rows, class=b (separate DB writer) — INFO
- **macro_indicators**: 1 row, fetched 2026-08-24 (2 days old, within 48h threshold) — INFO

### Canonical Counts

```json
{
  "scan_ts": "2026-08-26T09:04:03Z",
  "counts": {
    "ohlc_violations_count": 336,
    "scale_gt100x_count": 0,
    "vnindex_cache_rows_count": 1,
    "low_confidence_reports_count": 52
  },
  "context": {
    "ohlc_violation_distinct_dates": 20
  }
}
```

### Status

All 5 REAL findings already-open (dedup-matched). No new signals written. History entry: `docs/data/db-integrity-history.json` scan_ts=2026-08-26T09:05:41Z.

## c15 · 2026-08-26T09:00Z
### Audit Run Tier-DATA (HH:MM–HH:MM UTC YYYY-MM-DD)
- Tier: DATA | Tables: 17 checked | DB integrity scan
- Anomalies: 3 new (C critical: deep_fetch_stats, deep_fetch_queue, cron_job_runs; W warn: none; I info: 3 by-design) | 0 dedup-skipped
- Status: DEGRADED (3 critical open issues in deep-fetch pipeline and cron health)

### Findings Summary
**CRITICAL (3 REAL):**
- `deep_fetch_stats`: 0 rows, class=a (production writer exists) — stats collection broken while queue accumulates (64 stuck rows: 30 pending 191h+, 34 vps-failed 508h+)
- `deep_fetch_queue`: 64 non-terminal rows (30 pending 191h+, 34 vps-failed 508h+) — URLs stuck 8-21+ days suggests VPS infrastructure failure or off-season pause
- `cron_job_runs`: 13 failed/crashed runs past 7 days — recurring job failures (latest 2026-08-26 00:33:41)

**INFO (3 BY-DESIGN):**
- `price_alerts`: empty by design (on-demand tool, no production callers yet)
- `alert_engine_records`: empty by design (writes to separate alert_engine.db, not market.db)
- `macro_indicators`: 1 row, 2d old — acceptable cadence (weekly-to-monthly fetch)

### Raw Probe Output
```
db-integrity-counts.sh output:
- ohlc_violations: 336 (20 distinct dates)
- scale_anomalies: 0
- vnindex_cache_rows: 1
- low_confidence_reports: 52
```

## c13 · 2026-08-26T06:58:59Z

### Audit Run Tier-DATA (DB Data-Anomaly Sweep, Scan 06:58:59 UTC)

**Cycle:** AUDIT_TIER=DATA, db-integrity-probe.sh pre-gate verdict=SPAWN (tables_changed=4)  
**Duration:** Full-table check completed  
**Anomalies Found:** 1 REAL (deep_fetch_stats production-writer gap), 16 BY-DESIGN (all others clean or as-expected)

### RAW PROBE DATA

Database counts (deterministic, from scripts/db-integrity-counts.sh):

```json
{
  "scan_ts": "2026-08-26T06:57:41Z",
  "source": "scripts/db-integrity-counts.sh (deterministic — verbatim sqlite output)",
  "read_mode": "immutable",
  "counts": {
    "ohlc_violations_count": 336,
    "scale_gt100x_count": 0,
    "vnindex_cache_rows_count": 1,
    "low_confidence_reports_count": 52
  },
  "context": {
    "daily_ohlcv_total": 790023,
    "daily_ohlcv_newest_date": "2026-08-26",
    "market_prices_freshness": "2026-08-26T06:57:29.072Z",
    "fresh_ohlc_violations_last_2d": 0,
    "ohlc_violation_distinct_dates": 20
  }
}
```

Empty-table classification (deterministic, from scripts/db-empty-table-classify.sh):

```json
[
  {
    "table": "alert_engine_records",
    "class": "b",
    "severity_ceiling": "info_at_most_never_critical",
    "writer_sites": "alert-engine (excluded-other-db)"
  },
  {
    "table": "deep_fetch_stats",
    "class": "a",
    "severity_ceiling": "may_stay_critical",
    "writer_sites": "mcp-server deepFetchQueueStore (production)"
  },
  {
    "table": "price_alerts",
    "class": "c",
    "severity_ceiling": "info_or_warn_corroborate_to_escalate",
    "writer_sites": "mcp-server priceAlertTools (on-demand-tool)"
  }
]
```

### Key Findings

1. **[HIGH] deep_fetch_stats empty** (class a: production writer, may_stay_critical)
   - 0 rows in stats table; deep_fetch_queue has 2589 rows (normal queue backlog)
   - Writer: mcp-server deepFetchQueueStore.ts line 173 (production pipeline)
   - Verdict: REAL anomaly — production writer defined but not populating stats table
   - Impact: Stats instrumentation gap; queue activity invisible to observability

2. **daily_ohlcv: 336 violations, no fresh anomalies** (class: STALE)
   - All 336 violations in historical data (20 distinct dates, all before 2026-08-24)
   - Fresh window (last 2 days): 0 violations
   - Total rows: 790023, newest date: 2026-08-26 (current)
   - Verdict: BY-DESIGN — known stale residue, no growth, no fresh violations

3. **price_alerts empty** (class c: on-demand tool)
   - 0 rows as expected — tool-triggered, not auto-populated
   - Verdict: BY-DESIGN — clean state for no user activity

4. **alert_engine_records empty** (class b: excluded-other-db)
   - 0 rows as expected — service writes to separate alert-engine DB
   - Table exists as schema mirror only in market.db
   - Verdict: BY-DESIGN — external writer, not populated here

5. **All other 13 tables: clean**
   - market_prices: 116 rows, fresh (2026-08-26T06:57:29.072Z), no scale violations
   - cron_job_runs: 218335 rows (history populated normally)
   - deep_fetch_queue: 2589 rows (queue active, see finding 1)
   - financial_reports: 263 rows, 52 low-confidence (20%, within range)
   - All others: populated normally with expected row counts
   - Verdict: BY-DESIGN

### Dedup & Signal Status

- 1 REAL finding (deep_fetch_stats): already-open per 7-day dedup check, no new signal emitted this cycle
- Contract violation: NONE

### Durability Sweep

```
[durability-sweep] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=0
```

No stale markers or schedule gaps detected.
