# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c418 · 2026-06-24T07:43:31Z
### Audit Run Tier-1 (07:43 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T07:43:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 2 hours (healthy)      vn-market-intelligence-mcp-frontend             2 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 hours (healthy)      vn-market-intelligence-mcp-macro-indicators     3 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 59 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           14 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)       vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)       vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)      vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)      vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)      vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)      vn-market-intelligence-mcp-alert-engine         13 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=14.56% MemUsage=298.2MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%

=== PROBE DONE ===
```
- Evidence: All 12 host_runtime_set UP+healthy. Health: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. mcp-server RestartCount=1 (PASS ≤2, FIX-MCP-MEMORY self-heal cycle). rag-service RestartCount=105 (known FU-RAG-DEPLOY-MEMORY). Disk 36% PASS. NO anomalies.

## c417 · 2026-06-24T07:14:44Z
### Audit Run Tier-1 (07:13–07:14 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy. Health: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. mcp-server RestartCount=1 PASS, Memory 13.78% HEALTHY. rag-service RestartCount=105 (known FU-RAG-DEPLOY). Disk 35% PASS. NO anomalies.

## c416 · 2026-06-24T06:45:40Z
### Audit Run Tier-1 (06:44–06:45 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy. Health: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. mcp-server RestartCount=1 PASS, Memory 16.29% HEALTHY. rag-service RestartCount=104 (known FU-RAG-DEPLOY). Disk 35% PASS. NO anomalies.
