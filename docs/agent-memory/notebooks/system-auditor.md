
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

## c1009 · 2026-08-24T22:30Z
### Audit Run Tier-1 (22:57:36Z UTC 2026-08-24)
- Tier: 1 | Fire tick: 2026-08-24T22:30Z | Pre-gate verdict: FAILURE (launchd_agents) | Spawn decision: SPAWN
- All runtime checks A-01 through A-33: PASS (non-launchd dimensions)
- Launchd verdict: FAILURE — signature `launchd_agents:com.vn-market.fleet-push(not-loaded)` (also acknowledged-degraded, tracked: com.vn-market.docker-events(exit-status:143))
- Anomalies: 0 new findings — EXPECTED-DISABLED case, already tracked at `task_board.ready[108]`
- Status: KNOWN FALSE POSITIVE — no signal row minted

#### Root Cause — EXPECTED-DISABLED Classification

**Signature:** `launchd_agents:com.vn-market.fleet-push(not-loaded)`

**Evidence — Deliberate Disarm:**
- **Live installed plist:** `~/Library/LaunchAgents/com.vn-market.fleet-push.plist` (binary plist)
  - Verified with: `plutil -convert xml1 ~/Library/LaunchAgents/com.vn-market.fleet-push.plist -o -`
  - Contains: `<key>Disabled</key><true/>`
  - **Also confirmed:** `launchctl print-disabled gui/501` lists `com.vn-market.fleet-push => disabled`

- **Canonical repo plist:** `launchd/com.vn-market.fleet-push.plist`
  - Does NOT contain Disabled key (enabled by default)
  - Repo is SSOT for intended state

- **Conclusion:** The user's local system has intentionally disabled this job via the installed plist's Disabled=true flag. This is not a fault — it is a deliberate local disarm.

#### Debounce History

Per `docs/data/auditor-tier1-spawn-debounce.json`:
- **signature:** `launchd_agents:com.vn-market.fleet-push`
- **first_seen_at:** 2026-08-24T16:40:57Z
- **spawn_count:** 6 (burned six auditor spawns across ~6 hours)
- **last_healthy_at:** 2026-08-24T16:25:27Z (~6.5h stale — heartbeat has NOT advanced since)
- **window open to:** 2026-08-24T23:57:36Z

Each of these 6 spawns encountered the same condition: fleet-push is disabled on the user's local system, which the probe correctly detects as not-loaded.

#### Why No Signal Row Was Minted

The root cause is already tracked at **`task_board.ready[108].id = FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED`** (P1, status=READY, next_agent=architect, dispatch_lane=null).

**Acceptance Criteria (from ready[108]):**
- AC-1: A label whose installed plist carries Disabled=1 must be classified EXPECTED-DISABLED and must not count as an unhealthy launchd label
- AC-2: Read the flag from the INSTALLED plist (~/Library/LaunchAgents/<label>.plist), not the repo copy; note it is a BINARY plist — use `plutil -p` or PlistBuddy (AC-2 explicitly warns that `grep -i disabled` returns nothing on binary plists)
- AC-3: Also treat `launchctl print-disabled` membership as EXPECTED-DISABLED
- AC-4: EXPECTED-DISABLED must still be named in the probe's detail string for transparency
- AC-5: Once implemented, the fleet-push entry in auditor-launchd-ack.json is removable with zero churn and MUST be removed per the ledger's staleness rule

**Current situation:** The probe has NOT yet implemented AC-1/AC-2. It reads only the repo plist (which lacks Disabled) and reports the intentional disarm as a fresh FAILURE every 30 minutes. This is why 6 spawns have burned re-confirming the same known condition.

**Mechanism:** The ack ledger at `docs/data/auditor-launchd-ack.json` had an entry for fleet-push whose `tracked_by` field pointed to `FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD` (now in archive/DONE_VERIFIED, cold-evicted from orch-state.json). The code-enforced staleness rule correctly detected this as absent-from-every-lane and stopped suppressing. With that suppression gone, the unclassified-as-EXPECTED-DISABLED disarm now fires a fresh FAILURE every tick. The fix is to classify it properly, which is self-expiring and needs no ack entry at all.

#### Dimension Coverage for This Tick

From `docs/data/auditor-tier1-last-trigger.json` (fire_tick 2026-08-24T22:30Z):
- docker_ps: PASS
- health_3000: PASS
- health_3001: PASS
- disk: PASS
- mem_creep: PASS
- launchd_agents: FAIL (expected-disabled case, see above)

**Note:** mem_creep is PASS this tick — neither pdf-extractor nor rag-service is breaching the 85% investigate gate.

#### Next Action

No action required by this cycle. The probe implementation (AC-1/AC-2) is tracked at ready[108] with explicit acceptance criteria. Once that ships, the user's intentional disarm will be properly classified and will stop re-spawning the auditor every 30 minutes.


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

## c1008 · 2026-08-24T20:00Z
### Audit Run Tier-1 (19:31–20:19 UTC 2026-08-24)
- Tier: 1 | Fire tick: 2026-08-24T20:00Z | Pre-gate verdict: FAILURE (launchd_agents) | Spawn decision: SPAWN
- All runtime checks A-01 through A-33: PASS
- Anomalies: 0 new findings (pre-gate launchd FP already tracked in ready[107]/ready[108])
- Status: ALL_GREEN (non-launchd dimensions)

