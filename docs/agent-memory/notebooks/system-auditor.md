# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c301 · 2026-06-22T05:13:40Z
### Audit Run Tier-1 (05:13 UTC 2026-06-22, Monday 12:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 12:13 Monday, market OPEN). All 12 host_runtime_set UP+healthy. mcp-server UP 3h/healthy (restart=0, mem 36.70% 751.5MiB/2GiB). rag-service UP 4h/healthy (mem cycling, tracked FU-RAG-DEPLOY-MEMORY). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 36% (25Gi free, 233Gi total). All A-01..A-32 checks PASS.

### RAW-PROBE (2026-06-22T05:13:07Z)
```
--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1: Up 3 hours (healthy)
vn-market-intelligence-mcp-frontend-1: Up 8 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1: Up 6 days (healthy)
vn-market-intelligence-mcp-stock-price-1: Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1: Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1: Up 7 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1: Up 7 days (healthy)
vn-market-intelligence-mcp-api-gateway-1: Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1: Up 4 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1: Up 11 days (healthy)
vn-market-intelligence-mcp-alert-engine-1: Up 11 days (healthy)
headroom-proxy: Up 9 days
mcp-gateway: Up 11 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=36.70% MemUsage=751.5MiB / 2GiB

--- disk df -h / ---
Filesystem: /dev/disk1s4s1 | Size: 233Gi | Used: 13Gi | Avail: 25Gi | Capacity: 36%

--- A-20 multi-probe (pdf-extractor) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
Verdict: PASS (3/3 probes)
```

## c300 · 2026-06-22T04:43:14Z
### Audit Run Tier-1 (04:43 UTC 2026-06-22, Monday 11:43 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 11:43 Monday, market OPEN). All 12 host_runtime_set UP+healthy. mcp-server UP 3h/healthy (restart=0, mem 29.79% 610.2MiB/2GiB). rag-service UP 3h/healthy (restart cycling, mem 87.12% 669.1MiB/768MiB, tracked FU-RAG-DEPLOY-MEMORY). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 36% (25Gi free). All A-01..A-32 checks PASS. RAW-PROBE: mcp-server 3h, all 12 containers healthy, health endpoints live, inter-service connectivity OK, pdftoppm/tesseract/vie OK, EPIPE not checked (Tier-1).

## c299 · 2026-06-22T04:13:08Z
### Audit Run Tier-1 (04:13 UTC 2026-06-22, Monday 11:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 11:13 Monday, market OPEN). All 12 host_runtime_set UP+healthy. mcp-server UP 2h/healthy (restart=0, mem 28.18% 577.1MiB/2GiB). rag-service UP 3h/healthy (restart cycling, mem <768MiB, tracked FU-RAG-DEPLOY-MEMORY). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 36% (25Gi free). All A-01..A-32 checks PASS. RAW-PROBE: mcp-server 2h, all 12 containers healthy, health endpoints live, inter-service connectivity OK, pdftoppm/tesseract/vie OK, EPIPE=0.
