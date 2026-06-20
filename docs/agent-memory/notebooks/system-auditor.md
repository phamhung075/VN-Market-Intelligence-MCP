# System Auditor Notebook

## c408 · 2026-06-20T00:07:47Z
### Audit Run Tier-1 (00:07 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T00:07:16Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)   vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)    vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)    vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)    vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)    vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)    vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)    vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)    vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days              headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)    mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=32.54% MemUsage=666.5MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  269M    0%   /
```

- A-01..A-11 containers: all 12 UP ✓ (mcp-server 5h, api-gateway 8d, frontend 3d, stock-price 4d, ta 4d, macro 4d, kinh-dich 5d, pdf-extractor 3d, rag 3h, news 9d, alert 9d)
- A-12..A-19 health: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓
- A-20 multi-probe pdf-extractor: 3/3 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓
- A-30 memory: mcp-server 32.54% / 2GiB ✓
- A-32 disk: 35% ✓
- Context: Sat 2026-06-20 00:07 UTC (weekend market closed) — SSC iBoard staleness INFO, FX staleness INFO (no new data expected)
- api-gateway /health aggregate: all 10 services ok ✓

## c407 · 2026-06-20T00:03:22Z
### Audit Run Tier-3 (00:03 UTC 2026-06-20)
- Tier: 3 | Checks: A-22..A-28 + B-08 + C-01..C-16 + integrity
- Anomalies: 2 new (1 WARN, 1 INFO)
- Status: HEALTHY with minor integrity findings
- Tier-1 (runtime): all 12 containers UP, mcp-server 27.32% mem, 0 restarts, 0 EPIPE
- Tier-3 (DB integrity): market.db + pdf_extractor.db both "ok" on PRAGMA check, WAL < 50MB ✓
- C-01..C-05 PASS: daily_ohlcv 949 rows, financial_reports Q1 32 actions, no SSC URLs pending
- C-06..C-07 INFO: 0 market_messages (weekend market closed), 107 agent_signals 24h ✓
- **C-04 WARN**: 13 financial_reports with extraction_confidence<0.2 (threshold ≤5) — emitted signal
- **C-08 INFO**: 10 orphaned alerts 24h (1319 all-time, 88% of 1495 total); by design: most alerts lack 1:1 signal; trend: 103→63→33→10 (declining) — emitted signal
- C-09..C-16 PASS: macro indicators 3 cols ✓, PDF status 0/0 ✓, WAL clean, top-3 concentration 0.3%, schema 4/4 cols, stale BCTC queue 0
- Tooling OK: pdftoppm, tesseract, vie lang all present
- Inter-service connectivity: stock-price, ta, alert-engine, pdf-extractor all HEALTHY
- Signals written: 2 rows to signal_queue.rows[]

## c406 · 2026-06-19T23:37:41Z
### Audit Run Tier-1 (23:37 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓
- A-01..A-11 containers: 11/12 UP ✓ (mcp-server 5h, api-gateway 8d, frontend 3d, stock-price 4d, ta 4d, macro 4d, kinh-dich 5d, pdf-extractor 3d, rag 3h, news 9d, alert 9d)
- A-12..A-19 health: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓
- A-21 restart count: mcp-server=0 PASS ✓
- A-30 memory: mcp-server 27.03% / 2GiB ✓
- A-32 disk: 34% ✓
