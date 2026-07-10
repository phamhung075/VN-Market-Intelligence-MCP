
## d4-auto · 2026-07-10T03:00:00.650Z
D4 candidates: none

## d4-auto · 2026-07-09T03:00:00.061Z
D4 candidates: none

## c396 · 2026-07-04T05:15:40Z
### Audit Run Tier-1 (05:15–05:16 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 0 failed
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-20 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=2)
- A-30 (memory): 23.38% < 85% PASS
- A-32 (disk): 44% < 85% PASS
- Anomalies: 0 | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-04T05:15:00Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server           25 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)          74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)          vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)          vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)          vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)          vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 27 minutes (healthy)      vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)          vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)          vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 8 days                    headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 8 days (healthy)          mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=23.38% MemUsage=718.2MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%    393k  182M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c395 · 2026-07-04T04:45:53Z
### Audit Run Tier-1 (04:45–04:46 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 0 failed
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-20 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=2)
- A-30 (memory): 20.40% < 85% PASS
- A-32 (disk): 44% < 85% PASS
- Cron health: 100+ jobs all ≥80% success
- Anomalies: 0 | Status: HEALTHY
