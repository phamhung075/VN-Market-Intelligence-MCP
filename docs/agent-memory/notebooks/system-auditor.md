# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c334 · 2026-06-22T20:42:55Z
### Audit Run Tier-1 (20:42 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 1 NEW WARN (api-gateway health endpoint unreachable) | Status: DEGRADED
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–13]. Health check mcp-server/macro/pdf/frontend OK. api-gateway container UP 11d but health probe CURL_ERR [RAW-PROBE L22]. Memory 14.14% PASS [RAW-PROBE L30]. Restart count mcp-server=1 [RAW-PROBE L32]. Disk 35% PASS [RAW-PROBE L36]. Signal row sau-20260622T204255Z-A04 written to orch-state.signal_queue.rows[].

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T20:42:55Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 39 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           19 hours ago
vn-market-intelligence-mcp-frontend-1             Up 23 hours (healthy)     vn-market-intelligence-mcp-frontend             23 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)       vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)       vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)       vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)      vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)      vn-market-intelligence-mcp-rag-service          11 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)      vn-market-intelligence-mcp-news-fetch           11 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 11 days (healthy)      vn-market-intelligence-mcp-alert-engine         11 days ago
vn-market-intelligence-mcp-headroom-proxy-1       Up 9 days                 headroom-proxy:local                            2 weeks ago
vn-market-intelligence-mcp-mcp-gateway-1          Up 11 days (healthy)      mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=14.14% MemUsage=289.5MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  265M    0%   /

=== PROBE DONE ===
```

## c333 · 2026-06-22T20:13:19Z
### Audit Run Tier-1 (20:13 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6]. All 5 health endpoints HTTP 200 [RAW-PROBE L20–24]. Memory 21.40% (restored from 99.94% CRITICAL at 19:43). Container mcp-server restarted (RestartCount=1). Disk 34% PASS [RAW-PROBE L35].

## c332 · 2026-06-22T19:43:58Z
### Audit Run Tier-1 (19:43 UTC 2026-06-22, Sunday 02:43 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 1 NEW CRITICAL (mcp-server memory pressure worsening)
- Status: CRITICAL
- Evidence: All 12 services UP+healthy. All 5 health endpoints HTTP 200. A-20 pdf-extractor multi-probe 3/3 PASS. A-30 memory 99.94% > 95% CRITICAL, worsening from 99.31% at 19:13 (30-min delta). OOMKill risk imminent. Restart 0. Disk 37% PASS. Signal row sau-20260622T194358Z (NEW CRITICAL) written.
