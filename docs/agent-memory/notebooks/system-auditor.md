
## c393 · 2026-07-04T03:46:14Z
### Audit Run Tier-1 (03:45–03:46 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 76.05% < 85% PASS
- A-32 (disk): 44% < 85% PASS
- Cron health: 130+ jobs all ≥80% success (most 100%)
- Anomalies: 0 | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-04T03:45:30Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)      vn-market-intelligence-mcp-mcp-server           23 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)       74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)       vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)       vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 51 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)       vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)       vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 8 days                 headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 8 days (healthy)       mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=76.05% MemUsage=2.281GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%    393k  183M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c392 · 2026-07-04T03:16:19Z
### Audit Run Tier-1 (03:15–03:16 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 78.05% < 85% PASS
- A-32 (disk): 43% < 85% PASS
- Cron health: 130+ jobs all ≥80% success (most 100%)
- Anomalies: 0 | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-04T03:15:45Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)      vn-market-intelligence-mcp-mcp-server           23 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)       74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)       vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)       vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 21 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)       vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)       vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 8 days                 headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 8 days (healthy)       mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=78.05% MemUsage=2.341GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    18Gi    43%    393k  193M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c391 · 2026-07-04T02:45:13Z
### Audit Run Tier-1 (02:44–02:45 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 71.86% < 85% PASS
- A-32 (disk): 43% < 85% PASS
- Cron health: 130+ jobs all ≥80% success (most 100%)
- Anomalies: 0 | Status: HEALTHY

## c390 · 2026-07-04T02:32:35Z
### Audit Run Tier-2 (02:31–02:33 UTC 2026-07-04)
- Tier: 2 | Cron: 100+ jobs checked | Sources: 28 checked | VPS: 4 routes | DB: 3 spot checks
- A-29 (cron fire): PASS (all 100%+ success)
- B-01 to B-12 (source freshness): PASS (all within SLA, no stale sources)
- B-05 (BCTC staleness): HEALTHY IDLE (queue=36 items, push-age off-season expected)
- B-06/B-07 (VPS proxy): 4/4 routes OK — prices, news, sbv active; bctc off-season
- B-09 (BCTC SSC URLs): 0 (PASS)
- B-12 (rate limits): 0% (PASS)
- B-13 (stale pending): 0 rows >72h (PASS)
- C-06 (market msgs 3h): 0 (off-hours expected)
- C-07 (signals 24h): 155 PASS
- C-09 (macro indicators): 3/3 PASS
- Anomalies: 0 | Status: HEALTHY

## c389 · 2026-07-04T01:26:29Z
### Audit Run Tier-1 (01:25–01:26 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 63.58% < 85% PASS
- A-32 (disk): 44% < 85% PASS
- Cron health: 100+ jobs all ≥80% success
- Anomalies: 0 | Status: HEALTHY
