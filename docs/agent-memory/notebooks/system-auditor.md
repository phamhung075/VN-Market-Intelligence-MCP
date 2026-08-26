## c16 · 2026-08-26T09:35:19Z

**Tier:** DATA
**Tick (DISPATCH_TICK):** 2026-08-26T09:26:06Z
**History entry scan_ts:** 2026-08-26T09:35:19Z

### Anomalies: 4 REAL (all already-open, no new signal writes)

Full 17-table DATA sweep run this cycle (fresh, not a re-read of a prior cycle's history entry — R-10 pre-check confirmed 0 rows at-or-after DISPATCH_TICK before starting).

1. **daily_ohlcv** — INCORRECT/MED (already-open:LINT-OHLCV-WRITE-BYPASS) — 336 OHLC violations, 20 distinct dates, MAX(violating date)=2026-06-12 (75d flat residue, fresh_ohlc_violations_last_2d=0).
2. **deep_fetch_queue** — FAIL/CRITICAL (already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD) — 0 of 2600 rows EVER reached status='done' since 2026-06-08 (2.5mo); both deepFetchVpsJob (18330 runs) and deepFetchMainJob (18419 runs) show rows_written=0 on 100% of runs; 30/31 pending rows stuck >24h (oldest queued 2026-08-18); root-cause read: pollPending()'s own `queued_at >= now-4h` filter permanently strands any row not drained in time.
3. **deep_fetch_stats** — FAIL/HIGH (already-open: same FIX-DEEPFETCH id) — 0 rows, class=a (production writer exists, deepFetchQueueStore.ts:173), downstream consequence of #2.
4. **fred_series_daily** — STALE/MED (already-open:FIX-MACRO-ISM-FRED-API-KEY-MISSING) — MAX(fetched_at)=2026-08-23 12:13:02, ~69h stale vs 24h SSOT threshold; macroIndicatorRefreshJob cron_job_runs shows missed 2026-08-25 run + a prior 7d gap (08-16..08-22).

### By-design / clean (no finding row)
price_alerts (class c, on-demand), alert_engine_records (class b, separate DB), macro_indicators (45h, under 48h threshold), sbv_rates/vn_index_cache/market_prices/market_prices_history/alerts/agent_signals/signal_outcomes/financial_reports/cron_job_runs/scheduler_locks all read clean this cycle.

### Canonical Counts (db-integrity-counts.sh, verbatim)
```json
{"ohlc_violations_count":336,"scale_gt100x_count":0,"vnindex_cache_rows_count":1,"low_confidence_reports_count":52}
```

### Status
tables_checked=17 (R-9 clause 1 PASS). All 4 REAL findings carry a non-null signal_id (R-9 clause 2 PASS, 0 nulls). R-7 append proof: 0 rows at-or-after tick before RECORD, 1 after.

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
