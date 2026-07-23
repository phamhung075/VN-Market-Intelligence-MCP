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
- Corroboration: All 12 host_runtime_set services UP (healthy), all 5 health endpoints 200 OK. A-20 3/3 probes pass (pdf-extractor event loop responsive). A-21 0 crash events in 4h window. Memory at 73.43%, below 85% threshold. Disk 30%. All cron jobs executing normally.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T14:11:19Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)   vn-market-intelligence-mcp-mcp-server           20 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 46 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        46 hours ago
mcp-gateway                                       Up 7 days (healthy)     mcpservergatway-gateway                         7 days ago
vn-market-intelligence-mcp-frontend-1             Up 7 days (healthy)     vn-market-intelligence-mcp-frontend             7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)     vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 7 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 18 hours (healthy)   vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)     vn-market-intelligence-mcp-alert-engine         7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    7 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=73.43% MemUsage=2.203GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 73.42% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    30%    393k  342M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## d8f2c1a5 · 2026-07-23T10:33:18Z
### Audit Run Tier-2 (10:33 UTC 2026-07-23)
- Tier: 2 | Launchd checks: 3 agents | Signal-queue rows: 3
- Anomalies: 3 new (2 CRITICAL, 1 WARN launchd agents)
- Status: DEGRADED
- Findings: A-LAUNCHD-DOCKER-EVENTS CRITICAL | A-LAUNCHD-COWORK-FIRER WARN | A-LAUNCHD-FLEET-PUSH-CONFIRM CRITICAL
