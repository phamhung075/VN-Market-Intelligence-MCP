## c17 · 2026-08-26T10:23Z
### Audit Run Tier-DATA (10:15-10:23 UTC 2026-08-26)
- Tier: DATA | Tables: 17 checked (all 17 explicit findings, no omissions) | DB integrity scan
- Anomalies: 0 new (6 REAL, all dedup-matched already-open; 3 BY-DESIGN info; 8 CLEAN) | 6 dedup-skipped
- Status: DEGRADED (6 already-open REAL issues re-confirmed live, none newly regressed toward 0; R-13 full-coverage re-run per router instruction)

### Findings Summary
**REAL (6, all already-open — dedup-matched, no new signal rows written):**
- `daily_ohlcv`: 336 OHLC violations (20 distinct dates), flat count. MAX(date) among violating rows=2026-06-12 (75-day-old residue, not fresh). already-open:LINT-OHLCV-WRITE-BYPASS
- `signal_outcomes`: 1 orphaned row (id=66, signal_id=6218, VCB, 2026-06-15) referencing a deleted agent_signals row. already-open:ALPHA-S5-TRUTH-LEDGER-BACKTEST
- `financial_reports`: 52 low-confidence rows (extraction_confidence<0.2), flat count. R-13 correction: prior 09:35Z cycle had reclassified this identical count as BY-DESIGN and dropped it from findings — reasserted REAL/MED this cycle per re-run, no genuine state change observed. already-open:FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE
- `deep_fetch_queue`: 2607 lifetime rows, 0 'done' ever (100% expired/vps-failed/pending), 30/32 pending stuck >24h (oldest 8 days). already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD
- `deep_fetch_stats`: 0 rows, class=a writer exists but its precondition (a done-fetch) never fires — corroborated by deep_fetch_queue's 0 done rows. already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD
- `cron_job_runs`: FULL breakdown crashed=211/error=7/success=218652; 24h window=success=1617 only (newest crashed row 2026-08-25 04:30:02, ~29h47m old, slid outside the 24h window). NULL error_msg on 218/218 crashed+error rows. already-open:FIX-CRON-RUNS-NULL-ERRORMSG

**BY-DESIGN (3):**
- `price_alerts`: 0 rows, class=c (on-demand MCP tool only, no production caller)
- `alert_engine_records`: 0 rows, class=b (sole writer targets a separate alert_engine.db, not market.db)
- `agent_signals`: 139 rows, 104 >7d old — expected per reference_agent_signals_is_a_rolling_2h_ttl_window (TTL filters queries, does not delete rows)

**CLEAN (8):** market_prices, market_prices_history, vn_index_cache, alerts, macro_indicators (46.1h, under 48h threshold), sbv_rates, fred_series_daily (46.1h), scheduler_locks

### Raw Probe Output
```
db-integrity-counts.sh (scan_ts=2026-08-26T10:17:37Z):
{"counts":{"ohlc_violations_count":336,"scale_gt100x_count":0,"vnindex_cache_rows_count":1,"low_confidence_reports_count":52},
 "context":{"daily_ohlcv_total":790025,"daily_ohlcv_newest_date":"2026-08-26","fresh_ohlc_violations_last_2d":0,"ohlc_violation_distinct_dates":20}}
```

### Status
All 17 watched tables carry an explicit findings[] entry (R-13 full-coverage requirement). History entry: `docs/data/db-integrity-history.json` scan_ts=2026-08-26T10:23:03Z. history_len_before=200, history_len_after=200 (at 200-row cap, append proven by scan_ts filter not length delta, per R-7). Durability sweep this cycle: swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=1 (SKIP-dedup, already alerted last cycle) schedule_gap_t3=0.

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
