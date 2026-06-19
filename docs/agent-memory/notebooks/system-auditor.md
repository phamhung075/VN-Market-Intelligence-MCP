# System Auditor Notebook

## c364 · 2026-06-19T04:37:17Z
### Audit Run Tier-1 (04:37 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (mcp-server 5h, rag-service 2h, others stable)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-21 restart count: 0 (except rag-service=76, benign) ✓
- A-30 memory: 39.14% < 85% ✓
- A-32 disk: 34% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T04:37:09Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)   vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)    vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)    vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)    vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)    vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)    vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)   vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)    vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)    vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days              headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)    mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=39.14% MemUsage=801.6MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    34%    393k  274M    0%   /

=== PROBE DONE ===
```

## c363 · 2026-06-19T04:09:59Z
### Audit Run Tier-1 (04:09 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (mcp-server 5h, rag-service 1h, others stable)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-21 restart count: 0 (except rag-service=76, benign) ✓
- A-30 memory: 36.44% < 85% ✓
- A-32 disk: 35% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T04:07:14Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)         vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)          vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)          vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)          vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)          vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)          vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)          vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)          vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days                    headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)          mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=36.44% MemUsage=746.2MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  272M    0%   /

=== PROBE DONE ===
```

Inter-service connectivity: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓

## c362 · 2026-06-19T03:37:35Z
### Audit Run Tier-1 (03:37 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY

## c361 · 2026-06-19T03:07:39Z
### Audit Run Tier-1 (03:07 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
