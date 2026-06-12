## c298 · 2026-06-12T22:30:24Z
### Audit Run Tier-2 (22:30 UTC 2026-06-12)
- Tier: 2 | Sources: 28 | VPS: 4 | Crons: 70+
- Anomalies: 4 new WARN (B-06/B-13/C-06/A-29) | Dedup: 0 skipped
- Status: DEGRADED
- **B-06:** VPS bctc stale (4+ days)
- **B-13:** 26 pending BCTC > 72h
- **C-06:** 0 market_messages/3h
- **A-29:** intelligenceCycleJob crashed 22:15
- ✓ C-07: 112/24h, rate-limits OK, SLA OK


## c297 · 2026-06-12T22:10:20Z
### Audit Run Tier-1 (22:09–22:10 UTC 2026-06-12 → Thursday evening)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe | Disk/memory: checked
- Anomalies: 0 new (all PASS, vnstockFundamentalsRefresh crash is known/tracked) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (4h), api-gateway (38h), frontend (7h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (30h), stock-price (2d), technical-analysis (2d), kinh-dich-service (40h), alert-engine (2d), rag-service (~2h), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed (no event-loop stall) ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=47.53% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-12T22:09:47Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 7 hours (healthy)    vn-market-intelligence-mcp-frontend             7 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 38 hours (healthy)   vn-market-intelligence-mcp-api-gateway          38 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 40 hours (healthy)   vn-market-intelligence-mcp-kinh-dich-service    40 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          2 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 days (healthy)     vn-market-intelligence-mcp-news-fetch           2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)     vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)     vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)     vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 30 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)     vn-market-intelligence-mcp-macro-indicators     4 days ago
headroom-proxy                                    Up 40 minutes           headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 2 days (healthy)     mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=47.53% MemUsage=973.4MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    19Gi    41%    393k  203M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe Results:
- [A-20-PROBE-1] in-container HTTP 200 ✓
- [A-20-PROBE-2] in-container HTTP 200 ✓
- [A-20-PROBE-3] in-container HTTP 200 ✓
- Pass count: 3/3 → PASS

## c296 · 2026-06-12T21:40:17Z
### Audit Run Tier-1 (21:40 UTC 2026-06-12 → Thursday evening)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (4h), api-gateway (37h), frontend (6h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (30h), stock-price (2d), technical-analysis (2d), kinh-dich-service (40h), alert-engine (2d), rag-service (~1h), news-fetch (47h) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=49.31% < 85% ✓
- A-32 disk: 47% < 85% ✓
