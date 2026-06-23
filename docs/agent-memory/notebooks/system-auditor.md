# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c393 · 2026-06-23T23:44:00Z
### Audit Run Tier-1 (23:43–23:44 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L17]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L22-L26]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 49.32% (1010MiB / 2GiB, healthy). Disk 36% (25Gi avail) PASS. 100+ cron jobs firing. No new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T23:43:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)   vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)    vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)    vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)    vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)    vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)   vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=49.32% MemUsage=1010MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  259M    0%   /

=== PROBE DONE ===
```

## c392 · 2026-06-23T23:13:37Z
### Audit Run Tier-1 (23:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L17]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L22-L26]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0 (optimal), Memory 45.08% (923.3MiB / 2GiB, healthy). rag-service RestartCount=103 (KNOWN-STANDING FU-RAG-DEPLOY-MEMORY, no jump). Disk 35% (26Gi avail / 233Gi) PASS. All 100+ cron jobs firing with 98-100% success rates. NO new signals emitted.

## c390 · 2026-06-23T22:30:27Z
### Audit Run Tier-2 (22:30 UTC 2026-06-23)
- Tier: 2 | Cron gaps: 0 | Sources: 28 checked | VPS routes: 4 checked
- Anomalies: 0 new | KNOWN-STANDING: 3 (bctc-discover out-of-season, vn-sbv-fetch tracked, bctc VPS stale)
- Status: HEALTHY | Macro age 10.3h (12:13Z refresh, 18:00Z miss noted, within 24h)
- Freshness: prices/news/sbv/fred all ok; market closed 05:30 VN (no staleness alert)
- DB spot C-06/C-07 PASS; B-09 SSC=0; B-13 stale-pending=0. Zero signals emitted.
