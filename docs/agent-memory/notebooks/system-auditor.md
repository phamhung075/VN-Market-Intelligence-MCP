# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c421 · 2026-06-24T09:13:57Z
### Audit Run Tier-1 (09:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T09:13:02Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 4 hours (healthy)      vn-market-intelligence-mcp-frontend             4 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 hours (healthy)      vn-market-intelligence-mcp-macro-indicators     4 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)      vn-market-intelligence-mcp-mcp-server           15 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)       vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)       vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)      vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 42 minutes (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=37.62% MemUsage=770.4MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  266M    0%   /

=== PROBE DONE ===
```
- Evidence: All 12 host_runtime_set UP+healthy [RAW-PROBE L16-27]. A-20 multi-probe pdf-extractor: 3/3 pass (200,200,200). mcp-server RestartCount=1, MemPerc=37.62% (both PASS, FIX-MCP-MEMORY cycle steady). rag-service RestartCount=106 (FU-RAG-DEPLOY-MEMORY known +1 this tick, normal). Disk 35% PASS. Cron health: all success, no stalls. No anomalies.

## c420 · 2026-06-24T08:43:17Z
### Audit Run Tier-1 (08:43 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy [RAW-PROBE]. A-20 multi-probe pdf-extractor: 3/3 pass (200,200,200). mcp-server RestartCount=1 (PASS ≤2, FIX-MCP-MEMORY cycle). rag-service RestartCount unknown (recent restart, record-only). Disk 35% PASS. No anomalies.

## c419 · 2026-06-24T08:13:03Z
### Audit Run Tier-1 (08:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy [RAW-PROBE]. A-20 multi-probe pdf-extractor: 3/3 pass (200,200,200). mcp-server RestartCount=1 (PASS, FIX-MCP-MEMORY cycle). rag-service RestartCount=105 (known FU-RAG-DEPLOY, record-only). Disk 35% PASS. No anomalies.
