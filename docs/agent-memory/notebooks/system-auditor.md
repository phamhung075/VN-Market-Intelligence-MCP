## e4g2j9h1 · 2026-07-25T08:37:49Z
### Audit Run Tier-1 (08:37 UTC 2026-07-25)
- Tier: 1 | Services: 13 checked | Health endpoints: 5
- A-01–A-11 container status: ALL UP (13/13) — PASS
- A-12–A-19 health endpoints: ALL 200 OK (5/5) — PASS
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (4h window) | A-30 Memory: 58.63% (1.759 GiB / 3 GiB) — PASS (< 85%, SKIP deep-probe)
- A-32 Disk: 33% used — PASS
- Memory trend: monotonic rise 51.99% (08:07Z) → 58.63% (08:37Z) = +6.64% in 30min; 85% threshold remains the alert gate
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 13 host_runtime_set services UP (healthy). All 5 health endpoints 200 OK. A-20 multi-probe 3/3. Memory 58.63% << 85% investigate-gate. Denominator=3GiB (Docker stats limit). A-21 zero windowed crashes. A-32 disk 33% well below 85%. Cron jobs healthy (80+ jobs, ≥80% success rates, recent runs all success). MCP uptime 10h 49m. Database 379.48 MB, WAL 0 B. Within observed memory envelope; no evidence of runaway leak.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-25T08:37:18Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 15 hours (healthy)   vn-market-intelligence-mcp-frontend             15 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 11 hours (healthy)   vn-market-intelligence-mcp-mcp-server           24 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 9 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 9 days (healthy)     vn-market-intelligence-mcp-macro-indicators     9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)     vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    9 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=58.63% MemUsage=1.759GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 58.63% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    28Gi    33%    393k  290M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## d7f3e9c2 · 2026-07-25T08:07:50Z
### Audit Run Tier-1 (08:07 UTC 2026-07-25)
- Tier: 1 | Services: 13 checked | Health endpoints: 5
- A-01–A-11 container status: ALL UP (13/13) — PASS
- A-12–A-19 health endpoints: ALL 200 OK (5/5) — PASS
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (4h window) | A-30 Memory: 51.99% (1.56 GiB / 3 GiB) — PASS (< 85% threshold, SKIP deep-probe)
- A-32 Disk: 35% used — PASS
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 13 host_runtime_set services UP (healthy). All 5 health endpoints 200 OK. A-20 multi-probe 3/3 passes. Memory 51.99% << 85%. A-21 zero windowed crashes. A-32 disk 35%. Cron jobs all healthy (100+ jobs, 100% success rates). MCP uptime 10h 19m. Database 379.48 MB, WAL 0 B. Heartbeat refreshed (tier-1-last-healthy.json 2026-07-25T08:07:50Z).

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-25T08:07:07Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 14 hours (healthy)   vn-market-intelligence-mcp-frontend             14 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)    vn-market-intelligence-mcp-mcp-server           24 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 9 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 9 days (healthy)     vn-market-intelligence-mcp-macro-indicators     9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)     vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    9 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=51.99% MemUsage=1.56GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 51.99% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  269M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## b2d5f8e3 · 2026-07-25T07:08:26Z
### Audit Run Tier-1 (07:07 UTC 2026-07-25)
- Tier: 1 | Services: 13 checked | Health endpoints: 5
- A-01–A-11 container status: ALL UP (13/13) — PASS
- A-12–A-19 health endpoints: ALL 200 OK (5/5) — PASS
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (4h window) | A-30 Memory: 45.20% (1.356 GiB / 3 GiB) — PASS (< 85% threshold, SKIP deep-probe)
- A-32 Disk: 35% used — PASS
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 13 host_runtime_set services UP (healthy) per RAW-PROBE docker ps output. All 5 health endpoints return HTTP 200 OK (mcp-server:3000, api-gateway:4000, macro-indicators:5004, pdf-extractor:5001, frontend:3001). A-20 multi-probe 3/3 success passes majority-vote. Memory at 45.20% well below 85% investigate gate — SKIP deep-probe. A-21 RestartCount=1 (cumulative). A-32 disk 35% well below 85%. All cron jobs running successfully (get_cron_health confirms). No anomalies detected. Heartbeat refreshed (tier-1-last-healthy.json 2026-07-25T07:08:26Z).
