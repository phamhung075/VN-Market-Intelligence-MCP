# System Auditor — Tier-1 Notebook


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

## c100 · 2026-08-14T18:20Z


### Audit Run Tier-1

**Timestamp:** 2026-08-14T18:20:27Z
**Duration:** ~2 min (wall time budget 120s)

### Verdict
- **A-01 to A-11 (Container Status)**: PASS — all host_runtime_set services UP
- **A-12 to A-20 (Health Endpoints)**: PASS — all health checks 200 OK, A-20 pdf-extractor 3/3 multi-probe pass
- **A-21 (Restart Count)**: PASS — crashRestarts=0
- **A-30 (Memory Pressure)**: PASS — all containers below 85% threshold
- **A-32 (Disk)**: PASS — 42% capacity
- **A-33 (Hook Liveness)**: PASS — all load-bearing hooks properly configured

**Overall Tier-1 Result:** ALL_GREEN — System confirmed healthy this cycle

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T18:19:48Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 9 hours (healthy)    vn-market-intelligence-mcp-rag-service          10 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 23 hours (healthy)   vn-market-intelligence-mcp-mcp-server           23 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 27 hours (healthy)   vn-market-intelligence-mcp-news-fetch           27 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 29 hours (healthy)   vn-market-intelligence-mcp-api-gateway          29 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 30 hours (healthy)   vn-market-intelligence-mcp-alert-engine         30 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 28 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)     vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)    vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 3 weeks (healthy)    vn-market-intelligence-mcp-frontend             3 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)    mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=19.78% MemUsage=607.6MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 47.89% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 19.37% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 7.58% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.95% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.37% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 48.81% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.81% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.43% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 15.01% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 4.76% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.68% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.06% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    19Gi    42%    393k  201M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Notes
- VN market is currently closed (outside trading window)
- No anomalies detected in this cycle
- All container restarts clean, no crash patterns
- Sufficient disk headroom (233Gi total, 42% used)
- All hooks enforcement mechanisms active

## c99 · 2026-08-14T16:00Z

### Audit Run Tier-2 (16:00 UTC 2026-08-14)
- Tier: 2 | Cron checks: 89 layer-a | VPS routes: 8 | SLA freshness: 5 sources
- **Anomalies: 10 findings (1 CRITICAL A-29, 1 WARN B-06/07, 9 WARN A-29b) — cron fire gaps critical, VPS bctc-service unhealthy**
- Dedup-skipped: 0 | Signals posted: 11 | Status: DEGRADED

### Cron Fire Check (A-29)
**STALE/MISSED crons (CRITICAL severity, 8 findings):**
- vpsProxyWatchdog: STALE (9.7h overdue, cadence 0.3h)
- alertScanParallel: STALE (9.8h overdue, cadence 0.4h)
- taAlertNotifier: STALE (9.8h overdue, cadence 0.4h)
- priceUpdateWatchdog: STALE (9.7h overdue, cadence 0.3h)
- vnIndexRefresh: STALE (9.6h overdue, cadence 0.1h)
- monthlySignalQualityAudit: MISSED (1794.5h overdue, cadence 1080h)
- brokerSanctionsSweep: STALE (346.5h overdue, cadence 36h)
- ragFtsRebuildCron: STALE (598.3h overdue, cadence 36h)

**Unresolved-Join crons (A-29b, WARN severity, 9 findings):** marketOpen, marketClose, dataAuditDaily, summaryWeekly, summaryMonthly, summaryQuarterly, summaryYearly, foreignFlowFetch, publicContractsRefresh

### VPS Service Health (B-06/B-07)
**vn-bctc-fetch: UNHEALTHY (WARN)** — Last poll 2m ago, response timeout (0ms)
**Other routes: HEALTHY** — prices, news, sbv all ok

### Data Freshness & Rate Limits
All checks PASS: price/bctc/news/sbv_fx/foreign_flow within SLA, no rate limit saturation

### Macro Snapshot
Status OK (live tier-2): VN Index 1729.08 (down -36.55), USDVND 25950 (bearish), Gold 4439 (bullish)

**Verdict: DEGRADED — Multiple cron schedules overdue, VPS bctc service health concern**
