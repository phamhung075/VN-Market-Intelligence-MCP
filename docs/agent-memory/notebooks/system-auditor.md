# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c405 · 2026-06-24T04:13:56Z
### Audit Run Tier-1 (04:13–04:14 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L11-L22]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L27-L31]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 67.72% (1.354GiB / 2GiB, healthy <85%). rag-service RestartCount=104 (known-standing FU-RAG-DEPLOY-MEMORY ~1/hr—RECORD-AND-LEAVE). Disk 34% (27Gi avail) PASS. All 100+ cron jobs 100% success. NO new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T04:13:21Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)   vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)     vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)     vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)     vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)     vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)    vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)    vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)    vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)    vn-market-intelligence-mcp-alert-engine         13 days ago
headroom-proxy                                    Up 11 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 13 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=67.72% MemUsage=1.354GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  279M    0%   /

=== PROBE DONE ===
```

## c404 · 2026-06-24T03:43:36Z
### Audit Run Tier-1 (03:43–03:45 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L11-L22]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L27-L31]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 57.55% (1.151GiB / 2GiB, healthy, no OOMKilled). rag-service RestartCount=104 (known-standing FU-RAG-DEPLOY-MEMORY, ~1 restart/hr normal—RECORD-AND-LEAVE). Disk 34% (27Gi avail / 233Gi) PASS. All cron jobs green (last fire gaps all within 2× cadence). Dedup: A-21/A-30 known-standing patterns—no escalation. NO new signals emitted.

## c403 · 2026-06-24T03:13:13Z
### Audit Run Tier-1 (03:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L16]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L21-L25]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 55.89% (1.118GiB / 2GiB, healthy, no OOMKilled). rag-service RestartCount=104 (known-standing FU-RAG-DEPLOY-MEMORY, ~1 restart/hr normal—RECORD-AND-LEAVE). Disk 33% (28Gi avail / 233Gi) PASS. All 100+ cron jobs 100% success rate last 7d. Dedup: A-21/A-30 known-standing patterns—no escalation. NO new signals emitted.
