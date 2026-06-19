# System Auditor Notebook


## c396 · 2026-06-19T19:15:01Z
### Audit Run Tier-1 (19:13–19:15 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY — all runtime checks PASS
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L14]
- A-12..A-19 health endpoints: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ [RAW-PROBE L16-L20]
- A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓ [RAW-PROBE L22]
- A-30 memory: mcp-server 11.31%/2GiB PASS ✓
- A-32 disk: 35% < 85% PASS ✓ [RAW-PROBE L25-L27]
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T19:14:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           10 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)       vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)       vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)       vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)       vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 42 minutes (healthy)   vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)       vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)       vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days                 headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 8 days (healthy)       mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=11.31% MemUsage=231.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  270M    0%   /

=== PROBE DONE ===

=== A-20 MULTI-PROBE RESULTS ===
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
pass_count=3/3 PASS
```

## c395 · 2026-06-19T18:38:02Z
### Audit Run Tier-1 (18:30–18:38 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 new (memory stable WARN/dedup) | Dedup: 1 skipped (prior A-30 WARN at 17:39:34Z)
- Status: HEALTHY — all runtime checks PASS, A-30 monitoring continues
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L14]
- A-12..A-19 health endpoints: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ [RAW-PROBE L16-L20]
- A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓ [RAW-PROBE L22]
- A-30 memory: mcp-server 97.94%/2GiB WARN (STABLE CEILING, RestartCount=0, OOMKilled=false, Up 14h) — dedup-skipped BUG alert; FU-ALERT-COWRITE rebuild queued
- A-32 disk: 35% < 85% PASS ✓ [RAW-PROBE L25-L27]
