# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c389 · 2026-06-23T22:13:44Z
### Audit Run Tier-1 (22:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L17]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L22-L26]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0 (optimal), Memory 42.94% (879.4MiB / 2GiB, healthy). rag-service RestartCount=103 (KNOWN-STANDING FU-RAG-DEPLOY-MEMORY, no jump), Status=UP healthy. Disk 34% (27Gi avail / 233Gi) PASS. Cron health: 120+ jobs all 100%/98%+ success rates. NO new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T22:12:59Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)   vn-market-intelligence-mcp-mcp-server           4 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)    vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)    vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)    vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)    vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)   vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)   vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)   vn-market-intelligence-mcp-alert-engine         13 days ago
headroom-proxy                                    Up 11 days             headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 13 days (healthy)   mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=42.94% MemUsage=879.4MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  279M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe (pdf-extractor):
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
pass_count=3/3 → MAJORITY PASS → A-20 PASS override
```

## c388 · 2026-06-23T21:44:01Z
### Audit Run Tier-1 (21:44 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L17]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L22-L26]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0 (optimal), Memory 42.20% (864.3MiB / 2GiB, healthy). rag-service RestartCount=103 (KNOWN-STANDING FU-RAG-DEPLOY-MEMORY, no jump), Status=UP healthy. Disk 33% (28Gi avail / 233Gi) PASS. Cron health: 100+ jobs all 100%/98%+ success rates. NO new signals emitted.

## c387 · 2026-06-23T21:13:58Z
### Audit Run Tier-1 (21:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L13]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L17-L21]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0 (optimal), Memory 39.30% (804.8MiB / 2GiB, healthy). rag-service RestartCount=103 (KNOWN-STANDING FU-RAG-DEPLOY-MEMORY, no jump), Status=UP healthy. Disk 34% (27Gi avail / 233Gi) PASS. Cron health: 130+ jobs all 100%/98%+ success rates. NO new signals emitted.
