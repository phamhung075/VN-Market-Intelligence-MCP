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

## c1016 · 2026-08-25T03:30Z
### Audit Run Tier-1 (2026-08-25T03:30Z)
- Tier: 1 | Verdict: ALL_GREEN (pre-gate)
- Checks passed: docker_ps, health_3000, health_3001, disk, mem_creep, launchd_agents
- Findings: 1 signal emitted (verified mcp-server deployment mismatch)
- Status: PASS with 1 WARN item

### Pre-Gate Evidence
- Source: scripts/agents-flow/auditor-tier1-probe.sh
- File: docs/data/auditor-tier1-last-trigger.json
- Timestamp: 2026-08-25T03:53:53Z
- Result: ALL_GREEN (all 6 checks passed)
  - docker_ps: PASS
  - health_3000: PASS
  - health_3001: PASS
  - disk: PASS
  - mem_creep: PASS
  - launchd_agents: PASS (expected-disabled by user policy)

### Acknowledged Conditions (Known, Not New Signals)
1. **com.vn-market.docker-events** — exit-status 143 (acknowledged degraded, tracked via backlog fix)
2. **com.vn-market.fleet-push** — deliberately disabled by user (Disabled=1 in plist)
   - Architect brief: docs/architecture-briefs/2026-08-25-fix-auditor-tier1-launchd-expected-disabled.md
   - Developer agent implementing: FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED
   - Action: NO DUPLICATE SIGNAL (constraint: known issue, fix in-flight)

### A-32 Finding: mcp-server Deployment Mismatch
**Signal emitted:** sys-20260825T035603-1fb9 (WARN, severity WARN)
**Check ID:** A-32
**Issue:** Running mcp-server image is 13+ hours older than latest verified fix
- Fix commit: 0f6891872 (landed 2026-08-25T01:54:59Z)
- Commit description: "reaper stops orphan-minting TTL-expired locks owned by a live presence-registered session"
- Marked done_verified: ~02:5x (per pre-gate context)
- Running image creation: 2026-08-24T12:41:49Z (13+ hours old)
- No rebuild occurred between commit and current time
- **Defect reproduction confirmed:** 03:03Z/03:06Z against live presence-registered locks
- Both instances released after confirming underlying tasks succeeded
- Expected next occurrence: ~04:49Z when dispatch locks age out
- **Root class:** Verified-in-repo vs verified-in-production gap

### Durability Sweep
[durability-sweep] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=0

### Contract Status
- No contract contradictions
- Probe NOT re-run (constraint: avoid dedup-ledger mutation)
- Verdict sourced from trigger file (read-only, evidence use only)

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
