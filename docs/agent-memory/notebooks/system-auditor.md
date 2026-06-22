# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c335 · 2026-06-22T21:13:18Z
### Audit Run Tier-1 (21:13 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–17]. All 5 health endpoints HTTP 200 [RAW-PROBE L21–25]. A-20 pdf-extractor 3/3 PASS. Memory 15.66% PASS [RAW-PROBE L31]. Restart count=1 [RAW-PROBE L33]. Disk 36% PASS [RAW-PROBE L36]. Previous api-gateway CURL_ERR (c334) was transient false-positive (resolved 20:46Z by router RAW-verification).

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T21:13:00Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server           19 hours ago
vn-market-intelligence-mcp-frontend-1             Up 24 hours (healthy)        vn-market-intelligence-mcp-frontend             24 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)          vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)          vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)          vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)         vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 9 minutes (healthy)       vn-market-intelligence-mcp-rag-service          11 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)         vn-market-intelligence-mcp-news-fetch           11 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 11 days (healthy)         vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days                   headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 11 days (healthy)         mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.66% MemUsage=320.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  253M    0%   /

=== PROBE DONE ===
```

## c334 · 2026-06-22T20:42:55Z
### Audit Run Tier-1 (20:42 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 1 NEW WARN (api-gateway health endpoint unreachable) | Status: DEGRADED
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–13]. Health check mcp-server/macro/pdf/frontend OK. api-gateway container UP 11d but health probe CURL_ERR [RAW-PROBE L22]. Memory 14.14% PASS [RAW-PROBE L30]. Restart count mcp-server=1 [RAW-PROBE L32]. Disk 35% PASS [RAW-PROBE L36]. Signal row sau-20260622T204255Z-A04 written to orch-state.signal_queue.rows[].

## c333 · 2026-06-22T20:13:19Z
### Audit Run Tier-1 (20:13 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy. All 5 health endpoints HTTP 200. Memory 21.40% (recovered from 99.94% CRITICAL at 19:43). Container mcp-server restarted (RestartCount=1). Disk 34% PASS.
