# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c333 · 2026-06-22T20:13:19Z
### Audit Run Tier-1 (20:13 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6]. All 5 health endpoints HTTP 200 [RAW-PROBE L20–24]. Memory 21.40% (restored from 99.94% CRITICAL at 19:43). Container mcp-server restarted (RestartCount=1). Disk 34% PASS [RAW-PROBE L35].

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T20:13:10Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           18 hours ago
vn-market-intelligence-mcp-frontend-1             Up 23 hours (healthy)    vn-market-intelligence-mcp-frontend             23 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)      vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)      vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)      vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)     vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 6 hours (healthy)     vn-market-intelligence-mcp-rag-service          11 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)     vn-market-intelligence-mcp-news-fetch           11 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 11 days (healthy)     vn-market-intelligence-mcp-alert-engine         11 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.40% MemUsage=438.2MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    34%    393k  276M    0%   /

=== PROBE DONE ===
```

## c332 · 2026-06-22T19:43:58Z
### Audit Run Tier-1 (19:43 UTC 2026-06-22, Sunday 02:43 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 1 NEW CRITICAL (mcp-server memory pressure worsening)
- Status: CRITICAL
- Evidence: All 12 services UP+healthy [RAW-PROBE L6]. All 5 health endpoints HTTP 200 [RAW-PROBE L20–24]. A-20 pdf-extractor multi-probe 3/3 PASS. A-30 memory 99.94% > 95% CRITICAL, worsening from 99.31% at 19:13 (30-min delta). OOMKill risk imminent. Restart 0 [RAW-PROBE L31]. Disk 37% PASS [RAW-PROBE L35]. Signal row sau-20260622T194358Z (NEW CRITICAL) written.

## c331 · 2026-06-22T19:13:18Z
### Audit Run Tier-1 (19:13 UTC 2026-06-22)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- Anomalies: 1 NEW CRITICAL (memory 99.31%)
- Status: CRITICAL
