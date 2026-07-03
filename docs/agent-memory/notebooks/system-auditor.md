
## c529 · 2026-07-03T16:06:01Z
### Audit Run Tier-1 (16:05–16:06 UTC 2026-07-03)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=0 (mcp-server normal) | A-30: 48.76% memory (healthy) | A-32: 44% disk (PASS)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T16:05:36Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 11 hours (healthy)    vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)      74bfe1c5b392
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)      vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)      vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)      vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)      vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service
vn-market-intelligence-mcp-rag-service-1          Up 7 minutes (healthy)   vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)      vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)      vn-market-intelligence-mcp-alert-engine
headroom-proxy                                    Up 7 days                headroom-proxy:local
mcp-gateway                                       Up 7 days (healthy)      mcpservergatway-gateway

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=48.76% MemUsage=1.463GiB / 3GiB

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

## c528 · 2026-07-03T15:46:43Z
### Audit Run Tier-1 (15:46–15:47 UTC 2026-07-03 — post-outage recovery scan)
- Tier: 1 | Services: 13/13 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=0 (mcp-server normal) | A-30: 45.63% memory (healthy) | A-32: 44% disk (PASS)
- Crons: all healthy (>99% success) | System: 0 circuits open | Post-outage recovery: CLEAN
- Anomalies: 0 new | Status: HEALTHY
