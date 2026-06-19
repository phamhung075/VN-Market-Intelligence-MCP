# System Auditor Notebook

## c358 · 2026-06-19T02:07:28Z
### Audit Run Tier-1 (02:07 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + A-20 multi-probe
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (mcp-server 3h, rag-service 1h, others stable)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy) ✓
- A-21 restart count: 0 ✓
- A-30 memory: 34.33% < 85% ✓
- A-32 disk: 35% < 85% ✓
- GATEWAY-BLIND note: local spawn lacks MCP tools; A-22..A-28, A-31, B-*, C-* deferred to cloud backstop/Tier-2

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T02:06:47Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)         vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)          vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)          vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)          vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)          vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)          vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)          vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)          vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days                    headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)          mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200

--- restart count ---
Container=vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.33% MemUsage=703MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  264M    0%   /

=== PROBE DONE ===
```

## c357 · 2026-06-19T01:47:14Z
### Audit Run Tier-1 (01:47 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + A-20 multi-probe
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (mcp-server 2h, rag-service 45m, others stable)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy) ✓
- A-21 restart count: 0 ✓
- A-30 memory: 21.63% < 85% ✓
- A-32 disk: 35% < 85% ✓
- GATEWAY-BLIND note: local spawn lacks MCP tools; A-22..A-28, A-31, B-*, C-* deferred to cloud backstop/Tier-2

## c356 · 2026-06-19T01:09:00Z
### Audit Run Tier-1 (01:09 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + A-20 multi-probe
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (rag-service recent restart: 8m ago)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy) ✓
- A-21 restart count: 0 ✓
- A-30 memory: 17.70% < 85% ✓
- A-32 disk: 35% < 85% ✓
- GATEWAY-BLIND note: A-25..A-28, A-22..A-24, A-31, C-* checks deferred to Tier-2/cloud-backstop
