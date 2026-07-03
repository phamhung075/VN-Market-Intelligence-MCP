## c210 · 2026-07-03T20:45:18Z
### Audit Run Tier-1 (20:44–20:45 UTC 2026-07-03)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=1 (normal) | A-30: 33.81% memory (healthy) | A-32: 45% disk (PASS)
- Cron health: 100+ jobs, all green
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T20:44:37Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server           16 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)          74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)          vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)          vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)          vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)          vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 26 minutes (healthy)      vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)          vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)          vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 7 days                    headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 7 days (healthy)          mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=33.81% MemUsage=1.014GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    45%    393k  179M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c209 · 2026-07-03T20:23:29Z
### Audit Run Tier-1 (20:22–20:23 UTC 2026-07-03)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=1 (normal) | A-30: 31.92% memory (healthy) | A-32: 44% disk (PASS)
- Cron health: 100+ jobs, all green
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T20:22:41Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 40 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           16 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)       74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)       vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)       vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)       vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 4 minutes (healthy)    vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)       vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)       vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 7 days                 headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 7 days (healthy)       mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=31.92% MemUsage=980.7MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%    393k  179M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c537 · 2026-07-03T19:47:25Z
### Audit Run Tier-1 (19:47–19:48 UTC 2026-07-03)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=1 (normal) | A-30: 25.70% memory (healthy) | A-32: 44% disk (PASS)
- Anomalies: 0 new | Status: HEALTHY
