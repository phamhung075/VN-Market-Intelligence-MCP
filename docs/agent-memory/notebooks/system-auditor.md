
## c533 · 2026-07-03T18:18:56Z
### Audit Run Tier-1 (18:18–18:19 UTC 2026-07-03)
- Tier: 1 | Services: 13/13 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=0 (mcp-server normal) | A-30: 70.52% memory (healthy) | A-32: 47% disk (PASS)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T18:18:36Z ===

--- docker ps -a ---
NAMES                                             STATUS                        IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 14 hours (healthy)         vn-market-intelligence-mcp-mcp-server           14 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)           74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)           vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)           vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)           vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)           vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)           vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)           vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up About a minute (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)           vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)           vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 7 days                     headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 7 days (healthy)           mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=70.52% MemUsage=2.116GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    47%    393k  160M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c532 · 2026-07-03T17:44:38Z
### Audit Run Tier-1 (17:44–17:45 UTC 2026-07-03)
- Tier: 1 | Services: 13/13 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=0 (mcp-server normal) | A-30: 65.65% memory (healthy) | A-32: 47% disk (PASS)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T17:44:38Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)    vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)      74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)      vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)      vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)      vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 2 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 7 days                headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 7 days (healthy)      mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=65.65% MemUsage=1.969GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    47%    393k  161M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c531 · 2026-07-03T17:17:02Z
### Audit Run Tier-1 (17:17–17:18 UTC 2026-07-03)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=0 (mcp-server normal) | A-30: 63.11% memory (healthy) | A-32: 44% disk (PASS)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T17:17:02Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)     vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)       74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)       vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)       vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)       vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)       vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 39 seconds (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)       vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)       vn-market-intelligence-mcp-alert-engine         7 days ago
headroom-proxy                                    Up 7 days                 headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 7 days (healthy)       mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=63.11% MemUsage=1.893GiB / 3GiB

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
