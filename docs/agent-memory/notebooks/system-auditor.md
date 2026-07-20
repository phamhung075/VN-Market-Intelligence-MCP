## c423 · 2026-07-20T05:42:13Z
### Audit Run Tier-1 (05:40:46–05:42:13 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 findings (0 new + 2 dedup-skipped)
- A-01 to A-11 (container status): 11/12 UP, pdf-extractor UNHEALTHY (dedup: microservice_degraded:pdf-extractor:A-11 last=2026-07-20T02:11:41Z)
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (dedup)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (dedup: microservice_degraded:pdf-extractor:A-20 last=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=0 PASS (9h+ uptime)
- A-30 (memory): mcp-server=78.14% < 85% PASS
- A-32 (disk): 35% < 85% PASS
- System status: 9h+ uptime, crons healthy
- Anomalies: 0 new | 2 dedup-skipped (A-11, A-20) | Status: DEGRADED (ongoing pdf-extractor event loop stall)
- Signals emitted: A-11 (SKIP-dedup id=sys-20260720T054158-2b57), A-20 (SKIP-dedup id=sys-20260720T054204-28c5)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-20T05:40:46Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)      mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)      vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)      vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)     vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)      vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)      vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 9 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)      vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)      vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)      vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=78.14% MemUsage=2.344GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  262M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```


## c422 · 2026-07-20T05:11:59Z
### Audit Run Tier-1 (05:10:47–05:11:59 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 findings (0 new + 2 dedup-skipped)
- A-01 to A-11 (container status): 12/12 UP, pdf-extractor UNHEALTHY (dedup: microservice_degraded:pdf-extractor:A-11 last=2026-07-20T02:11:41Z)
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (dedup)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (dedup: microservice_degraded:pdf-extractor:A-20 last=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=0 PASS (9h+ uptime)
- A-30 (memory): mcp-server=63.56% < 85% PASS
- A-32 (disk): 35% < 85% PASS
- System status: 9h+ uptime, 1 half-open circuit (polymarket 17 failures, increasing from 16), crons healthy
- Anomalies: 0 new | 2 dedup-skipped (A-11, A-20) | Status: DEGRADED (ongoing pdf-extractor event loop stall)
- Signals emitted: A-11 (SKIP-dedup id=sys-20260720T051146-57b1), A-20 (SKIP-dedup id=sys-20260720T051156-789e)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-20T05:10:47Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)      mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)      vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)      vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)     vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)      vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)      vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)      vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)      vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)      vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=63.56% MemUsage=1.907GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  262M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c421 · 2026-07-20T04:40:51Z
### Audit Run Tier-1 (04:40:51–04:40:51 UTC 2026-07-20)
- Tier: 1 | Services: 13 checked | Health: 5 probed | 2 findings (0 new + 2 dedup-skipped)
- A-01 to A-11 (container status): 12/13 UP, pdf-extractor UNHEALTHY (dedup: microservice_degraded:pdf-extractor:A-11 last=2026-07-20T02:11:41Z)
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (dedup)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (dedup: microservice_degraded:pdf-extractor:A-20 last=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=0 PASS (8h+ uptime)
- A-30 (memory): mcp-server=58.72% < 85% PASS
- A-32 (disk): 35% < 85% PASS
- System status: 8h+ uptime, 1 half-open circuit (polymarket 16 failures), crons healthy
- Anomalies: 0 new | 2 dedup-skipped (A-11, A-20) | Status: DEGRADED (ongoing pdf-extractor event loop stall)
- Signals emitted: A-11 (SKIP-dedup id=sys-20260720T044149-0fc4), A-20 (SKIP-dedup id=sys-20260720T044154-10bf)
