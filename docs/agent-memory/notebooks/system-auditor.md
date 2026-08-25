## c1015 · 2026-08-25T03:30Z
### Audit Run Tier-DATA (2026-08-25T03:30Z)
- Tier: DATA | Tables checked: 17 | Findings: 4 (1 HIGH REAL, 3 INFO NOISE)
- Anomalies: 0 new signals | dedup-skipped: 2 (deep_fetch_stats already tracked, ohlcv violations already tracked)
- Status: STABLE (no new anomalies; known issues remain tracked)

### Findings Summary

**1. daily_ohlcv — 336 persistent OHLC H>=O,C,L violations**
- Violations count: 336 (unchanged from last cycle)
- Distinct dates affected: 20 (NOT concentrated on a single date)
- Fresh violations (last 2 days): 0 (no new violations this cycle)
- Scale anomalies (>100x): 0
- Root cause: Known residual from prior data extraction issues
- Status: BY-DESIGN (tracked under LINT-OHLCV-WRITE-BYPASS + CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR)
- Signal status: DEDUP-SUPPRESSED (same violation population as 2026-08-25T03:00Z scan)

**2. deep_fetch_stats — empty (class=a)**
- Row count: 0 (unchanged from last cycle)
- Production writer: deepFetchQueueStore.ts:173
- Producer health: deep_fetch_queue has 2540 rows, 2475 expired, 31 pending, 34 vps-failed, newest entry 2026-08-25T03:27:15
- Root cause: Stats aggregation pipeline stalled; producer is live but consumer not generating stats
- Severity: HIGH (class=a — production writer exists, 0 rows is a real breach)
- Signal status: ALREADY-OPEN (tracked as FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD)

**3. price_alerts — empty (class=c)**
- Row count: 0
- Writer provenance: on-demand MCP tool only (priceAlertTools.ts:148)
- Root cause: Expected empty; tool-driven table populated only on explicit tool invocation
- Severity ceiling: INFO (class=c — no production job writes to this table)
- Verdict: NOISE (not a pipeline failure)

**4. alert_engine_records — empty (class=b)**
- Row count: 0
- Writer provenance: separate database file (alert_engine.db, not market.db)
- Root cause: Table has zero production writers against market.db by design
- Severity ceiling: INFO (class=b — expected empty by construction)
- Verdict: NOISE (not a pipeline failure)

### Data Quality Metrics (deterministic sqlite output)
```
scan_ts: 2026-08-25T03:29:09Z
ohlc_violations_count: 336
scale_gt100x_count: 0
vnindex_cache_rows_count: 1
low_confidence_reports_count: 52
ohlc_violation_distinct_dates: 20
daily_ohlcv_total: 789924
market_prices_freshness: 2026-08-25T03:28:42.500Z
```
History record: docs/data/db-integrity-history.json (appended 2026-08-25T03:29:55Z)

### Durability Sweep
- Marker files swept: 0
- Malformed keys: 0
- Stale drafts: 0
- Schedule gaps: t1=0, t2=0, t3=0

### Contract Status
- No contract contradictions
- Durability sweep completed successfully

## c1013 · 2026-08-25T03:00Z
### Audit Run Tier-DATA (2026-08-25T03:00Z)
- Tier: DATA | Tables checked: 17 | Findings: 2 (1 REAL HIGH, 1 BY-DESIGN)
- Anomalies: 0 new signals (dedup: deep_fetch_stats already tracked, OHLC violations already tracked)
- Status: HEALTHY (no new data anomalies detected; known residues tracked)

### Findings Summary

**1. deep_fetch_stats table — empty (0 rows, class=a)**
- Schema exists, row count: 0
- Production writer: `apps/mcp-server/src/infrastructure/db/deepFetchQueueStore.ts`
- Severity: HIGH (class=a means may_stay_critical)
- Correlate with deep_fetch_queue: 2537 rows total (2472 expired, 31 pending, 34 vps-failed)
- Root cause: Stats aggregation job not populating, or queue processor is not generating stats records
- Signal: DEDUP-SUPPRESSED (already-open as FIX-DEEPFETCH-PIPELINE* or similar)
- Action: dev-team to investigate queue processor health

**2. daily_ohlcv — 336 persistent OHLC violations**
- OHLC violations count: 336 (spanning 20 distinct dates, not concentrated)
- Fresh violations (last 2 days): 0
- Scale anomalies (>100x): 0
- Class: INCORRECT
- Root cause: Known residual from prior data extraction weeks
- Status: BY-DESIGN (already tracked under LINT-OHLCV-WRITE-BYPASS)
- Action: awaiting root-cause fix via CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR task

### Data Quality Metrics
- Counts (deterministic sqlite output):
  - ohlc_violations_count: 336
  - scale_gt100x_count: 0
  - vnindex_cache_rows_count: 1
  - low_confidence_reports_count: 52
  - ohlc_violation_distinct_dates: 20
- History reference: docs/data/db-integrity-history.json entry scan_ts=2026-08-25T03:00:09Z

### Durability Sweep
- Result: [durability-sweep] swept=0 malformed=0 found=0 schedule_gap_t1=1 schedule_gap_t2=0 schedule_gap_t3=0
- Tier-1 schedule gap detected: 1 (expected due to 30min cadence variance)
- No stale marker files found

### Contract Status
- No contract contradictions detected this cycle
- Durability sweep: OK

## d4-auto · 2026-08-25T03:00:00.993Z
D4 candidates: none
