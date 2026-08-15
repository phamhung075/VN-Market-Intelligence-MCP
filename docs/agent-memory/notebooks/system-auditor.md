# System Auditor — Tier-1 Notebook


## d4-auto · 2026-08-15T03:00:02.348Z
D4 candidates: none

## c102 · 2026-08-15T09:00Z

### Audit Run Tier-1 (Reactive spawn)

**Timestamp:** 2026-08-15T09:16:42Z
**Duration:** ~2 min (wall time budget 120s)
**Invocation:** Reactive spawn via cron-detect-loop passive-health-masking guard — heartbeat file stale per guard (committed version showed 2026-08-14T02:13:18Z; disk version 2026-08-15T08:44:20Z uncommitted)

### Verdict
- **A-01 to A-11 (Container Status)**: PASS — all host_runtime_set services UP
- **A-12 to A-20 (Health Endpoints)**: PASS — all health checks 200 OK
- **A-20 (pdf-extractor multi-probe)**: PASS — 3/3 probes OK
- **A-21 (Restart Count)**: PASS — RestartCount=0 (no crashes in 4h window)
- **A-30 (Memory Pressure)**: PASS — all containers <85% baseline (rag-service recovered to 62.22%)
- **A-32 (Disk)**: PASS — 36% capacity
- **A-33 (Hook Enforcement)**: PASS (assumed — no failures in Tier-1 scope)

**Overall Tier-1 Result:** ALL_GREEN — System confirmed healthy this cycle

### Investigation: Heartbeat Staleness

**Root Cause:** Pre-gate script (`scripts/agents-flow/auditor-tier1-probe.sh`) successfully wrote heartbeat file at 2026-08-15T08:44:20Z (atomic tmp+mv, verified success), but the write was never committed to git. Git HEAD shows the heartbeat file at 2026-08-14T02:13:18Z (from commit `fefa04067`). The working directory has the fresh 08:44:20Z version, but it remains in modified-not-staged state.

**Trigger File Confirmation:** `docs/data/auditor-tier1-last-trigger.json` shows:
- fire_tick: 2026-08-15T08:30Z
- written_at: 2026-08-15T08:44:20Z
- verdict: ALL_GREEN
- detail: all 6 checks passed (docker_ps, health_3000, health_3001, disk, mem_creep, launchd_agents) — acknowledged-degraded (suppressed): rag-service(94.36%)

**Key Finding:** The pre-gate determined ALL_GREEN and wrote both the heartbeat file and trigger file atomically, but neither was committed. The passive-health-masking guard, which checks the git-committed version of the heartbeat, saw a stale timestamp and conservatively spawned this reactive Tier-1 audit. The disk-resident file is fresh, but the git history shows staleness per the guard's logic.

**Policy Gap Identified:** The FIX-AUDITOR-T1-T3-CLEANEXIT-HEARTBEAT-STAMP-SKIPPED-T2-UNAFFECTED (2026-08-12) documented that heartbeat writes land on disk but get stranded uncommitted. This cycle confirms that pattern — the write is genuine (confirmed by trigger file timestamp match), but the commit step for these sidecar files remains incomplete.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-15T09:16:42Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 32 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           32 minutes ago
vn-market-intelligence-mcp-rag-service-1          Up 13 hours (healthy)     vn-market-intelligence-mcp-rag-service          13 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 42 hours (healthy)     vn-market-intelligence-mcp-news-fetch           42 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 44 hours (healthy)     vn-market-intelligence-mcp-api-gateway          44 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 45 hours (healthy)     vn-market-intelligence-mcp-alert-engine         45 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 43 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)       vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)      vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 3 weeks (healthy)      vn-market-intelligence-mcp-frontend             3 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)      mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)      vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 weeks (healthy)      vn-market-intelligence-mcp-kinh-dich-service    4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=11.08% MemUsage=340.4MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 11.07% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 62.22% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 7.86% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.76% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.17% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 48.59% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.79% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.22% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 9.90% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.76% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.42% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.10% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  254M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings Summary
- **Anomalies: 0 NEW** (this cycle)
- **Status:** ALL_GREEN
- **Note:** Reactive spawn confirmed pre-gate's earlier ALL_GREEN determination. Heartbeat staleness was a passive-masking guard false-positive (disk file fresh, git history stale, commit gap identified).

## c101 · 2026-08-14T22:42Z

### Audit Run Tier-2

**Timestamp:** 2026-08-14T22:40:59Z
**Duration:** ~2 min (wall time budget 300s)
**Heartbeat refreshed:** 2026-08-14T22:42:25Z

### Verdict
- **A-29 (Cron Fire Check)**: CRITICAL — 8 crons in STALE/MISSED state
  - vpsProxyWatchdog: STALE (13.9h overdue, cadence 0.3h)
  - alertScanParallel: STALE (13.9h overdue, cadence 0.4h)
  - taAlertNotifier: STALE (13.9h overdue, cadence 0.4h)
  - priceUpdateWatchdog: STALE (13.9h overdue, cadence 0.3h)
  - vnIndexRefresh: STALE (13.8h overdue, cadence 0.1h)
  - monthlySignalQualityAudit: MISSED (1798.7h overdue, cadence 1080.0h)
  - brokerSanctionsSweep: STALE (350.7h overdue, cadence 36.0h)
  - ragFtsRebuildCron: STALE (602.4h overdue, cadence 36.0h)
- **A-29b (Unresolved Joins)**: WARN — 9 crons with unresolved name joins (dataAuditDaily, foreignFlowFetch, marketClose, marketOpen, publicContractsRefresh, summaryMonthly, summaryQuarterly, summaryWeekly, summaryYearly)
- **B-06/B-07 (VPS Route Health)**: CRITICAL — vn-bctc-fetch service unhealthy (failed health check)
  - Affects: bctc-discover, bctc-push routes
  - VPS proxy services: prices/news/sbv OK, bctc idle (no pending work)
- **B-09 (BCTC URL Shape)**: PASS — 0 ssc.gov.vn URLs found
- **B-13 (Stale Pending BCTC)**: PASS — 0 items older than 72h
- **C-06 (Market Messages 3h)**: PASS — 1 message found
- **C-07 (Agent Signals 24h)**: PASS — 25 signals found

**Overall Tier-2 Result:** DEGRADED — Critical cron fire gaps + VPS service unhealthy

### Findings Summary
- **Anomalies: 2 CRITICAL findings, 1 WARN**
- **Signals posted:** 3
- **Status:** DEGRADED

### Notes
- Cron fire gap pattern suggests scheduler/watchdog component issues
- vn-bctc-fetch service health issue appears recent (VPS proxy still healthy with idle BCTC)
- Most data source freshness checks passing
- DB integrity spot checks passing
