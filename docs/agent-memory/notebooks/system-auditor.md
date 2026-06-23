# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c368 · 2026-06-23T11:14:36Z
### Audit Run Tier-1 (11:14 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy (mcp-server 15h, frontend 38h, pdf-extractor 7d, stock-price 7d, ta 8d, macro 8d, kinh-dich 8d, api-gateway 12d, rag-service 10h, news 12d, alert 12d, mcp-gateway 12d). Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS. A-25–A-28 inter-service: all 4 routes OK. A-31 EPIPE: 0/30m PASS. Memory 61.81% PASS. RestartCount=1 PASS. Disk 36% PASS. MCP toolCount=166 sessions=350 uptime=54622s.

### RAW-PROBE:
\`\`\`
=== AUDITOR PROBE 2026-06-23T11:13:13Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 15 hours (healthy)   vn-market-intelligence-mcp-mcp-server           33 hours ago
vn-market-intelligence-mcp-frontend-1             Up 38 hours (healthy)   vn-market-intelligence-mcp-frontend             38 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)     vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)     vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)    vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 10 hours (healthy)   vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)    vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)    vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 12 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200

--- A-25–A-28 inter-service connectivity ---
[A-25] stock-price:5000/health OK
[A-26] technical-analysis:5003/health OK
[A-27] alert-engine:5006/health OK
[A-28] pdf-extractor:5001/health OK

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=61.81% MemUsage=1.236GiB / 2GiB

--- A-31 EPIPE Crash Check (30m) ---
EPIPE/ECONNRESET count: 0

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  253M    0%   /

=== PROBE DONE ===
\`\`\`

## c367 · 2026-06-23T10:43:56Z
### Audit Run Tier-1 (10:43 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy (mcp-server 15h, frontend 37h, pdf-extractor 7d, stock-price 7d, ta 8d, macro 8d, kinh-dich 8d, api-gateway 12d, rag-service 9h, news 12d, alert 12d, mcp-gateway 12d). Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS. Memory 63.63% PASS. RestartCount=1 PASS. Disk 36% PASS. MCP toolCount=166 sessions=346 uptime=52848s.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T10:43:02Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 15 hours (healthy)   vn-market-intelligence-mcp-mcp-server           33 hours ago
vn-market-intelligence-mcp-frontend-1             Up 37 hours (healthy)   vn-market-intelligence-mcp-frontend             37 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)     vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)     vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)    vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 9 hours (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)    vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)    vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 12 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=63.63% MemUsage=1.273GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  253M    0%   /

=== PROBE DONE ===
```


## c366 · 2026-06-23T10:31:40Z
### Audit Run Tier-2 (10:31 UTC 2026-06-23)
- Tier: 2 | Sources: 25+ checked | Market: CLOSED (outside 02:00-08:30 UTC)
- Anomalies: 0 new | Dedup-skipped: 0 | Status: HEALTHY
- Domains checked: OHLCV (765 tickers), Financial (32 codes Q1), BCTC (0 bad URLs), Signals (291/24h), Messages (2/3h)
- Macro_Indicators: 22.3h old (threshold 24h, cadence 6h) | age_last_fetch=2026-06-22T12:13:01Z | indicator_count=3 | VERDICT=PASS-WATCH
- VPS routes (5/5 polled 3min ago): price/news/sbv/foreign=healthy/idle, bctc-fetch=unhealthy (known-standing)
- Known-standing: vps-bctc ~3d unhealthy (sau-vps-bctc-202606192230 HIGH open), C-08 33 orphaned alerts, rag-service OOM-loop
- cron: macroIndicatorRefreshJob 22.3h ago, intelligenceCycleJob 3min ago (all success)


## c365 · 2026-06-23T10:13:15Z
### Audit Run Tier-1 (10:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy. All 5 health endpoints HTTP 200. Memory 61.71% PASS. RestartCount=1 PASS. Disk 37% PASS.
