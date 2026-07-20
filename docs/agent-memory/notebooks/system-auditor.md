
## c431 · 2026-07-20T09:12:08Z
### Audit Run Tier-1 (09:10:57–09:12:08 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 findings (0 new + 2 dedup-skipped)
- A-01 to A-11 (container status): 12/12 UP (all healthy or marked unhealthy)
- A-12 to A-19 (health endpoints): 4/5 OK — api-gateway CURL_ERR (dedup) + pdf-extractor CURL_ERR (overridden by A-20)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (all 3 probes HTTP 000000, dedup: last=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=47.86% < 85% PASS (uptime ~3h, trend climbing 22.75%→40.31%→45.34%→47.86%)
- A-32 (disk): 37% < 85% PASS
- System status: all circuits OK, pdf-extractor event-loop stall ongoing (persistent)
- Anomalies: 0 new | 2 dedup-skipped (A-13, A-20) | Status: DEGRADED (pdf-extractor endpoint + event-loop)
- Signals appended: A-13 (SKIP-dedup id=sys-20260720T091152-1159), A-20 (SKIP-dedup id=sys-20260720T091146-4065)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-20T09:10:57Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)       mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)       vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)       vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)       vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)      vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)       vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)       vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 12 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)       vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)       vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=47.86% MemUsage=1.436GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    37%    393k  250M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c430 · 2026-07-20T08:42:18Z
### Audit Run Tier-1 (08:41:15–08:42:18 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 1 finding (0 new + 1 dedup-skipped)
- A-01 to A-11 (container status): 12/12 UP (all healthy or marked unhealthy)
- A-12 to A-19 (health endpoints): 4/5 OK — api-gateway recovered (was CURL_ERR) + pdf-extractor CURL_ERR (overridden by A-20)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (all 3 probes HTTP 000000, dedup: last=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=45.34% < 85% PASS (uptime ~3h, trend climbing but safe)
- A-32 (disk): 36% < 85% PASS
- System status: all circuits OK, pdf-extractor event-loop stall ongoing (persistent)
- Anomalies: 0 new | 1 dedup-skipped (A-20) | Status: DEGRADED (pdf-extractor endpoint + event-loop)
- Signals appended: A-20 (SKIP-dedup id=sys-20260720T084212-3955 dedup_key=microservice_degraded:pdf-extractor:A-20)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-20T08:41:15Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)       mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)       vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)       vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)       vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)      vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)       vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)       vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 12 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)       vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)       vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=45.34% MemUsage=1.36GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  261M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c429 · 2026-07-20T08:12:17Z
### Audit Run Tier-1 (08:12:17 UTC 2026-07-20–08:12:17 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 findings (0 new + 2 dedup-skipped)
- A-01 to A-11 (container status): 12/12 UP (pdf-extractor marked unhealthy but running)
- A-12 to A-19 (health endpoints): 4/5 OK — api-gateway CURL_ERR (dedup) + pdf-extractor CURL_ERR (overridden by A-20)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (all 3 probes returned HTTP 000000, dedup: last=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=40.31% < 85% PASS (uptime ~2h)
- A-32 (disk): 36% < 85% PASS
- System status: all circuits OK, pdf-extractor event-loop stall ongoing (persistent since 2026-07-19)
- Anomalies: 0 new | 2 dedup-skipped (A-13, A-20) | Status: DEGRADED (pdf-extractor endpoint + event-loop)
- Signals appended: A-13 (id=sys-20260720T081149-25bd dedup_key=microservice_degraded:api-gateway:A-13), A-20 (id=sys-20260720T081151-08aa dedup_key=microservice_degraded:pdf-extractor:A-20)
