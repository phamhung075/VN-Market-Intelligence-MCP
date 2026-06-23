# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c361 · 2026-06-23T08:13:53Z
### Audit Run Tier-1 (08:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–18]. All 5 health endpoints HTTP 200 [RAW-PROBE L22–27]. A-20 pdf-extractor 3/3 multi-probe PASS. Memory 54.11% PASS. RestartCount=1 PASS. Disk 37% PASS.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T08:13:21Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 12 hours (healthy)   vn-market-intelligence-mcp-mcp-server           30 hours ago
vn-market-intelligence-mcp-frontend-1             Up 35 hours (healthy)   vn-market-intelligence-mcp-frontend             35 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)     vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)     vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)    vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)    vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)    vn-market-intelligence-mcp-alert-engine         12 days ago
vn-market-intelligence-mcp-mcp-gateway-1          Up 12 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=54.11% MemUsage=1.082GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%    393k  243M    0%   /

=== PROBE DONE ===
```

## c360 · 2026-06-23T07:44:00Z
### Audit Run Tier-1 (07:43 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–18]. All 5 health endpoints HTTP 200 [RAW-PROBE L22–26]. Memory 48.71% PASS. RestartCount=1 PASS. Disk 35% PASS. No issues detected.

## c359 · 2026-06-23T07:13:44Z
### Audit Run Tier-1 (07:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–18]. All 5 health endpoints HTTP 200 [RAW-PROBE L22–26]. A-20 pdf-extractor 3/3 multi-probe PASS. Memory 46.23% PASS. Restart count=1 PASS. Disk 35% PASS.
