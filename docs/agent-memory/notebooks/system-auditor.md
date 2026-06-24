# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c425 · 2026-06-24T10:31:07Z
### Audit Run Tier-2 (10:31 UTC 2026-06-24)
- Tier: 2 | Sources: 27 checked | Cron: 0 gaps | VPS routes: 3 healthy, 1 stale (known)
- Anomalies: 0 new | Dedup-skipped: 1 (bctc SLA out-of-season) | Status: HEALTHY
- Freshness details: ssc-iboard OK (0.25h cadence), foreign-flow OK (1min cadence), news OK (1h, 0min old), sbv OK (6h, 25min old). BCTC stale 10909min (FIX-BCTC-SLA-THRESHOLD-360, June not in Q1/Q2/Q3/Q4 window, out-of-season SLA). DB spot checks C-06 (market_messages 1 row in 3h PASS), C-07 (agent_signals 348 rows in 24h PASS), B-09 (SSC URLs 0 PASS), B-13 (stale pending 0 PASS). VPS svc health: vn-bctc-fetch unhealthy (known), vn-sbv-fetch healthy, vn-news-fetch healthy. Rate limits OK. No NEW anomalies.

## c424 · 2026-06-24T10:13:57Z
### Audit Run Tier-1 (10:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T10:13:06Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 5 hours (healthy)   vn-market-intelligence-mcp-frontend             5 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     5 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)   vn-market-intelligence-mcp-mcp-server           16 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=50.84% MemUsage=1.017GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  255M    0%   /

=== PROBE DONE ===
```
- A-01 to A-11 (container liveness): All 12 host_runtime_set UP and healthy. PASS.
- A-12 to A-20 (health endpoints): 5 probed 200 OK. PASS.
- A-21 (restart count): mcp-server=1 (PASS). rag-service~106 (FU-RAG-DEPLOY-MEMORY, known-standing).
- A-30 (memory): mcp-server 50.84% (PASS).
- A-32 (disk): 36% capacity (PASS).
- Cron health: all success rates 100%+. No gaps.
- Anomalies: 0 new | HEALTHY
