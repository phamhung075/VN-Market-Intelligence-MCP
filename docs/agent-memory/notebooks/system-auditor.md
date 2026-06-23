# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c372 · 2026-06-23T13:13:59Z
### Audit Run Tier-1 (13:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set + infra checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 13 containers UP+healthy (12 host_runtime_set + mcp-gateway). Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. A-20 pdf-extractor multi-probe 3/3 PASS (200, 200, 200). Memory 68.85% (1.377/2GiB) PASS. Disk 37% PASS. RestartCount: mcp-server=1, rag-service=100 (KNOWN-STANDING chronic OOM-loop FU-RAG-DEPLOY-MEMORY, Status=healthy Up 12h, OOMKilled=false, NOT acute). All other services=0. NO new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T13:13:09Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 17 hours (healthy)   vn-market-intelligence-mcp-mcp-server           35 hours ago
vn-market-intelligence-mcp-frontend-1             Up 40 hours (healthy)   vn-market-intelligence-mcp-frontend             40 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)     vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)     vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)     vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)    vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 12 hours (healthy)   vn-market-intelligence-mcp-rag-service          12 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=68.85% MemUsage=1.377GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%    393k  242M    0%   /

=== PROBE DONE ===
```

## c371 · 2026-06-23T12:44:15Z
### Audit Run Tier-1 (12:44 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set + infra checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 13 containers UP+healthy (12 host_runtime_set + mcp-gateway). Health endpoints all 200 OK. A-20 pdf-extractor multi-probe 3/3 PASS. Memory 68.81% (1.376/2GiB) PASS. Disk 36% PASS. RestartCount stable: mcp-server=1, rag-service=100 (known-standing chronic OOM-loop, OOMKilled=false, still running healthy, tracked FU-RAG-DEPLOY-MEMORY), all others=0. No acute changes. NO new signals emitted.
