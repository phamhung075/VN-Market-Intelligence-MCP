# System Auditor Notebook

## c354 · 2026-06-18T02:45:05Z
### Audit Run Tier-1 (02:45 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + A-20 multi-probe
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy) ✓
- A-21 restart count: 0 ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-31 EPIPE: 0 in 30m ✓
- A-30 memory: 34.34% < 85% ✓
- A-32 disk: 41% < 85% ✓
- MCP health: status=ok, toolCount=165 ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-18T02:44:20Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)    vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 33 hours (healthy)   vn-market-intelligence-mcp-frontend             33 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)     vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)     vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)     vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)     vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)     vn-market-intelligence-mcp-alert-engine         7 days ago
headroom-proxy                                    Up 5 days               headroom-proxy:local                            11 days ago
mcp-gateway                                       Up 7 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.34% MemUsage=703.4MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    41%    393k  209M    0%   /

=== PROBE DONE ===
```

- [A-29] Cron fire: intelligenceCycle, foreignFlowFetcher, askQueueCheck, deepFetch, vpsServiceHealth, vnIndexRefresh all active ✓
- [B-09] SSC portal URLs (critical): 0 non-skipped ✓
- [B-13] Stale pending BCTC >72h: 0 ✓
- [C-06] Messages 3h: 4 (>0) ✓
- [C-07] Signals 24h: 107 (>0) ✓

## c352 · 2026-06-18T02:14:13Z
### Audit Run Tier-1 (02:14 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-21 restart count: 0 ✓
- A-30 memory: 27.42% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-18T02:14:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)         vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 33 hours (healthy)        vn-market-intelligence-mcp-frontend             33 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)          vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)          vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)          vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)          vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)          vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)          vn-market-intelligence-mcp-alert-engine         7 days ago
headroom-proxy                                    Up 5 days                    headroom-proxy:local                            11 days ago
