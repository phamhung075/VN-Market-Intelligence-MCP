

## c317 · 2026-06-17T10:32:50Z
### Audit Run Tier-2 (10:32–10:33 UTC 2026-06-17)
- Tier: 2 | Cron health: checked | Sources: 28 scanned | VPS proxy: checked
- DB freshness: C-06 ✓ (1 msg 3h), C-07 ✓ (155 signals 24h)
- BCTC checks: B-09 ✓ (0 SSC URLs), B-13 ⚠ (8 stale pending Q1, 47d old)
- Anomalies: 1 new WARN (B-13) | Dedup: 0 skipped
- Status: DEGRADED (1 WARN on stale BCTC earnings fetch)

## c316 · 2026-06-17T10:14:28Z
### Audit Run Tier-1 (10:14–10:14 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (3h), api-gateway (6d), frontend (17h), macro-indicators (2d), mcp-gateway (6d), pdf-extractor (33h), stock-price (46h), technical-analysis (2d), kinh-dich-service (2d), alert-engine (6d), rag-service (2h), news-fetch (6d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 passed (HTTP 200) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=30.44% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T10:14:24Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)    vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 17 hours (healthy)   vn-market-intelligence-mcp-frontend             17 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 33 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        33 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 46 hours (healthy)   vn-market-intelligence-mcp-stock-price          46 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=30.44% MemUsage=623.4MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    41%    393k  205M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe Results:
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
Verdict: 3/3 passed → A-20 PASS
```

## c315 · 2026-06-17T09:44:54Z
### Audit Run Tier-1 (09:44–09:45 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY

## c314 · 2026-06-17T09:14:50Z
### Audit Run Tier-1 (09:14–09:15 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
