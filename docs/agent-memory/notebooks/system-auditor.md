

## c294 · 2026-06-12T20:40:46Z
### Audit Run Tier-1 (20:40 UTC 2026-06-12 → Thursday evening)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (3h), api-gateway (36h), frontend (5h), macro-indicators (47h), mcp-gateway (47h), pdf-extractor (29h), stock-price (47h), technical-analysis (47h), kinh-dich-service (39h), alert-engine (47h), rag-service (22m), news-fetch (46h) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=16.12% < 85% ✓
- A-32 disk: 44% < 85% ✓
- Cron health: 68 jobs checked, 1 crash (vnstockFundamentalsRefresh 2026-06-08 01:00) but 67 other jobs at 100% success rate ✓
- Circuit breakers: 16/16 OK ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-12T20:39:44Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)      vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 5 hours (healthy)      vn-market-intelligence-mcp-frontend             5 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 36 hours (healthy)     vn-market-intelligence-mcp-api-gateway          36 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 39 hours (healthy)     vn-market-intelligence-mcp-kinh-dich-service    39 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 22 minutes (healthy)   vn-market-intelligence-mcp-rag-service          46 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 46 hours (healthy)     vn-market-intelligence-mcp-news-fetch           46 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 47 hours (healthy)     vn-market-intelligence-mcp-stock-price          47 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 47 hours (healthy)     vn-market-intelligence-mcp-alert-engine         47 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 47 hours (healthy)     vn-market-intelligence-mcp-technical-analysis   47 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 29 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 47 hours (healthy)     vn-market-intelligence-mcp-macro-indicators     4 days ago
headroom-proxy                                    Up 47 hours               headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 47 hours (healthy)     mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.12% MemUsage=330.2MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%    393k  183M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe Results:
- [A-20-PROBE-1] in-container HTTP 200 ✓
- [A-20-PROBE-2] in-container HTTP 200 ✓
- [A-20-PROBE-3] in-container HTTP 200 ✓
- Pass count: 3/3 → PASS

## c293 · 2026-06-12T20:09:30Z
### Audit Run Tier-1 (20:09 UTC 2026-06-12 → Thursday evening)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (2h), api-gateway (36h), frontend (5h), macro-indicators (46h), mcp-gateway (46h), pdf-extractor (28h), stock-price (46h), technical-analysis (46h), kinh-dich-service (38h), alert-engine (46h), rag-service (32m), news-fetch (46h) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=21.29% < 85% ✓
- A-32 disk: 43% < 85% ✓
- Cron health: 68 jobs checked, 1 crash (vnstockFundamentalsRefresh 2026-06-08 01:00) but 67 other jobs at 100% success rate ✓
- Circuit breakers: 16/16 OK ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-12T20:09:45Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)      vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 5 hours (healthy)      vn-market-intelligence-mcp-frontend             5 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 36 hours (healthy)     vn-market-intelligence-mcp-api-gateway          36 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 38 hours (healthy)     vn-market-intelligence-mcp-kinh-dich-service    38 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 32 minutes (healthy)   vn-market-intelligence-mcp-rag-service          46 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 46 hours (healthy)     vn-market-intelligence-mcp-news-fetch           46 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 46 hours (healthy)     vn-market-intelligence-mcp-stock-price          47 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 46 hours (healthy)     vn-market-intelligence-mcp-alert-engine         47 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 46 hours (healthy)     vn-market-intelligence-mcp-technical-analysis   47 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 28 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 46 hours (healthy)     vn-market-intelligence-mcp-macro-indicators     4 days ago
headroom-proxy                                    Up 46 hours               headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 46 hours (healthy)     mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.29% MemUsage=436MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    18Gi    43%    393k  194M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe Results:
- [A-20-PROBE-1] in-container HTTP 200 ✓
- [A-20-PROBE-2] in-container HTTP 200 ✓
- [A-20-PROBE-3] in-container HTTP 200 ✓
- Pass count: 3/3 → PASS

## c292 · 2026-06-12T19:40:27Z
### Audit Run Tier-1 (19:40 UTC 2026-06-12 → Thursday evening)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY

## c291 · 2026-06-09T05:06:15Z
### Audit Run Tier-1 (05:06 UTC 2026-06-09 → Tuesday morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 1 new (A-30 WARN memory escalation, higher than 04:05 reading) | Dedup: 0 skipped
- Status: DEGRADED
