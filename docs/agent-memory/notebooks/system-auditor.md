## c416 · 2026-07-20T02:10:30Z
### Audit Run Tier-1 (02:10:30–02:10:30 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 1 new findings
- A-01 to A-11 (container status): 12/12 UP, pdf-extractor UNHEALTHY (NEW)
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (NEW)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (dedup-skip: microservice_degraded:pdf-extractor:A-20)
- A-21 (restart count): mcp-server=0 PASS (5h+ uptime)
- A-30 (memory): mcp-server=40.77% < 85% PASS
- A-32 (disk): 35% < 85% PASS
- System status: 5h+ uptime, 1 half-open circuit (polymarket), all crons healthy
- Anomalies: 2 new (A-11 WARN, A-12 WARN) | 1 dedup-skipped (A-20) | Status: DEGRADED
- Signal output: [emit-signal] OK dedup_key=microservice_degraded:pdf-extractor:A-11 id=sys-20260720T021141-5dbd
- Signal output: [emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-20 id=sys-20260720T021148-2228

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-20T02:10:30Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)      mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)      vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)      vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)     vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 46 hours (healthy)    vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)      vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=40.77% MemUsage=1.223GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  263M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```


