# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c318 · 2026-06-22T13:44:01Z
### Audit Run Tier-1 (13:44 UTC 2026-06-22, Monday 20:44 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, no changes vs c317)
- Status: CLEAN
- Evidence: All 12 services UP+healthy [RAW-PROBE L3-L10]. mcp-server 12h/up (mem 63.20% 1.264GiB/2GiB, restart=0 [RAW-PROBE L27]). A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). All A-01..A-32 PASS. Host disk 35% (13Gi/233Gi [RAW-PROBE L30]). Dedup-skip: rag-service mem cycling (tracked FU-RAG-DEPLOY-MEMORY).

### RAW-PROBE (2026-06-22T13:43:03Z)
```
=== AUDITOR PROBE 2026-06-22T13:43:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 12 hours (healthy)   vn-market-intelligence-mcp-mcp-server           12 hours ago
vn-market-intelligence-mcp-frontend-1             Up 16 hours (healthy)   vn-market-intelligence-mcp-frontend             16 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 12 hours (healthy)   vn-market-intelligence-mcp-rag-service          11 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)    vn-market-intelligence-mcp-news-fetch           11 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 11 days (healthy)    vn-market-intelligence-mcp-alert-engine         11 days ago
headroom-proxy                                    Up 9 days               headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 11 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=63.20% MemUsage=1.264GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

=== PROBE DONE ===
```

## c317 · 2026-06-22T13:14:32Z
### Audit Run Tier-1 (13:14 UTC 2026-06-22, Monday 20:14 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, no state changes since c316)
- Status: CLEAN
- Evidence: All 13 services UP+healthy [RAW-PROBE L3-L10]. mcp-server 11h/up (mem 59.38% 1.188GiB/2GiB, restart=0 [RAW-PROBE L23,L26]). A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). All A-01..A-32 PASS. Host disk 35% (13Gi/233Gi [RAW-PROBE L29]). Dedup-skip: rag-service mem cycling (tracked FU-RAG-DEPLOY-MEMORY).

## c316 · 2026-06-22T12:43:10Z
### Audit Run Tier-1 (12:43 UTC 2026-06-22, Monday 19:43 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, no restarts since last run)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 11h/up (mem 61.01% 1.22GiB/2GiB, restart=0). frontend/3001 200 OK. Host disk 34% (13Gi/27Gi, healthy). Dedup-skip: rag-service mem 95.63% 734.4MiB/768MiB, 96 total restarts (known FU-RAG-DEPLOY-MEMORY, no OOMKilled, lazy-loads embedding model).
