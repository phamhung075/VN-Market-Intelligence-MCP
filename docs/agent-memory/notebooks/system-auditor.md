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

## c13 · 2026-08-26T06:28:31Z
### Audit Run Tier-DATA (06:28–06:29 UTC 2026-08-26)
- Tier: DATA | Services: N/A | Sources: N/A | DB checks: 4 (ohlc_violations, scale_violations, vnindex_cache, low_confidence)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Findings

**D-VIOLATIONS (OHLC):** 336 rows with violations across 20 distinct dates
**D-VIOLATIONS (SCALE):** 0 rows with >100x variance
**D-CACHE (VNINDEX):** 1 cached row present
**D-CONFIDENCE (LOW):** 52 reports with low confidence

All findings within acceptable bounds for operational DB state. History entry appended at scan_ts=2026-08-26T06:28:19Z.

### History Entry Reference
- Scan: 2026-08-26T06:28:19Z | File: docs/data/db-integrity-history.json | Entry count before/after: 200/200 (AT CAP)

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
