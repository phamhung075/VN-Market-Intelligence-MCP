## Audit Run Tier-DATA (c88)

**Run:** 2026-08-25T12:09:51Z | Pre-gate exit: SPAWN (5 watched tables changed since last sweep)

**Summary:** DATA tier sweep completed. 3 findings recorded to db-integrity-history.json (all BY-DESIGN or already tracked).

**Key results:**
- deep_fetch_stats: 0 rows (class a, production writer exists) — REAL but already owned by FIX-DEEPFETCH-PIPELINE
- daily_ohlcv OHLC violations: 336 across 20 dates, all pre-2026-08-25 (no fresh 2d violations) — BY-DESIGN, owned by CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR
- financial_reports low-confidence: 52 rows (extraction_confidence < 0.2) — BY-DESIGN, expected PDF OCR noise

**History append:** history_len_before=200, history_len_after=200 (at cap), signals_written=[] (all BY-DESIGN/already-tracked)

## c2 · 2026-08-25T08:00Z
### Audit Run Tier-DATA (05:00–16:59 UTC 2026-08-25)
- Tier: DATA | Tables checked: 17 | DB Data-Anomaly Sweep
- Anomalies: 0 new (no findings outside already-open tasks)
- Status: HEALTHY (all tracked issues remain stable)

#### Raw Counts (db-integrity-counts.sh)
- scan_ts: 2026-08-25T07:59:48Z
- ohlc_violations_count: 336 (20 distinct dates, 0 fresh in last 2 days)
- scale_gt100x_count: 0
- vnindex_cache_rows_count: 1
- low_confidence_reports_count: 52

#### Findings Summary
**No new anomalies detected.** All observations match existing open task tracking:

1. **deep_fetch_stats** (0 rows, class a/may_stay_critical): Already-open signal tracked under FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD.

2. **daily_ohlcv OHLC violations** (336 rows across 20 distinct dates): Stable residue; 0 fresh violations in last 2 days. Already-open under LINT-OHLCV-WRITE-BYPASS.

3. **Other tables** (macro_indicators, sbv_rates, price_alerts, alert_engine_records, cron_job_runs): All classified as by-design (class b/c) or already tracked.

**Database state:** Stable. Deep fetch pipeline remains stalled (consistent with prior cycle). No new root causes identified.

**Entry appended to:** `docs/data/db-integrity-history.json` (length: 200, capped)

**Dedup status:** 1 finding (deep_fetch_stats) matched to existing open task FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD. No new signals written.

**Exit code:** 0 (RECORD OK)

## Tier-DATA (2026-08-25T05:41:12Z)

**Audit Run:** DB Data-Anomaly Sweep

**Tables checked:** 17 high-value tables, deterministic counts from scripts/db-integrity-counts.sh

**Counts (immutable read-mode):**
- ohlc_violations: 336 (stable residue, 0 fresh in last 2d, across 20 distinct dates)
- scale_gt100x: 0
- vnindex_cache_rows: 1
- low_confidence_reports: 52

**Findings Summary:**
1. **daily_ohlcv OHLC violations (336 rows)** — Stable residue from prior data extraction issues. Fresh violations in last 2 days: 0. Pipeline currently produces correct data. Tracked under open repair tasks: LINT-OHLCV-WRITE-BYPASS and CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR. Verdict: NOISE (no new anomalies).

**Other tables (already-open):**
- `deep_fetch_stats` (class=a, production writer) — already-open: sys-20260806T065709-49e3
- `deep_fetch_queue` (2549 rows, 2482 expired) — already-open: FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD
- `cron_job_runs` (212 error/crashed rows) — already-open: FIX-CRON-RUNS-NULL-ERRORMSG
- `macro_indicators` (1 row, stale 17.5h) — already-open: FIX-MACRO-INDICATORS-EMPTY-COLUMNS

**Exit:** 0 (RECORD OK, no new signals)
