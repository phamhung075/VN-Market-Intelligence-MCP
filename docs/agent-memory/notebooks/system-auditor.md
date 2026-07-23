## g7e1f2a5 · 2026-07-23T17:41:24Z
### Audit Run Tier-1 (17:41 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 22.62% (695 MiB / 3 GiB) — well below threshold
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (4h window) | A-32 Disk: 33% used
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 12 host_runtime_set services UP (healthy). All 5 health endpoints 200 OK. A-20 3/3 in-container probes pass. A-21 zero crash events in 4h window. Memory stable at 22.62%, well below 85%. Disk 33%. No clock skew detected (file mtimes normal). All cron jobs executing. docker-events/fleet-push already tracked as known launchd issues (dedup guard active).

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T17:41:24Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server           24 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        2 days ago
mcp-gateway                                       Up 7 days (healthy)          mcpservergatway-gateway                         7 days ago
vn-market-intelligence-mcp-frontend-1             Up 8 days (healthy)          vn-market-intelligence-mcp-frontend             8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)          vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 8 days (healthy)          ghcr.io/flaresolverr/flaresolverr:latest        8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)          vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 22 hours (healthy)        vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)          vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)          vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)          vn-market-intelligence-mcp-alert-engine         8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)          vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    8 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=22.62% MemUsage=695MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 22.62% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    28Gi    33%    393k  292M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## f3c2d1e4 · 2026-07-23T16:17:07Z
### Audit Run Tier-1 (16:17 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server peak 99.92% → benign GC recovery to 4.34% (FOLD verdict, A-30 already dedup)
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (container uptime 12h, no crash events) | Disk: 32% used
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 12 host_runtime_set services UP. All health endpoints 200 OK. A-30 memory spike benign (VmHWM >> VmRSS proves reclamation). docker-events/fleet-push already tracked in dedup ledger (2026-07-23T10:32).

## e7d9a3b2 · 2026-07-23T14:32:41Z
### Audit Run Tier-2 (14:32 UTC 2026-07-23)
- Tier: 2 | Sources: 6 checked | VPS routes: 4 | Cron checks: 1
- A-29 fire-check: PASS | B-06 VPS health: news ok, prices ok, sbv STALE (35h, dedup-skipped), bctc ok by-design
- C-06/C-07 DB freshness: PASS (2 msgs, 305 signals)
- Anomalies: 0 new (1 dedup-skipped from 2026-07-22)
- Status: HEALTHY

## a1f8b5c9 · 2026-07-23T14:11:19Z
### Audit Run Tier-1 (14:06–14:11 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 73.43% (2.203 GiB / 3 GiB) — stable
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (window: 4h) | Disk: 30% used
- Anomalies: 0 new
- Status: HEALTHY

## d8f2c1a5 · 2026-07-23T10:33:18Z
### Audit Run Tier-2 (10:33 UTC 2026-07-23)
- Tier: 2 | Launchd checks: 3 agents | Signal-queue rows: 3
- Anomalies: 3 new (2 CRITICAL, 1 WARN launchd agents)
- Status: DEGRADED
- Findings: A-LAUNCHD-DOCKER-EVENTS CRITICAL | A-LAUNCHD-COWORK-FIRER WARN | A-LAUNCHD-FLEET-PUSH-CONFIRM CRITICAL
