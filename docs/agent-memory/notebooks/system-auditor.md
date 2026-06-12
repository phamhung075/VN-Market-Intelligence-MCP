
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

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-12T21:39:48Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)         vn-market-intelligence-mcp-mcp-server           4 hours ago
vn-market-intelligence-mcp-frontend-1             Up 6 hours (healthy)         vn-market-intelligence-mcp-frontend             6 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 37 hours (healthy)        vn-market-intelligence-mcp-api-gateway          37 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 40 hours (healthy)        vn-market-intelligence-mcp-kinh-dich-service    40 hours ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          47 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 47 hours (healthy)        vn-market-intelligence-mcp-news-fetch           47 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)          vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)          vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)          vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 30 hours (healthy)        vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)          vn-market-intelligence-mcp-macro-indicators     4 days ago
headroom-proxy                                    Up 10 minutes                headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 2 days (healthy)          mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=49.31% MemUsage=1010MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    47%    393k  160M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe Results:
- [A-20-PROBE-1] in-container HTTP 200 ✓
- [A-20-PROBE-2] in-container HTTP 200 ✓
- [A-20-PROBE-3] in-container HTTP 200 ✓
- Pass count: 3/3 → PASS

## c295 · 2026-06-12T21:12:43Z
### Audit Run Tier-1 (21:12 UTC 2026-06-12 → Thursday evening)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (3h), api-gateway (37h), frontend (6h), macro-indicators (47h), mcp-gateway (47h), pdf-extractor (29h), stock-price (47h), technical-analysis (47h), kinh-dich-service (39h), alert-engine (47h), rag-service (53m), news-fetch (47h) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=42.47% < 85% ✓
- A-32 disk: 40% < 85% ✓

## c294 · 2026-06-12T20:40:46Z
### Audit Run Tier-1 (20:40 UTC 2026-06-12 → Thursday evening)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
