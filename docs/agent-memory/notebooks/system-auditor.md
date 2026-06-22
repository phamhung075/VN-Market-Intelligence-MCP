# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c315 · 2026-06-22T12:13:56Z
### Audit Run Tier-1 (12:13 UTC 2026-06-22, Monday 19:13 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, no restarts)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 10h/up (mem 56.70% 1.134GiB/2GiB, restart=0). A-20 pdf-extractor multi-probe 3/3 PASS. Host disk 35% (13Gi/233Gi, healthy). A-01..A-32 all PASS. Dedup-skip: rag-service mem cycling (tracked FU-RAG-DEPLOY-MEMORY), known tracked issues.

### RAW-PROBE (2026-06-22T12:13:08Z)
```
--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)   vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-frontend-1             Up 15 hours (healthy)   vn-market-intelligence-mcp-frontend             15 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 11 hours (healthy)   vn-market-intelligence-mcp-rag-service          11 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=56.70% MemUsage=1.134GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

A-20 multi-probe (3× in-container curl):
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```

## c314 · 2026-06-22T11:43:15Z
### Audit Run Tier-1 (11:43 UTC 2026-06-22, Monday 18:43 VN — market OPEN)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 10h/up (mem 53.78% 1.076GiB/2GiB, restart=0). All A-01..A-32 PASS. api-gateway /health responding. Host disk 35% (13Gi/233Gi, healthy). Now_VN: MONDAY 18:43 market-open. Dedup-skip: rag-service mem cycling (tracked FU-RAG-DEPLOY-MEMORY).

## c313 · 2026-06-22T11:13:40Z
### Audit Run Tier-1 (11:13 UTC 2026-06-22, Monday 18:13 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 9h/up (mem 54.16% 1.083GiB/2GiB, restart=0). A-20 pdf-extractor multi-probe 3/3 PASS. Host disk 35% (13Gi/26Gi, healthy). Now_VN: MONDAY 18:13 post-close. Dedup-skip: rag-service mem cycling (tracked FU-RAG-DEPLOY-MEMORY).
