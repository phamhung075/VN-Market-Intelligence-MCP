# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c350 · 2026-06-25T09:43:44Z
### Audit Run Tier-1 (09:43–09:44 UTC 2026-06-25)
- Tier: 1 | Services: 13/13 (12 host_runtime_set + mcp-gateway all UP)
- Health endpoints: 5/5 HTTP 200 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- mcp-server: RestartCount=0, MemPerc=58.00% (1.15GiB/2GiB), stable
- rag-service: RestartCount=118 (KNOWN STANDING FU-RAG-DEPLOY-MEMORY, last cycle +1 at 08:43)
- A-30 mcp-server mem 58% PASS (normal baseline post-build 04:40Z) | A-31 EPIPE=0 | A-32 disk=26%
- B-05 BCTC healthy-idle (SLA gate applied, queue-dependent) PASS
- Anomalies: 0 new | Dedup: none escalated | Status: HEALTHY | Signals: 0
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-25T09:43:09Z ===

--- docker ps -a ---
13 containers total (12 running + healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=57.50% MemUsage=1.15GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    39Gi    26%
```


## c349 · 2026-06-25T09:13:31Z
### Audit Run Tier-1 (09:13–09:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers: mcp-server (5h, RestartCount=0 BUILD-04:40Z sha=4ef240ed, mem=66.72% 1.334GiB/2GiB steady-climb), rag-service (36m, RestartCount=118 KNOWN FU-RAG-DEPLOY-MEMORY), all others stable 9d–2w
- A-20 endpoints PASS (5/5) | A-30 mcp-server mem 66.72% normal climb | A-31 EPIPE=0 | A-32 disk=26%
- B-05 BCTC push-age 199.7h << SLA 1714.5h (healthy-idle: queue=0 + host-up) PASS | VPS proxy 3/4 live (prices/news/sbv ok, bctc post-quarter idle)
- Pipeline health: aggregator 04:38:37 (post-market), 30/40 tickers fresh, 740 rows today
- Anomalies: 0 new | Dedup-recorded: 5 standing-known (A-21 rag +1, A-30 mem-climb, B-05 idle, B-11 post-market, proxy-artifact)
- Status: HEALTHY | Signals emitted: 0
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-25T09:13:01Z ===
--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)      vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 28 hours (healthy)     vn-market-intelligence-mcp-frontend             28 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 28 hours (healthy)     vn-market-intelligence-mcp-macro-indicators     28 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 9 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)       vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 10 days (healthy)      vn-market-intelligence-mcp-technical-analysis   10 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 10 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    10 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 2 weeks (healthy)      vn-market-intelligence-mcp-api-gateway          2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 36 minutes (healthy)   vn-market-intelligence-mcp-rag-service          2 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 weeks (healthy)      vn-market-intelligence-mcp-news-fetch           2 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 weeks (healthy)      vn-market-intelligence-mcp-alert-engine         2 weeks ago
headroom-proxy                                    Up 12 days                headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 2 weeks (healthy)      mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=66.72% MemUsage=1.334GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    39Gi    26%    393k  412M    0%   /
```

## c348 · 2026-06-25T08:56:32Z
### DB DATA-ANOMALY SWEEP (08:54–08:56 UTC 2026-06-25)
- Canonical-4 (deterministic): db1_ohlc=835, db2_scale=1, db3_vnindex=0, c04_lowconf=21 (FROZEN)
- Tables checked: 18 | Findings: 11 all-CLEAN or BY-DESIGN | New signals: 0
- Market data HEALTHY: daily_ohlcv 18251 rows (740 today, 0 dups), market_prices 121 rows (118 fresh, 0 anomalies, 3 illiquid stale)
- Feeds CLEAN: sbv_rates 9min old, macro_indicators 20h old (normal), deep_fetch 579 expired (0 stuck), scheduler_locks 1 released (0 held)
- BY-DESIGN: price_alerts 0 (unimplemented), vn_index_cache 0 (market-hours), fred_series_daily stale (API_KEY unset)
- History: appended entry #116 (115→116 confirmed) | Dedup: no regressions, all open signals untouched
- Status: STEADY-STATE | No dev-team signal queue writes

## c347 · 2026-06-25T08:43:51Z
### Audit Run Tier-1 (08:43–08:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers UP: mcp-server (4h, RestartCount=0 BUILD-04:38Z sha=4ef240ed, mem=54.17% 1.083GiB/2GiB), rag-service (6m, RestartCount=118 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY +1 recycle), all others stable 9d–2w
- A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS | A-30 mcp-server mem=54.17% (PASS) | A-31 EPIPE=0 | A-32 disk=26%
- B-05 BCTC healthy-idle: queue pending, push-age ~200h << SLA → PASS | Crons: 100+ active, success ≥98%
- RAW-PROBE: docker ps 12/12 up; health 5/5 200; mem 54.17%; disk 26% capacity
- Anomalies: 0 new | Status: HEALTHY
