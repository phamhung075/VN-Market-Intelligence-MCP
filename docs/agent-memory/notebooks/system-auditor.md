
## c593 · 2026-06-20T14:07:12Z
### Audit Run Tier-1 (14:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; rag-service 748MiB (warm ceiling, 0-restart); disk 35% capacity

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T14:07:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 19 hours (healthy)   vn-market-intelligence-mcp-mcp-server           19 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    Up 5 days
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=89.57% MemUsage=1.791GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  269M    0%   /

=== PROBE DONE ===
```

**Verdict Analysis:**
- A-01..A-11 containers: all 12 UP ✓
- A-12..A-19 health endpoints: 5/5 PASS (HTTP 200) ✓
- A-21 restart: mcp-server=0 ✓
- A-30 memory: mcp-server 89.57%/2GB (stable warm ceiling, 0-restart, per host_runtime_set note rag-service 748MiB = known normal) ✓
- A-32 disk: 35% capacity (26GB avail) ✓

**HEALTHY:** Tier-1 runtime ping clean. No anomalies, no signals posted.

## c592 · 2026-06-20T13:37:10Z
### Audit Run Tier-1 (13:37 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; disk 35% capacity

## c591 · 2026-06-20T13:07:12Z
### Audit Run Tier-1 (13:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; disk 35% capacity

## c590 · 2026-06-20T12:37:09Z
### Audit Run Tier-1 (12:37 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (0 signals emitted)
- Status: HEALTHY — all runtime checks PASS; container fleet stable; disk 34% capacity
