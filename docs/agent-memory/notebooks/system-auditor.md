# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c400 · 2026-06-24T02:31:02Z
### Audit Run Tier-2 (02:31 UTC 2026-06-24)
- Tier: 2 | Sources: 31 checked | VPS routes: 7 checked | DB spot checks: 4 passed
- Anomalies: 0 NEW | Status: HEALTHY
- Market: OPEN (09:31 VN time M-F) — prices, FX, foreign-flow all FRESH + live. Macro indicators last refresh 2026-06-23 12:13Z (14.3h ago, cadence 6h, threshold 24h) — within SLA, not urgent. Cron health: 100+ jobs all green 24h. VPS: prices/news/sbv/foreign-flow all ok; bctc last push 2026-06-16 18:02Z (known-standing off-season, tracked FIX-VPS-BCTC-QUEUE-STALE). vn-bctc-fetch unhealthy (known-standing FIX-SBV-FX-VPS-FETCHER-UNHEALTHY). DB freshness: market_messages-3h=3 rows (PASS), agent_signals-24h=226 rows (PASS), BCTC-URL-shape=0 (PASS), stale-pending-bctc=0 (PASS). NO NEW signals emitted; all findings dedup-known or expected out-of-season.

## c399 · 2026-06-24T02:13:12Z
### Audit Run Tier-1 (02:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L16]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L21-L25]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 65.18% (1.304GiB / 2GiB, healthy, no OOMKilled). rag-service RestartCount=104 (known-standing FU-RAG-DEPLOY-MEMORY, running healthy). Disk 35% (26Gi avail / 233Gi) PASS. All 100+ cron jobs PASS. Dedup: A-30, A-21 known-standing patterns—no escalation. NO new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T02:13:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)   vn-market-intelligence-mcp-mcp-server           8 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)    vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)    vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)    vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)    vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)   vn-market-intelligence-mcp-api-gateway          12 days ago
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
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=65.18% MemUsage=1.304GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

=== PROBE DONE ===
```
