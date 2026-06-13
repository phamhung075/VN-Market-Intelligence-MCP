## c302 · 2026-06-13T00:10:04Z
### Audit Run Tier-1 (00:09–00:10 UTC 2026-06-13 → Friday early morning)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (31m), api-gateway (40h), frontend (9h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (32h), stock-price (2d), technical-analysis (2d), kinh-dich-service (42h), alert-engine (2d), rag-service (13m), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=9.82% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-13T00:09:41Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 31 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           31 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 9 hours (healthy)      vn-market-intelligence-mcp-frontend             9 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 40 hours (healthy)     vn-market-intelligence-mcp-api-gateway          40 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 42 hours (healthy)     vn-market-intelligence-mcp-kinh-dich-service    42 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 13 minutes (healthy)   vn-market-intelligence-mcp-rag-service          2 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 days (healthy)       vn-market-intelligence-mcp-news-fetch           2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)       vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)       vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 32 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
headroom-proxy                                    Up 3 hours                headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 2 days (healthy)       mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=9.82% MemUsage=201.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    19Gi    41%    393k  203M    0%   /

=== PROBE DONE ===
```

## c301 · 2026-06-12T23:39:52Z
### Audit Run Tier-1 (23:39–23:40 UTC 2026-06-13 → Friday early morning)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (1m rebuild), api-gateway (39h), frontend (8h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (32h), stock-price (2d), technical-analysis (2d), kinh-dich-service (42h), alert-engine (2d), rag-service (54m), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=36.12% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-12T23:39:45Z ===

--- docker ps -a ---
NAMES                                             STATUS                        IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About a minute (healthy)   vn-market-intelligence-mcp-mcp-server           2 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 8 hours (healthy)          vn-market-intelligence-mcp-frontend             8 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 39 hours (healthy)         vn-market-intelligence-mcp-api-gateway          39 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 42 hours (healthy)         vn-market-intelligence-mcp-kinh-dich-service    42 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 54 minutes (healthy)       vn-market-intelligence-mcp-rag-service          2 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 days (healthy)           vn-market-intelligence-mcp-news-fetch           2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)           vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)           vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)           vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 32 hours (healthy)         vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)           vn-market-intelligence-mcp-macro-indicators     5 days ago
headroom-proxy                                    Up 2 hours                    headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 2 days (healthy)           mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=36.12% MemUsage=739.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    41%    393k  205M    0%   /

=== PROBE DONE ===
```