#### RAW-PROBE Output

```
=== AUDITOR PROBE 2026-08-24T20:18:26Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 11 minutes (healthy)   vn-market-intelligence-mcp-frontend             11 minutes ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 hours (healthy)      vn-market-intelligence-mcp-pdf-extractor        7 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)      vn-market-intelligence-mcp-mcp-server           8 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)       vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-rag-service-1          Up 9 days (healthy)       vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)      vn-market-intelligence-mcp-news-fetch           11 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)      vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 weeks (healthy)      vn-market-intelligence-mcp-stock-price          2 weeks ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 weeks (healthy)      vn-market-intelligence-mcp-macro-indicators     3 weeks ago
mcp-gateway                                       Up 5 weeks (healthy)      mcpservergatway-gateway                         5 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 weeks (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        5 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 weeks (healthy)      vn-market-intelligence-mcp-technical-analysis   5 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 weeks (healthy)      vn-market-intelligence-mcp-kinh-dich-service    5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=18.39% MemUsage=565MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.86% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 65.95% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 18.40% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 1.83% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 76.45% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 5.59% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.40% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.50% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.30% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.04% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.23% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 2.98% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

#### A-01 through A-11 — Docker Container Status (host_runtime_set)

**Verdicts (from [RAW-PROBE] docker ps section):**
- mcp-server: Up 8 hours (healthy) [RAW-PROBE L8] — PASS
- api-gateway: Up 11 days (healthy) [RAW-PROBE L7] — PASS
- frontend: Up 11 minutes (healthy) [RAW-PROBE L6] — PASS
- macro-indicators: Up 3 weeks (healthy) [RAW-PROBE L11] — PASS
- mcp-gateway: Up 5 weeks (healthy) [RAW-PROBE L12] — PASS
- pdf-extractor: Up 7 hours (healthy) [RAW-PROBE L9] — PASS

All host_runtime_set services UP and HEALTHY.

#### A-12 through A-20 — Health Endpoints

**Verdicts (from [RAW-PROBE] health endpoints section):**
- mcp-server:3000/health: HTTP 200 [RAW-PROBE L19] — PASS
- api-gateway:4000/health: HTTP 200 [RAW-PROBE L20] — PASS
- macro-indicators:5004/health: HTTP 200 [RAW-PROBE L21] — PASS
- pdf-extractor:5001/health: HTTP 200 [RAW-PROBE L22] — PASS
- frontend:3001/: HTTP 200 [RAW-PROBE L23] — PASS

#### A-20 — pdf-extractor Multi-Probe Discriminator

**Verdict:** 3/3 probes passed (100% pass rate) [RAW-PROBE L30] — PASS

#### A-21 — Restart Count

**Verdict (from [RAW-PROBE]):** RestartCount=0 [RAW-PROBE L26] — PASS (no crashes in 4h window)

#### A-30 — Memory Pressure & Reclamation

**Verdict:** All containers well below 85% gate; all SKIPped deep-probe [RAW-PROBE L32-43]:
- mcp-server: 18.40% < 85% — SKIP
- rag-service: 76.45% < 85% — SKIP
- pdf-extractor: 65.95% < 85% — SKIP
- (all others similarly below gate)

#### A-32 — Disk

**Verdict (from [RAW-PROBE]):** 35% used [RAW-PROBE L45] — PASS (well below 85% threshold)

#### A-33 — Hook Enforcement Liveness

**4 load-bearing hooks:** orch-state-hook-bash-backstop.sh, context-bloat-backstop.sh, notebook-auto-prune.sh, branch-hygiene-stop.sh — ALL registered and executable — PASS

**3 LOW-tier hooks:** tmux-agent.sh status, tmux set-option, graphify — ALL registered — PASS (LOW)

#### Pre-Gate Context & Known False Positive

**Pre-gate probe verdict:** FAILURE (launchd_agents)
- Check: com.vn-market.fleet-push NOT-LOADED
- Root cause: CONFIRMED FALSE POSITIVE (deliberately disabled by user, no regression)
- Status: Already tracked in ready[107] (FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED, P1) and ready[108] (FIX-AUDITOR-TIER1-PROBE-TEST-INVERTED-ASSERTION-L1422-FALSE-GREEN, P1)
- Action: Do NOT file new signal row (per pre-gate instruction); covered by existing rows

#### Summary

**Tier-1 runtime audit cycle complete — ALL_GREEN on all observable dimensions (A-01 through A-33).**

The pre-gate probe returned FAILURE due to a launchd_agents check on a deliberately-disabled job. This is a known false positive already tracked via two P1 rows in the ready lane. All other dimensions (container status, health endpoints, memory, disk, hook liveness, A-20 multi-probe, A-21 windowed crash check, A-33 hook enforcement) passed with no alerts.

No new signals warranted this cycle. System healthy on runtime checks. 

Marker trace: none (no findings to emit)
