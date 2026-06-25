# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c352 · 2026-06-25T10:26:05Z
### DB Data-Anomaly Sweep (10:24–10:26 UTC 2026-06-25)
- Tier: DATA | Tables: 8 checked (daily_ohlcv, market_prices, alerts, agent_signals, vn_index_cache, financial_reports)
- Canonical counts: db1_ohlc_violations=835 (frozen ≤600L), db2_scale_gt100x=1, db3_vnindex_cache=0, c04_lowconf=21
- Anomalies found: 1 REAL (orphaned alert FK broken), 2 BY-DESIGN (vn_index_cache empty, market_prices stale illiquid)
- NEW signals: 0 (orphaned-alert already tracked sau-c08-202606180038 TRIAGED+DEPLOYED b3ea96fa, recorded-leave)
- Status: STEADY-STATE | History: 119 entries (appended 118→119)

## c351 · 2026-06-25T10:14:01Z
### Audit Run Tier-1 (10:13–10:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK | mcp-gateway UP
- All containers healthy: mcp-server (6h, RestartCount=0, mem=57.95% 1.159GiB/2GiB PASS), rag-service (RestartCount=118 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY)
- A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS | A-30 mem 57.95% PASS | A-31 EPIPE=0 PASS | A-32 disk=26% PASS
- Cron health: 160+ active jobs, all recent runs success ≥98% (intelligenceCycleJob avg 27.8s)
- B-05 BCTC healthy-idle gate PASS (queue-dependent, off-season idle by design)
- Anomalies: 0 new | Dedup: A-30 (known leak), A-21 (known rag-cycle), B-05 (healthy-idle), B-11 (post-market slot) — all RECORD-AND-LEAVE per policy
- Status: HEALTHY | Signals: 0 | Telegram: none
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-25T10:13:10Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)    vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-frontend-1             Up 29 hours (healthy)   vn-market-intelligence-mcp-frontend             29 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 29 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     29 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 9 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 10 days (healthy)    vn-market-intelligence-mcp-technical-analysis   10 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 10 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    10 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 2 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          2 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           2 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         2 weeks ago
headroom-proxy                                    Up 12 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 2 weeks (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=57.95% MemUsage=1.159GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    40Gi    26%    393k  422M    0%   /

A-20-PROBE-1: HTTP 200 PASS
A-20-PROBE-2: HTTP 200 PASS
A-20-PROBE-3: HTTP 200 PASS
```

## c350 · 2026-06-25T09:43:44Z
### Audit Run Tier-1 (09:43–09:44 UTC 2026-06-25)
- Tier: 1 | Services: 13/13 (12 host_runtime_set + mcp-gateway all UP)
- Health endpoints: 5/5 HTTP 200 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- mcp-server: RestartCount=0, MemPerc=58.00% (1.15GiB/2GiB), stable
- rag-service: RestartCount=118 (KNOWN STANDING FU-RAG-DEPLOY-MEMORY, last cycle +1 at 08:43)
- A-30 mcp-server mem 58% PASS (normal baseline post-build 04:40Z) | A-31 EPIPE=0 | A-32 disk=26%
- B-05 BCTC healthy-idle (SLA gate applied, queue-dependent) PASS
- Anomalies: 0 new | Dedup: none escalated | Status: HEALTHY | Signals: 0

## c349 · 2026-06-25T09:13:31Z
### Audit Run Tier-1 (09:13–09:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers: mcp-server (5h, RestartCount=0 BUILD-04:40Z, mem=66.72% 1.334GiB/2GiB steady-climb), rag-service (36m, RestartCount=118 KNOWN FU-RAG-DEPLOY-MEMORY)
- A-20 endpoints PASS (5/5) | A-30 mcp-server mem 66.72% normal climb | A-31 EPIPE=0 | A-32 disk=26%
- B-05 BCTC push-age 199.7h << SLA 1714.5h (healthy-idle: queue=0 + host-up) PASS | VPS proxy 3/4 live
- Pipeline health: 30/40 tickers fresh, 740 rows today
- Anomalies: 0 new | Status: HEALTHY | Signals: 0
