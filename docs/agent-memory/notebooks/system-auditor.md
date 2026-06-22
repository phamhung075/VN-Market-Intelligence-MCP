# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c341 · 2026-06-22T23:44:13Z
### Audit Run Tier-1 (23:44 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–17]. All 5 health endpoints HTTP 200 [RAW-PROBE L21–25]. A-20 pdf-extractor 3/3 PASS [A-20 probes]. Inter-service connectivity: stock-price/technical-analysis/alert-engine/pdf-extractor all OK. Tooling: pdftoppm/tesseract/vie-lang all present. EPIPE: 0 in last 30m. BCTC PDFs: 80 present. Memory 24.41% PASS. Restart count=1. Disk 36% PASS.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T23:43:09Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)    vn-market-intelligence-mcp-mcp-server           22 hours ago
vn-market-intelligence-mcp-frontend-1             Up 26 hours (healthy)   vn-market-intelligence-mcp-frontend             26 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)    vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)    vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 12 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=24.41% MemUsage=499.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  253M    0%   /

=== PROBE DONE ===
```
## c340 · 2026-06-22T23:13:14Z
### Audit Run Tier-1 (23:13 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–17]. All 5 health endpoints HTTP 200 [RAW-PROBE L21–25]. A-20 pdf-extractor 3/3 PASS [A-20 multi-probe]. Memory 22.32% PASS [RAW-PROBE L32]. Restart count=1 [RAW-PROBE L34]. Disk 36% PASS [RAW-PROBE L37].

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T23:13:14Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)    vn-market-intelligence-mcp-mcp-server           21 hours ago
vn-market-intelligence-mcp-frontend-1             Up 26 hours (healthy)   vn-market-intelligence-mcp-frontend             26 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)    vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)    vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 12 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=22.32% MemUsage=457.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  253M    0%   /

=== PROBE DONE ===
```
