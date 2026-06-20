
## c531 · 2026-06-20T10:37:48Z
### Audit Run Tier-1 (10:37 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T10:37:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 16 hours (healthy)     vn-market-intelligence-mcp-mcp-server           16 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)       vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)       vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 49 minutes (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=84.84% MemUsage=1.697GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  270M    0%   /

=== PROBE DONE ===
```

**Findings:**
- A-01..A-11 containers: all 12 UP [RAW-PROBE L7–L19] ✓
- A-12..A-19 health endpoints: 5 of 5 PASS (200) [RAW-PROBE L22–L26] ✓
- A-20 pdf-extractor multi-probe: 3/3 in-container (200/200/200) PASS ✓
- A-21 restart count: mcp-server=0 [RAW-PROBE L28] ✓
- A-30 memory: 84.84% [RAW-PROBE L31] — at ceiling, healthy <85% ✓
- A-32 disk: 35% [RAW-PROBE L34] ✓
- Status: HEALTHY — no anomalies detected

## c530 · 2026-06-20T10:32:10Z
### Audit Run Tier-2 (10:31 UTC 2026-06-20)
- Tier: 2 | Freshness sweep | Cron gaps, per-source checks
- Anomalies: 0 new (CLEAN — all checks PASS or INFO)
- Status: HEALTHY — market closed (Saturday), downgrade C-06 to INFO
- Findings: C-06 (market_messages=0, re-verify Mon 02:00Z) INFO | C-07 (109 signals) PASS | B-09 (0 SSC URLs) PASS | B-13 (0 stale pending) PASS

## c427 · 2026-06-20T10:07:04Z
### Audit Run Tier-1 (10:07 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 1 new (W warn)
- Status: DEGRADED — 1 health endpoint FAIL (api-gateway)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T10:07:04Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 15 hours (healthy)     vn-market-intelligence-mcp-mcp-server           15 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)       vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)       vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 19 minutes (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)       vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)       vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days                 headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)       mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=70.25% MemUsage=1.405GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  270M    0%   /

=== PROBE DONE ===
```

**Findings:**
- A-01..A-11 containers: all 12 UP [RAW-PROBE L15–L27] ✓
- A-12 api-gateway health: FAIL [RAW-PROBE L31] — container UP but health endpoint unreachable (CURL_ERR) ✗
- A-12..A-19 other endpoints: 4 of 5 PASS (200) [RAW-PROBE L30, L32–L34] ✓
- A-21 restart count: mcp-server=0 [RAW-PROBE L37] ✓
- A-30 memory: 70.25% [RAW-PROBE L40] ✓ (healthy, <85%)
- A-32 disk: 35% [RAW-PROBE L43] ✓ (healthy, <85%)
- Status: DEGRADED — api-gateway health unreachable (signal: sau-2026-06-20T10:07:45Z, severity HIGH)
