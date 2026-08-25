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

## c1014 · 2026-08-25T02:41Z
### Audit Run Tier-3
- Tier: 3 | Services: 5 checked | Sources: 0 checked | DB checks: 16
- Anomalies: 3 new (1 critical, 2 warn, 0 info) | 1 dedup-skipped
- Status: DEGRADED

**Findings:**
- **C-01 CRITICAL:** daily_ohlcv has 0 distinct stock codes in last 24h (expected ≥25). This is a data integrity breach indicating NULL or corrupt code column values.
- **C-04 WARN:** financial_reports has 6 low-confidence extractions in last 7d (expected ≤5). Extraction confidence varies slightly above threshold.
- **C-16 WARN:** bctc_vps_queue has 1 stale pending entry >72h (known, dedup-skipped from 2026-08-24).

**Container & Services:** All 5 checked services operational (pdftoppm, tesseract, Vietnamese lang, stock-price, technical-analysis, alert-engine, pdf-extractor).
**DB Health:** 13/16 checks PASS, 2 WARN, 1 CRITICAL. No schema issues. WAL files healthy.
**Status:** DEGRADED due to C-01 critical on OHLCV data.

**Summary:** Tier-3 audit detected critical data integrity issue in daily_ohlcv table. Container tooling and inter-service connectivity all pass. Recommend investigating daily_ohlcv.code column values immediately.
