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

## Tier-DATA DB Data-Anomaly Sweep

**Scan timestamp:** 2026-08-25T04:00:23Z  
**Deterministic counts:** ohlc_violations=336 (20 distinct dates), scale_anomalies=0, vnindex_cache=1, low_confidence_reports=52

**Findings summary (6 total, all already-open):**
1. **daily_ohlcv** (INCORRECT, MED): 336 OHLC constraint violations across 20 distinct dates. Residue from prior data extraction issues; stable count (no fresh violations in last 2 days). Tracked under LINT-OHLCV-WRITE-BYPASS. Signal: already-open:LINT-OHLCV-WRITE-BYPASS.
2. **cron_job_runs** (FAIL, WARN): 212 error rows (205 crashed + 7 error, ~0.1% error rate on 217k total). Low rate suggests transient failures, requires monitoring for spikes. Signal: already-open:FIX-CRON-RUNS-NULL-ERRORMSG.
3. **deep_fetch_queue** (STALE, WARN): 2,541 rows (2,477 expired, 34 vps-failed, 30 pending). Stale backlog; assess if being drained or stuck. Signal: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD.
4. **deep_fetch_stats** (FAIL, WARN): 0 rows despite production writer. Either writer not invoked or records aggressively rotated. Signal: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD.
5. **macro_indicators** (STALE, WARN): 1 row only; feed producing minimal output. Check source availability and last ingest. Signal: already-open:FIX-MACRO-INDICATORS-EMPTY-COLUMNS.
6. **sbv_rates** (STALE, WARN): 1 row only; SBV feed stale. Check source availability (may be offline outside business hours). Signal: already-open:AUDIT-FC-SBV-RATES.

**Dedup status:** All findings matched to existing open task rows; no new signals written.  
**History entry:** Appended to `docs/data/db-integrity-history.json` (entry [200] of max 200, capped).

See `docs/data/db-integrity-history.json` for full detail.

## c1 · 2026-08-25T07:30Z
### Audit Run Tier-DATA 
- Tier: DATA | Tables checked: 17 | Sources: multiple | Cadence-based anomaly sweep
- Anomalies: 2 REAL (deep_fetch_stats HIGH, deep_fetch_queue HIGH), 5 BY-DESIGN, 336 OHLCV violations (known residue, already-open)
- Status: DEGRADED (deep fetch pipeline stalled)

#### Findings Summary
**Data Integrity Scan — 2026-08-25T07:29:01Z**

Using deterministic helpers:
- `db-integrity-counts.sh`: scan_ts=2026-08-25T07:29:01Z
  - ohlc_violations_count: 336 (20 distinct dates, no fresh violations in last 2d)
  - scale_gt100x_count: 0
  - vnindex_cache_rows_count: 1
  - low_confidence_reports_count: 52

**Critical Findings:**
1. **deep_fetch_stats**: class=a/may_stay_critical, 0 rows. Root cause: deep_fetch_queue has 0 completed fetches — all 2556 rows are expired/failed/pending.
   - Signal: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD

2. **deep_fetch_queue**: Status=[expired:2490 (97%), vps-failed:34 (1%), pending:32 (1%)]. Zero completed fetches. Pending rows stuck up to 167 hours.
   - Signal: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD

**Known Issues (Dedup-Skipped):**
- daily_ohlcv: 336 violations across 20 dates (no fresh violations in last 2d)
  - Signal: already-open:LINT-OHLCV-WRITE-BYPASS

**By-Design (INFO):**
- alert_engine_records, price_alerts: empty by design per writer-provenance discriminator
- cron_job_runs: 205 stale crashes (oldest 2026-08-11, no recent crashes)

**Root Cause**: Deep fetch pipeline non-functional — no successful fetches completing. Indicates VPS connectivity/rate-limit issues or downstream processor stall.
