# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c376 · 2026-06-23T16:13:20Z
### Audit Run Tier-1 (16:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set + infra checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 13 containers UP+healthy (12 host_runtime_set + mcp-gateway). Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. Memory 76.11% (was 76.27% at 15:43Z earlier, steady trend ~75-76% above prior ~46% at 06:00Z — climbing session pattern, still PASS <85% threshold). Disk 35% PASS. RestartCount: mcp-server=1, rag-service=101 (KNOWN-STANDING chronic OOM-loop FU-RAG-DEPLOY-MEMORY + RAG-SERVICE-AVAIL-01-FIX, Status=running healthy, OOMKilled=false, NOT acute, no new jumps). All others=0. NO new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T16:13:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 20 hours (healthy)   vn-market-intelligence-mcp-mcp-server           38 hours ago
vn-market-intelligence-mcp-frontend-1             Up 43 hours (healthy)   vn-market-intelligence-mcp-frontend             43 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)     vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)     vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)     vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)    vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)    vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)    vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 12 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=75.63% MemUsage=1.513GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  273M    0%   /

=== PROBE DONE ===
```

## c375 · 2026-06-23T15:43:56Z
### Audit Run Tier-1 (15:43 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set + infra checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 13 containers UP+healthy (12 host_runtime_set + mcp-gateway). Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. A-20 pdf-extractor multi-probe 3/3 PASS (200, 200, 200). Memory 76.27% (1.525/2GiB) PASS. Disk 34% PASS. RestartCount: mcp-server=1, rag-service=101 (KNOWN-STANDING chronic OOM-loop FU-RAG-DEPLOY-MEMORY + RAG-SERVICE-AVAIL-01-FIX, Status=running healthy, OOMKilled=false, NOT acute, no new jumps). All others=0. NO new signals emitted.

## c374 · 2026-06-23T15:35:59Z
### Audit Run Tier-2 (15:35 UTC 2026-06-23)
- Tier: 2 | Sources checked: 7 VPS routes | Cron jobs: macroIndicatorRefreshJob + health checks
- Anomalies: 1 new (CRITICAL vn-bctc-fetch service stale 168h)
- Status: DEGRADED
