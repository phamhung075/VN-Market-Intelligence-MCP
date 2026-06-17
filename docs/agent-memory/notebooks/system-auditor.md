## c328 · 2026-06-17T15:15:21Z
### Audit Run Tier-1 (15:15–15:15 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 17.98% < 85% ✓
- A-32 disk: 43% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T15:15:14Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)    vn-market-intelligence-mcp-mcp-server           2 hours ago
vn-market-intelligence-mcp-frontend-1             Up 22 hours (healthy)   vn-market-intelligence-mcp-frontend             22 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 38 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        38 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)     vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)     vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)     vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)     vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)     vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)     vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days               headroom-proxy:local                            10 days ago
mcp-gateway                                       Up 6 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=17.98% MemUsage=368.2MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    18Gi    43%    393k  192M    0%   /

=== PROBE DONE ===
```

## c327 · 2026-06-17T14:44:26Z
### Audit Run Tier-1 (14:44–14:45 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 16.19% < 85% ✓
- A-32 disk: 42% < 85% ✓

## c326 · 2026-06-17T14:33:26Z
### Audit Run Tier-2 (14:33–14:37 UTC 2026-06-17)
- Tier: 2 | Cron checks: 1 | Sources: 27 checked | VPS routes: 7
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-29 cron fire gaps: all within 2× cadence ✓
- B-01–B-07 source freshness: all within thresholds ✓
- B-06–B-07 VPS proxy: all 7 routes status=ok ✓
- B-09 BCTC SSC URL shape: 0 SSC portal URLs found ✓
- B-13 stale pending BCTC: 0 pending >72h (excl deferred_infra) ✓
- C-06 market messages: 15 in last 3h ✓
- C-07 agent signals: 8 in last 24h ✓
- SLA: bctc-discover/bctc-push threshold=168h (out-of-window) ✓
