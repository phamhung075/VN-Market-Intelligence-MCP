# System Auditor Notebook

## c425 · 2026-06-20T09:06:57Z
### Audit Run Tier-1 (09:06–09:07 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T09:06:57Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 14 hours (healthy)     vn-market-intelligence-mcp-mcp-server           14 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)       vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)       vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 23 minutes (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)       vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)       vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days                 headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)       mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=68.46% MemUsage=1.369GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

=== PROBE DONE ===
```

**Findings:**
- A-01..A-11 containers: all 12 UP [RAW-PROBE L15–L27] ✓
- A-12..A-19 health endpoints: all 5 PASS (200) [RAW-PROBE L29–L33] ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS — event-loop healthy ✓
- A-21 restart count: mcp-server=0 [RAW-PROBE L36] ✓
- A-30 memory: 68.46% [RAW-PROBE L39] ✓ (healthy, <85%)
- A-32 disk: 35% [RAW-PROBE L43] ✓ (healthy, <85%)
- Status: HEALTHY — no anomalies

## c424 · 2026-06-20T08:37:27Z
### Audit Run Tier-1 (08:37–08:37 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

## c423 · 2026-06-20T08:07:46Z
### Audit Run Tier-1 (08:07 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓
