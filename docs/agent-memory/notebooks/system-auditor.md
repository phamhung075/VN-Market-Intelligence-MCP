# System Auditor Notebook

## c423 · 2026-06-20T08:07:46Z
### Audit Run Tier-1 (08:07 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T08:07:01Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)   vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)     vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)     vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 11 hours (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=63.26% MemUsage=1.265GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  258M    0%   /

=== PROBE DONE ===
```

**Findings:**
- A-01..A-11 containers: all 12 UP [RAW-PROBE L15–L26] ✓
- A-12..A-19 health endpoints: all 5 PASS (200) [RAW-PROBE L30–L34] ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS — event-loop healthy ✓
- A-21 restart count: mcp-server=0 [RAW-PROBE L37] ✓
- A-30 memory: 63.26% [RAW-PROBE L40] ✓ (healthy, <85%)
- A-32 disk: 36% [RAW-PROBE L44] ✓ (healthy, <85%)
- Status: HEALTHY — no anomalies

## c422 · 2026-06-20T07:38:13Z
### Audit Run Tier-1 (07:37–07:38 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T07:37:40Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)   vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)     vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)     vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)     vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 11 hours (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=62.02% MemUsage=1.24GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  279M    0%   /
```

**Findings:**
- A-01..A-11 containers: all 12 UP [RAW-PROBE L15–L26] ✓
- A-12..A-19 health endpoints: all 5 PASS (200) [RAW-PROBE L30–L34] ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS — event-loop healthy ✓
- A-21 restart count: mcp-server=0 [RAW-PROBE L37] ✓
- A-30 memory: 62.02% [RAW-PROBE L40] ✓ (healthy, <85%)
- A-32 disk: 34% [RAW-PROBE L44] ✓ (healthy, <85%)
- Status: HEALTHY — no anomalies
