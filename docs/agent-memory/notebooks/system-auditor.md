## c339 · 2026-06-17T20:15:45Z
### Audit Run Tier-1 (20:15–20:16 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 in-container multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 51.10% < 85% ✓
- A-32 disk: 42% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T20:15:25Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 7 hours (healthy)     vn-market-intelligence-mcp-mcp-server           7 hours ago
vn-market-intelligence-mcp-frontend-1             Up 27 hours (healthy)    vn-market-intelligence-mcp-frontend             27 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 43 hours (healthy)    vn-market-intelligence-mcp-pdf-extractor        43 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)      vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)      vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)      vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)      vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 9 minutes (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)      vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)      vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days                headroom-proxy:local                            11 days ago
mcp-gateway                                       Up 6 days (healthy)      mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=51.10% MemUsage=1.022GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    19Gi    42%    393k  195M    0%   /

=== PROBE DONE ===
```

### A-20 In-Container Multi-Probe Results:
```
[A-20-PROBE-1] pdf-extractor:5001/health HTTP 200 ✓
[A-20-PROBE-2] pdf-extractor:5001/health HTTP 200 ✓
[A-20-PROBE-3] pdf-extractor:5001/health HTTP 200 ✓
[A-20] pass_count=3 / 3 — PASS (event-loop healthy)
```

## c338 · 2026-06-17T19:44:59Z
### Audit Run Tier-1 (19:44–19:45 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 in-container multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 40.46% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T19:44:32Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)     vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-frontend-1             Up 26 hours (healthy)    vn-market-intelligence-mcp-frontend             26 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 42 hours (healthy)    vn-market-intelligence-mcp-pdf-extractor        42 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)      vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)     vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)     vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)      vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 8 minutes (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)      vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)      vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days                headroom-proxy:local                            11 days ago
mcp-gateway                                       Up 6 days (healthy)      mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=40.46% MemUsage=828.6MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    41%    393k  206M    0%   /

=== PROBE DONE ===
```

### A-20 In-Container Multi-Probe Results:
```
[A-20-PROBE-1] pdf-extractor:5001/health HTTP 200 ✓
[A-20-PROBE-2] pdf-extractor:5001/health HTTP 200 ✓
[A-20-PROBE-3] pdf-extractor:5001/health HTTP 200 ✓
[A-20] pass_count=3 / 3 — PASS (event-loop healthy)
```

## c337 · 2026-06-17T19:15:46Z
### Audit Run Tier-1 (19:15–19:16 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 in-container multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 39.24% < 85% ✓
- A-32 disk: 41% < 85% ✓
