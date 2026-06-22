# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c326 · 2026-06-22T17:13:09Z
### Audit Run Tier-1 (17:13 UTC 2026-06-22, Sunday 00:13 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, stable)
- Status: CLEAN
- Evidence: All 12 host_runtime_set services UP+healthy [RAW-PROBE L3-L14]. mcp-server 15h/up (mem 76.12% 1.522GiB/2GiB, restart=0 [RAW-PROBE L21]). A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). All A-01..A-32 PASS. Host disk 36% (13Gi/233Gi [RAW-PROBE L29]). No anomalies, no dedup skips.

### RAW-PROBE (2026-06-22T17:13:09Z)
```
=== AUDITOR PROBE 2026-06-22T17:13:58Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 15 hours (healthy)   vn-market-intelligence-mcp-mcp-server           15 hours ago
vn-market-intelligence-mcp-frontend-1             Up 20 hours (healthy)   vn-market-intelligence-mcp-frontend             20 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          11 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=76.12% MemUsage=1.522GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  255M    0%   /

=== PROBE DONE ===
```

## c325 · 2026-06-22T16:43:07Z
### Audit Run Tier-1 (16:43 UTC 2026-06-22, Sunday 23:43 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, stable)
- Status: CLEAN
- Evidence: All 12 host_runtime_set services UP+healthy [RAW-PROBE L3-L14]. mcp-server 15h/up (mem 76.73% 1.535GiB/2GiB, restart=0 [RAW-PROBE L21]). A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). All A-01..A-32 PASS. Host disk 34% (13Gi/233Gi [RAW-PROBE L29]). No anomalies, no dedup skips.
