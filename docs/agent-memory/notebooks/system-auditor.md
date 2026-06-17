## c335 · 2026-06-17T18:34:48Z
### Audit Run Tier-2 (18:34–18:35 UTC 2026-06-17)
- Tier: 2 | Cron health: checked | Sources: 28 scanned | VPS proxy: checked
- DB freshness: C-06 ⚠ (0 msg 3h STALE), C-07 ✓ (152 signals 24h)
- BCTC checks: B-09 ✓ (0 SSC URLs), B-13 ⚠ (8 stale pending, 72h+ old)
- Anomalies: 1 new WARN (C-06 no market messages) | 1 recurring (B-13) dedup-skipped
- Status: DEGRADED (1 new WARN on market message staleness)

## c334 · 2026-06-17T18:15:02Z
### Audit Run Tier-1 (18:14–18:15 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 34.80% < 85% ✓
- A-32 disk: 40% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T18:14:29Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 25 hours (healthy)   vn-market-intelligence-mcp-frontend             25 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 41 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        41 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)     vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)     vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)     vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)     vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)    vn-market-intelligence-mcp-rag-service          6 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.80% MemUsage=712.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    21Gi    40%    393k  219M    0%   /

=== PROBE DONE ===
```

### A-20 In-Container Multi-Probe Results:
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3 / 3 — PASS (majority-vote)
```

## c333 · 2026-06-17T17:44:40Z
### Audit Run Tier-1 (17:44–17:45 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 30.81% < 85% ✓
- A-32 disk: 42% < 85% ✓
