

## c292 · 2026-06-12T19:40:27Z
### Audit Run Tier-1 (19:40 UTC 2026-06-12 → Thursday evening)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (2h), api-gateway (35h), frontend (4h), macro-indicators (46h), mcp-gateway (46h), pdf-extractor (28h), stock-price (46h), technical-analysis (46h), kinh-dich-service (38h), alert-engine (46h), rag-service (2m), news-fetch (45h) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=16.21% < 85% ✓
- A-32 disk: 44% < 85% ✓
- Cron health: 68 jobs checked, all recent fires 100% success rate ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-12T19:39:50Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)     vn-market-intelligence-mcp-mcp-server           2 hours ago
vn-market-intelligence-mcp-frontend-1             Up 4 hours (healthy)     vn-market-intelligence-mcp-frontend             4 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 35 hours (healthy)    vn-market-intelligence-mcp-api-gateway          35 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 38 hours (healthy)    vn-market-intelligence-mcp-kinh-dich-service    38 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 2 minutes (healthy)   vn-market-intelligence-mcp-rag-service          45 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 45 hours (healthy)    vn-market-intelligence-mcp-news-fetch           45 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 46 hours (healthy)    vn-market-intelligence-mcp-stock-price          46 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 46 hours (healthy)    vn-market-intelligence-mcp-alert-engine         46 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 46 hours (healthy)    vn-market-intelligence-mcp-technical-analysis   46 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 28 hours (healthy)    vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 46 hours (healthy)    vn-market-intelligence-mcp-macro-indicators     4 days ago
headroom-proxy                                    Up 46 hours              headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 46 hours (healthy)    mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.21% MemUsage=332.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    18Gi    44%    393k  185M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe Results:
- [A-20-PROBE-1] in-container HTTP 200 ✓
- [A-20-PROBE-2] in-container HTTP 200 ✓
- [A-20-PROBE-3] in-container HTTP 200 ✓
- Pass count: 3/3 → PASS

## c291 · 2026-06-09T05:06:15Z
### Audit Run Tier-1 (05:06 UTC 2026-06-09 → Tuesday morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 1 new (A-30 WARN memory escalation, higher than 04:05 reading) | Dedup: 0 skipped
- Status: DEGRADED
- A-01..A-19 container UP: mcp-server (12h), api-gateway (34h), macro-indicators (29h), pdf-extractor (21h), frontend (34h), mcp-gateway (34h) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=97.75% ≥ 85% ✗ WARN — mcp-server critical OOM risk, capped at 2GB (escalated from 89.6% at 04:05)
- A-32 disk: 40% < 85% ✓

## c290 · 2026-06-09T04:35:18Z
### Audit Run Tier-1 (04:35 UTC 2026-06-09 → Tuesday morning)
- Tier: 1 | Services: 6 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-19 container UP: mcp-server (11h), api-gateway (34h), macro-indicators (29h), pdf-extractor (20h), frontend (34h), mcp-gateway (34h) ✓
- A-20 pdf-extractor multi-probe: 3/3 passed ✓
- A-21 restart count: 2 ≤ 2 ✓
- A-30 memory: MemPerc=69.98% < 85% ✓ (recovered from 89.6% at 04:05)
- A-32 disk: 39% < 85% ✓
