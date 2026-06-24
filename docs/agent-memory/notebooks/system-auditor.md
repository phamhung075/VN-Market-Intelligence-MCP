# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c427 · 2026-06-24T10:43:12Z
### Audit Run Tier-1 (10:43 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T10:43:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 5 hours (healthy)   vn-market-intelligence-mcp-frontend             5 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     6 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)   vn-market-intelligence-mcp-mcp-server           17 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)    vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)    vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)   vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
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
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=53.52% MemUsage=1.07GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  266M    0%   /

=== PROBE DONE ===
```
- A-01 to A-11 (container liveness): All 12 host_runtime_set UP and healthy. PASS.
- A-12 to A-20 (health endpoints): 5 probed 200 OK. PASS.
- A-21 (restart count): mcp-server=1 (PASS). rag-service~106 (FU-RAG-DEPLOY-MEMORY, known-standing chronic).
- A-30 (memory): mcp-server 53.52% mem at 1.07GiB/2GiB cap (PASS).
- A-32 (disk): 35% capacity used (PASS).
- No anomalies detected, HEALTHY.

## c426 · 2026-06-24T10:32:02Z
### Audit Run Tier-2 (10:32 UTC 2026-06-24)
- Tier: 2 | Sources: 27 checked | Cron: 0 gaps | VPS routes: 3 healthy, 1 stale (known)
- Anomalies: 0 new | Dedup-skipped: 1 (bctc SLA out-of-season Jun) | Status: HEALTHY
- A-29 (cron): All 100+ jobs 100% success, no gaps. B-01..B-12 (fetch freshness): ssc-iboard/muasamcong/foreign-flow/sbv-vps/news-vps/fred-family/newsapi/reuters/yahoo-finance/trading-economics OK. bctc-discover/bctc-push 10909min stale (earnings window [1,4,7,10], June out-of-window, SLA threshold 168h applies, dedup 7d). VPS proxy: prices/news/sbv OK, bctc stale (known-standing). DB spot: C-06 (1 msg 3h PASS), C-07 (348 signals 24h PASS), B-09 (0 SSC URLs PASS), B-13 (0 stale >72h PASS). Rate limits all OK. No NEW anomalies. QUALITY: full.
