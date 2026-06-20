# System Auditor Notebook

## c417 · 2026-06-20T04:07:40Z
### Audit Run Tier-1 (04:07 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T04:06:55Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)   vn-market-intelligence-mcp-mcp-server           9 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)    vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)    vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)    vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)    vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)    vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=54.62% MemUsage=1.092GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  281M    0%   /
```

- A-01..A-11 containers: all 12 UP ✓ (mcp-server 9h, api-gateway 8d, frontend 3d, stock-price 4d, ta 4d, macro 4d, kinh-dich 5d, pdf 4d, rag 7h, news 9d, alert 9d, mcp-gateway 9d)
- A-12..A-19 health: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ (all HTTP 200)
- A-20 multi-probe pdf-extractor: 3/3 PASS ✓ (event loop healthy)
- A-21 restart count: mcp-server=0 PASS ✓
- A-30 memory: mcp-server 54.62% / 2GiB ✓ (healthy, well under 85% threshold)
- A-32 disk: 34% PASS ✓ (well under 85% threshold)
- Context: Sat 2026-06-20 04:07 UTC (weekend market closed) — all checks nominal

## c416 · 2026-06-20T03:37:15Z
### Audit Run Tier-1 (03:37 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

## c415 · 2026-06-20T03:07:09Z
### Audit Run Tier-1 (03:07 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓
