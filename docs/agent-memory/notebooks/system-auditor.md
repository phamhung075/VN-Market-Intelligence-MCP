## c325 · 2026-06-17T14:17:07Z
### Audit Run Tier-1 (14:16–14:17 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 14.95% < 85% ✓
- A-32 disk: 43% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T14:16:58Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 54 minutes (healthy)      vn-market-intelligence-mcp-mcp-server           54 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 21 hours (healthy)        vn-market-intelligence-mcp-frontend             21 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 37 hours (healthy)        vn-market-intelligence-mcp-pdf-extractor        37 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)          vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)          vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)          vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)          vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)          vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)          vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days                    headroom-proxy:local                            10 days ago
mcp-gateway                                       Up 6 days (healthy)          mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=14.95% MemUsage=306.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    18Gi    43%    393k  191M    0%   /

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
Pass count: 3/3 (no event-loop stall)
```

## c324 · 2026-06-17T13:47:56Z
### Audit Run Tier-1 (13:47–13:48 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 8.98% < 85% ✓
- A-32 disk: 42% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T13:47:56Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 25 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           25 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 20 hours (healthy)     vn-market-intelligence-mcp-frontend             20 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 37 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        37 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)       vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)       vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 50 minutes (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)       vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)       vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days                 headroom-proxy:local                            10 days ago
mcp-gateway                                       Up 6 days (healthy)       mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=8.98% MemUsage=183.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    19Gi    42%    393k  202M    0%   /

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
Pass count: 3/3 (no event-loop stall)
```

## c323 · 2026-06-17T13:18:06Z
### Audit Run Tier-1 (13:17–13:18 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 21.21% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T13:17:25Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-frontend-1             Up 20 hours (healthy)        vn-market-intelligence-mcp-frontend             20 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 36 hours (healthy)        vn-market-intelligence-mcp-pdf-extractor        36 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)          vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)          vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)          vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)          vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 19 minutes (healthy)      vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)          vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)          vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days                    headroom-proxy:local                            10 days ago
mcp-gateway                                       Up 6 days (healthy)          mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.21% MemUsage=434.4MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    41%    393k  211M    0%   /

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
Pass count: 3/3 (no event-loop stall)
```
