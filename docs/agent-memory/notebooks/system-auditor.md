

## c216 · 2026-07-03T23:46:13Z
### Audit Run Tier-1 (23:46–23:46 UTC 2026-07-03)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 52.18% < 85% PASS
- A-32 (disk): 42% < 85% PASS
- Cron health: 100+ jobs all ≥80% success
- Anomalies: 0 | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T23:45:24Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)   vn-market-intelligence-mcp-mcp-server           19 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)    74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)    vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)    vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)    vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)    vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)    vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 8 days              headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 8 days (healthy)    mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=52.18% MemUsage=1.565GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    19Gi    42%    393k  195M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c215 · 2026-07-03T23:04:32Z
### Audit Run Tier-1 (22:50–23:05 UTC 2026-07-03)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 46.36% < 85% PASS
- A-32 (disk): 42% < 85% PASS
- Cron health: 100+ jobs all ≥80% success
- Anomalies: 0 | Status: HEALTHY

## c214 · 2026-07-03T22:35:31Z
### Audit Run Tier-2 (22:20–22:35 UTC 2026-07-03)
- Tier: 2 | Crons: 100+ checked | Sources: 5 OK | VPS routes: 6/7 accessible
- A-29 (cron fire): PASS all, 100+ jobs, success_rate ≥ 80%
- B-01 through B-07, B-11, B-12 (per-source freshness): 5/5 sources OK (price/news/sbv/foreign-flow monitored)
- B-09 (BCTC URL shape): PASS — 0 bad SSC URLs in queue
- B-13 (stale pending BCTC): PASS — 0 stale pending rows
- C-06 (market messages 3h): PASS — 1 message
- C-07 (agent signals 24h): PASS — 212 signals
- B-08 (BCTC PDFs landed): PASS — 98 PDFs
- **B-05 CRITICAL**: bctc-push VPS stale 18 days (2026-06-16 last push) | In earnings window (24h threshold, days 1-14) | Elapsed: 432h >> 24h | Active queue: 36 items | Root: VPS headroom-proxy network binding 127.0.0.1:8787 blocks container access
- Anomalies: 1 new CRITICAL | M dedup-skipped: 1 (prior B-05 row from 2026-07-03T02:41:17Z still open)
- Status: DEGRADED

### Context
- BCTC VPS push hasn't succeeded since 2026-06-16T18:02:24Z (17+ days)
- Earnings window active: Jul 1-14 (Q2 results season), threshold 24h vs normal 168h
- Prior signal (2026-07-03T02:41:17Z) noted HNX SSL outage + deploy-pending fix (BCTC-HNX-SSL-HARDEN)
- Current audit confirms: VPS infrastructure issue persists; headroom-proxy network binding prevents mcp-server container from reaching VPS routes
- vn-bctc-fetch service status reports "healthy" but cannot push due to network isolation
