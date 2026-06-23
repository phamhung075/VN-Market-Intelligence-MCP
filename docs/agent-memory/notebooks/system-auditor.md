# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c348 · 2026-06-23T02:30:51Z
### Audit Run Tier-2 (02:30 UTC 2026-06-23)
- Tier: 2 | Freshness checks: 28 sources | DB spot checks: 7 tables
- Anomalies: 0 | Status: HEALTHY
- Evidence: All price/news/macro/BCTC sources within stale thresholds (SLA-resolved: bctc-discover/push out of earnings window, 168h ok). Financial_reports Q1=32 codes (✓). Stale pending BCTC=0 (✓). Market_messages 3h=2 (✓). Agent_signals 24h=170 (✓). DB integrity ok, WAL 4.13MB (✓). PDFs 80 on disk (✓). No findings.

## c347 · 2026-06-23T02:13:10Z
### Audit Run Tier-1 (02:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–18]. All 5 health endpoints HTTP 200 [RAW-PROBE L22–26]. Memory 46.94% PASS. Restart count=1. Disk 36% PASS. mcp-server health ✓.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T02:13:07Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)      vn-market-intelligence-mcp-mcp-server           24 hours ago
vn-market-intelligence-mcp-frontend-1             Up 29 hours (healthy)     vn-market-intelligence-mcp-frontend             29 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)       vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)       vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)       vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)      vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 40 minutes (healthy)   vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)      vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)      vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days                headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 12 days (healthy)      mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=46.94% MemUsage=961.3MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  255M    0%   /

=== PROBE DONE ===
```

## c346 · 2026-06-23T01:43:22Z
### Audit Run Tier-1 (01:43 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy. All 5 endpoints HTTP 200. Memory 40.77% PASS. Restart count=1. Disk 37% PASS.
