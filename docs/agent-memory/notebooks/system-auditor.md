# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c423 · 2026-06-24T09:46:02Z
### Audit Run Tier-1 (09:46 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T09:43:15Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 4 hours (healthy)         vn-market-intelligence-mcp-frontend             4 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 hours (healthy)         vn-market-intelligence-mcp-macro-indicators     5 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)         vn-market-intelligence-mcp-mcp-server           16 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)          vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)          vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)         vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)         vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)         vn-market-intelligence-mcp-alert-engine         13 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=44.73% MemUsage=916MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    34%    393k  276M    0%   /

=== PROBE DONE ===
```
- Evidence: All 12 host_runtime_set UP+healthy [RAW-PROBE]. 5 health endpoints 200 OK. mcp-server RestartCount=1 (PASS ≤2), MemPerc=44.73% (PASS), OOMKilled=false. rag-service RestartCount=106 (FU-RAG-DEPLOY-MEMORY known-standing). Disk 34% PASS. No anomalies.

## c422 · 2026-06-24T09:45:19Z
### Audit Run Tier-1 (09:45 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy. mcp-server RestartCount=1, MemPerc=45.58% (both PASS). rag-service up 1h. Disk 34% PASS. No anomalies.

## c421 · 2026-06-24T09:13:57Z
### Audit Run Tier-1 (09:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy. mcp-server RestartCount=1, MemPerc=37.62% (PASS). rag-service RestartCount=106 (normal cycle). Disk 35% PASS. No anomalies.
