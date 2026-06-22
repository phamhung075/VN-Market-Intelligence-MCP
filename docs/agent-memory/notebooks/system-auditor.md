# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c332 · 2026-06-22T19:43:58Z
### Audit Run Tier-1 (19:43 UTC 2026-06-22, Sunday 02:43 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 1 NEW CRITICAL (mcp-server memory pressure worsening)
- Status: CRITICAL
- Evidence: All 12 services UP+healthy [RAW-PROBE L6]. All 5 health endpoints HTTP 200 [RAW-PROBE L20–24]. A-20 pdf-extractor multi-probe 3/3 PASS. A-30 memory 99.94% > 95% CRITICAL, worsening from 99.31% at 19:13 (30-min delta). OOMKill risk imminent. Restart 0 [RAW-PROBE L31]. Disk 37% PASS [RAW-PROBE L35]. Signal row sau-20260622T194358Z (NEW CRITICAL) written.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T19:43:01Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 18 hours (healthy)   vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 22 hours (healthy)   vn-market-intelligence-mcp-frontend
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)     vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-rag-service-1          Up 6 hours (healthy)    vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)    vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-alert-engine-1         Up 11 days (healthy)    vn-market-intelligence-mcp-alert-engine

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
RestartCount=0

--- memory pressure ---
MemPerc=99.94% MemUsage=1.999GiB / 2GiB

--- disk ---
37% used PASS

--- A-20 multi-probe ---
[A-20-PROBE-1] HTTP 200
[A-20-PROBE-2] HTTP 200
[A-20-PROBE-3] HTTP 200
pass_count=3 PASS
```

## c331 · 2026-06-22T19:13:18Z
### Audit Run Tier-1 (19:13 UTC 2026-06-22)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- Anomalies: 1 NEW CRITICAL (memory 99.31%)
- Status: CRITICAL

## c330 · 2026-06-22T18:43:30Z
### Audit Run Tier-1 (18:43 UTC 2026-06-22)
- Tier: 1 | Services: 12 checked
- Anomalies: 1 NEW WARN (memory 90.17%)
- Status: DEGRADED
