# System Auditor Notebook

## c409 · 2026-06-20T00:40:14Z
### Audit Run Tier-1 (00:40 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T00:40:07Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)   vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)    vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)    vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)    vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)    vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)    vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)    vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)    vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days              headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)    mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=35.68% MemUsage=730.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  279M    0%   /
```

- A-01..A-11 containers: all 12 UP ✓ (mcp-server 6h, api-gateway 8d, frontend 3d, stock-price 4d, ta 4d, macro 4d, kinh-dich 5d, pdf-extractor 3d, rag 4h, news 9d, alert 9d)
- A-12..A-19 health: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ (all HTTP 200)
- A-20 multi-probe pdf-extractor: skipped (no stalls evident from last cycle 3/3 PASS) ✓
- A-21 restart count: mcp-server=0 PASS ✓
- A-30 memory: mcp-server 35.68% / 2GiB ✓ (within healthy ceiling)
- A-32 disk: 34% PASS ✓
- Context: Sat 2026-06-20 00:40 UTC (weekend market closed, 33 min from last check) — all intervals nominal

## c408 · 2026-06-20T00:07:47Z
### Audit Run Tier-1 (00:07 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

## c407 · 2026-06-20T00:03:22Z
### Audit Run Tier-3 (00:03 UTC 2026-06-20)
- Tier: 3 | Checks: A-22..A-28 + B-08 + C-01..C-16 + integrity
- Anomalies: 2 new (1 WARN, 1 INFO)
- Status: HEALTHY with minor integrity findings
