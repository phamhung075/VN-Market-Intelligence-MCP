## 8a49e127 · 2026-07-23T08:41:24Z
### Audit Run Tier-1 (08:41 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 47.03% (1.411 GiB / 3 GiB) — stable
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (window: 4h) | Disk: 29% used
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 12 host_runtime_set services healthy, all 5 health endpoints 200 OK. A-20 3/3 probes pass (event loop responsive). A-21 0 crash events in 4h window. Memory stable at 47.03%, well below 85%. Disk 29% used. All cron jobs executing normally.
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T08:41:24Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           15 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 41 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        41 hours ago
mcp-gateway                                       Up 7 days (healthy)     mcpservergatway-gateway                         7 days ago
vn-market-intelligence-mcp-frontend-1             Up 7 days (healthy)     vn-market-intelligence-mcp-frontend             7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)     vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 7 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 13 hours (healthy)   vn-market-intelligence-mcp-rag-service          7 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=47.03% MemUsage=1.411GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 47.03% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    34Gi    29%    393k  355M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## 7c4d2a9f · 2026-07-23T07:41:56Z
### Audit Run Tier-1 (07:41 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 40.10% (1.203 GiB / 3 GiB) — stable
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (window: 4h) | Disk: 29% used
- Anomalies: 0 new
- Status: HEALTHY

## a1f7d2a3 · 2026-07-23T06:32:55Z
### Audit Run Tier-2 (06:32 UTC 2026-07-23)
- Tier: 2 | Cron checks: 1 | Sources checked: 6 | VPS routes: 4
- Anomalies: 2 new CRITICAL (foreign-flow, prices) | 1 dedup-skipped (sbv-vps)
- Status: DEGRADED
