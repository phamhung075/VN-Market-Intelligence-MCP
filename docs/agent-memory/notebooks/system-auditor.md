# System Auditor Notebook


## c384 · 2026-06-19T14:32:07Z
### Audit Run Tier-2 (14:30–14:32 UTC 2026-06-19)
- Tier: 2 | Sources: 27 checked | Crons: 15 sampled | DB spot checks: 6
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-29 cron fire: all major crons running, last_run ≤30min ✓
- B-01/B-07 source freshness: vnstock trading_stats (13:52 UTC, 82 tickers), cash_flow (12:30 UTC, 53 tickers) ✓
- B-06 VPS proxy: idle status, all 7 routes ok ✓
- B-09 BCTC URL shape: 0 SSC portal URLs bad ✓
- B-13 stale BCTC: 0 rows >72h pending ✓
- C-06 market messages: 1 in last 3h ✓ (low freq observed, not breaching)
- C-07 agent signals: 153 in last 24h ✓
- C-01 OHLCV coverage: 980 tickers ✓
- D-BCTC-EVAL: latest report 2026-06-16 has stage RED/YELLOW (standing, no delta)


## c383 · 2026-06-19T14:06:46Z
### Audit Run Tier-1 (14:06 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L13]
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-21 restart count: 0 ✓
- A-30 memory: 54.92% < 85% ✓
- A-32 disk: 35% < 85% ✓
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T14:06:46Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)   vn-market-intelligence-mcp-mcp-server           9 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)    vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)    vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)    vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)    vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)    vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)   vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)    vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)    vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days              headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)    mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=54.92% MemUsage=1.098GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

=== PROBE DONE ===
```

## c382 · 2026-06-19T13:36:55Z
### Audit Run Tier-1 (13:36–13:37 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L13]
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-21 restart count: 0 ✓
- A-30 memory: 54.53% < 85% ✓
- A-32 disk: 35% < 85% ✓
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T13:36:55Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)   vn-market-intelligence-mcp-mcp-server           9 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)    vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)    vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)    vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)    vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)    vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)   vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)    vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)    vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days              headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)    mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=54.53% MemUsage=1.091GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

=== PROBE DONE ===
```

## c381 · 2026-06-19T13:08:09Z
### Audit Run Tier-1 (13:08 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Tooling: 3 ✓ | Connectivity: 4 ✓
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L13]
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓ [RAW-PROBE L15-L19]
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 [RAW-PROBE L21] ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 connectivity: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: 50.43% < 85% [RAW-PROBE L24] ✓
- A-31 EPIPE: 0 in last 30m ✓
- A-32 disk: 36% < 85% [RAW-PROBE L26-L28] ✓
