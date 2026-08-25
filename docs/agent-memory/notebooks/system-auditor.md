## 2026-08-25 Data-Tier Audit (06:58:59Z)

**Context:** Container fleet recovered ~06:45Z from docker daemon crash (05:31Z–06:45Z outage). Scan at 07:00:48Z, 15 minutes post-recovery.

**Counts (from `scripts/db-integrity-counts.sh`):**
- OHLC violations: 336 (unchanged, 20 distinct dates 2026-05-15 to 2026-06-12)
- Scale anomalies (>100x): 0
- VN index cache: 1 row
- Low-confidence reports (<0.2): 52

**Key findings:**
1. **daily_ohlcv (336 OHLC violations):** Known historical residue, not a regression. No fresh violations in last 2 days. Verdict: BY-DESIGN.
2. **deep_fetch_stats:** Empty (class a, production writer). However, deep-fetch jobs (deepFetchMainJob, deepFetchVpsJob) ran successfully at 06:55:01Z post-recovery. Stats recording may be disabled. Verdict: REAL (WARN). Already-open task: FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD.
3. **deep_fetch_queue:** 2552 rows total; 30 pending and 34 vps-failed rows stuck from 2026-08-18 (7 days old). Did not clear during recovery. Verdict: REAL (WARN). Same task as above.
4. **price_alerts, alert_engine_records:** Both empty (expected by design—on-demand tool and separate DB respectively). Verdict: BY-DESIGN.

**Data freshness:** All key sources fresh post-recovery. market_prices: 2026-08-25T07:00:42.799Z. daily_ohlcv newest: 2026-08-25.

**History entry:** docs/data/db-integrity-history.json (entry appended, array capped at 200, counts embedded).

**Anomalies needing dev-team action:** None NEW. Both deep-fetch issues already tracked in open task.

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
