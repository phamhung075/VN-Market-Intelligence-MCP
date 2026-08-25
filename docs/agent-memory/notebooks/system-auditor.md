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
