# System Auditor Notebook


## c378 · 2026-06-19T11:37:15Z
### Audit Run Tier-1 (11:37 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Tooling: 3 ✓ | Connectivity: 4 ✓
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L13]
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓ [RAW-PROBE L15-L19]
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 [RAW-PROBE L21] ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 connectivity: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: 43.02% < 85% [RAW-PROBE L23] ✓
- A-31 EPIPE: 0 in last 30m ✓
- A-32 disk: 35% < 85% [RAW-PROBE L25-L27] ✓
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T11:36:52Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 7 hours (healthy)         vn-market-intelligence-mcp-mcp-server           7 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)          vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)          vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)          vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)          vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)          vn-market-intelligence-mcp-api-gateway          8 days ago
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
--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0
--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=43.02% MemUsage=881.1MiB / 2GiB
--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  262M    0%   /
=== PROBE DONE ===
```

## c377 · 2026-06-19T11:07:54Z
### Audit Run Tier-1 (11:07 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Tooling: 3 ✓ | Connectivity: 4 ✓
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L19-L36]
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓ [RAW-PROBE L38-L42]
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 [RAW-PROBE L44-L45] ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 connectivity: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: 42.22% < 85% [RAW-PROBE L47-L48] ✓
- A-31 EPIPE: 0 in last 30m ✓
- A-32 disk: 35% < 85% [RAW-PROBE L50-L52] ✓
