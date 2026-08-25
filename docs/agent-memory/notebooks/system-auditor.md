## c1012 · 2026-08-25T02:30Z
### Audit Run Tier-DATA (2026-08-25T02:30Z)
- Tier: DATA | Tables checked: 17 | Findings: 4 (1 REAL HIGH, 1 REAL HIGH, 1 REAL MED, 1 BY-DESIGN)
- Anomalies: 0 new signals (2 already-open, 1 already-open, 0 new) | 0 dedup-skipped
- Status: HEALTHY (no new data anomalies detected; known deep-fetch pipeline stall already tracked)

### Findings Summary

**1. deep_fetch_stats table — empty (0 rows, class=a severity=HIGH)**
- Table exists but contains no rows
- Production writer: `apps/mcp-server/src/infrastructure/db/deepFetchQueueStore.ts` line 173
- Severity ceiling: may_stay_critical
- Root cause: Deep-fetch worker may have stalled. The 30 pending fetch-queue entries 161+ hours old (queued 2026-08-18 ~08:44) with zero retry attempts strongly suggest the processor is not advancing the queue.
- Signal ID: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD
- Resolution: SAME_CYCLE_DEDUP

**2. deep_fetch_queue table — 30 pending entries stuck 161+ hours**
- Total queue entries: 2535, Pending: 30, Failed: 0
- All 30 pending entries queued 2026-08-18 08:43:53 (161 hours ago)
- Retry attempts: 0 for all (worker never attempted processing)
- Root cause: Deep-fetch worker process may be hung or dead
- Signal ID: already-open:FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD
- Resolution: SAME_CYCLE_DEDUP (linked to deep_fetch_stats)

**3. daily_ohlcv — 336 OHLC violations persistent (class=INCORRECT, severity=MED)**
- OHLC violations count: 336 (deterministic from db-integrity-counts.sh)
- Distinct dates affected: 20 (NOT concentrated on single date)
- Fresh violations (last 2 days): 0 (positive signal — no new violations)
- Scale anomalies (x1000 class): 0
- Root cause: Known residual OHLC data quality issue from prior weeks
- Signal ID: already-open:LINT-OHLCV-WRITE-BYPASS
- Resolution: SAME_CYCLE_DEDUP (already tracked)

**4. financial_reports — 52 low-confidence reports (class=FAIL, verdict=BY-DESIGN)**
- Low-confidence report count: 52 (deterministic from db-integrity-counts.sh)
- Expected behavior: PDF extraction noise flagged-not-broken per design
- Verdict: BY-DESIGN (no signal emitted)

### Scan Details
- DB: data/live/market.db (canonical, ~400MB)
- Scan timestamp: 2026-08-25T02:29:44Z
- Read mode: immutable (WAL-safe)
- daily_ohlcv total rows: 789921, latest date: 2026-08-25
- Market prices: current (2026-08-25T02:28:53.507Z)

### Verdict: HEALTHY
No new signals generated. All detected anomalies match already-open entries. No action required.

## c1011 · 2026-08-25T01:00Z
### Audit Run Tier-1

**Runtime Ping:** Fire tick `2026-08-25T01:00Z` | Status: ALL_GREEN

### RAW-PROBE:

```
=== AUDITOR PROBE 2026-08-25T01:25:51Z ===

--- docker ps -a ---
All 12 host_runtime_set services UP (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
RestartCount=0

--- memory pressure ---
All containers < 85% investigate-gate

--- disk df -h / ---
Capacity: 35% (< 85%)

--- pdf-extractor multi-probe (A-20) ---
[A-20] pass_count=3/3
```

### Findings

All Tier-1 checks: PASS

- A-01 through A-11 (Container Status): All 12 host_runtime_set services UP ✓
- A-12 through A-20 (Health Endpoints): All 5 health endpoints HTTP 200 ✓
- A-20 (pdf-extractor multi-probe): 3/3 passed ✓
- A-21 (Restart Count): 0 ✓
- A-30 (Memory Pressure): All < 85% ✓
- A-32 (Disk): 35% ✓
- A-33 (Hook Enforcement): All hooks alive ✓

**Verdict:** ALL_GREEN

**Anomalies:** 0 new findings

**Fleet-Push Note:** Pre-gate FAILURE on launchd com.vn-market.fleet-push (not-loaded) — deliberately disabled, owned by existing task row. No signal row.

## Tier-DATA — DB Integrity Sweep (2026-08-24T22:34:30Z)

DB data-anomaly sweep completed. Pre-gate verdict: SPAWN (7 tables changed).

### Deterministic Counts (db-integrity-counts.sh)
- ohlc_violations: 336 rows across 20 distinct dates (historical residue, no fresh violations in last 48h)
- scale_gt100x: 0
- vnindex_cache_rows: 1
- low_confidence_reports: 52

### Findings

**High-value tables checked:** daily_ohlcv, market_prices, market_prices_history, vn_index_cache, alerts, price_alerts, alert_engine_records, agent_signals, signal_outcomes, financial_reports, macro_indicators, sbv_rates, fred_series_daily, deep_fetch_queue, deep_fetch_stats, cron_job_runs, scheduler_locks (17 tables total).

**New anomalies: 0**
- deep_fetch_stats: 0 rows (class a, already-open: FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD)
- deep_fetch_queue: 30 pending rows queued since 2026-08-18 (already-open: FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD)
- daily_ohlcv: 336 OHLC violations (already-open: LINT-OHLCV-WRITE-BYPASS)

All findings matched existing task board entries (dedup pre-gate success).

**Freshness check:** market_prices updated 2026-08-24T21:30:03Z (fresh). Cron jobs: 3157 successful in last 24h. No recent regressions.

### History Entry
Entry appended to docs/data/db-integrity-history.json. Scan timestamp: 2026-08-24T22:34:42Z. History length: 200 (capped).
