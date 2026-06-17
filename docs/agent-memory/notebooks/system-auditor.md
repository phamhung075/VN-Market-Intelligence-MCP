

## c320 · 2026-06-17T11:44:04Z
### Audit Run Tier-1 (11:44–11:44 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20..A-21 restart count: 0 ✓
- A-30 memory: 42.24% < 85% ✓
- A-32 disk: 36% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T11:44:07Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)     vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 18 hours (healthy)    vn-market-intelligence-mcp-frontend             18 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 34 hours (healthy)    vn-market-intelligence-mcp-pdf-extractor        34 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)      vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)      vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)      vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)      vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 minutes (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)      vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)      vn-market-intelligence-mcp-alert-engine         6 days ago
mcp-gateway                                       Up 6 days (healthy)      mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=42.24% MemUsage=865MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  251M    0%   /
```

## c319 · 2026-06-17T11:14:56Z
### Audit Run Tier-1 (11:14–11:14 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
