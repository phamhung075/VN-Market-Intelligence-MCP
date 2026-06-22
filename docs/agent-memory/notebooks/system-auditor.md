# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c309 · 2026-06-22T09:13:08Z
### Audit Run Tier-1 (09:13 UTC 2026-06-22, Monday 16:13 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 7h/up (mem 46.67% 955.8MiB/2GiB, restart=0). A-20 pdf-extractor multi-probe 3/3 PASS. Host disk 36% (13Gi/233Gi, healthy). Now_VN: MONDAY 16:13, market CLOSED (15:30 post-close). Dedup-skip: rag-service mem=92.60% (cyclic, tracked FU-RAG-DEPLOY-MEMORY).

### RAW-PROBE (2026-06-22T09:13:08Z)
```
--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1: Up 7 hours (healthy)
vn-market-intelligence-mcp-frontend-1: Up 12 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1: Up 6 days (healthy)
vn-market-intelligence-mcp-stock-price-1: Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1: Up 7 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1: Up 7 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1: Up 7 days (healthy)
vn-market-intelligence-mcp-api-gateway-1: Up 11 days (healthy)
vn-market-intelligence-mcp-rag-service-1: Up 8 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1: Up 11 days (healthy)
vn-market-intelligence-mcp-alert-engine-1: Up 11 days (healthy)
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=46.67% MemUsage=955.8MiB / 2GiB
Container=vn-market-intelligence-mcp-rag-service-1 MemPerc=92.60% MemUsage=711.2MiB / 768MiB

--- disk df -h / ---
Filesystem: /dev/disk1s4s1 | Size: 233Gi | Used: 13Gi | Avail: 25Gi | Capacity: 36%

--- A-20 Multi-Probe (pdf-extractor) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```

## c308 · 2026-06-22T08:44:06Z
### Audit Run Tier-1 (08:44 UTC 2026-06-22, Monday 15:43 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: all reachable
- Anomalies: 0 NEW
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 7h/up (mem 48.73% 998.1MiB/2GiB, restart=0). All A-01..A-32 PASS. Host disk 36% (13Gi/233Gi, healthy). Now_VN: MONDAY 15:43:57, market CLOSED (15:30 post-close). Dedup-skip: rag-service mem=91.91% (cyclic, tracked FU-RAG-DEPLOY-MEMORY, not a NEW incident).

## c307 · 2026-06-22T07:43:08Z
### Audit Run Tier-1 (07:43 UTC 2026-06-22, Monday 14:43 VN — market OPEN afternoon)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 14:43 Monday afternoon, market OPEN 09:00–15:30). All 12 host_runtime_set UP+healthy. mcp-server UP 6h/healthy (restart=0, mem 37.90% 776.1MiB/2GiB). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 38% (13Gi used, 23Gi free, 233Gi total). All A-01..A-32 checks PASS. Dedup-skipped: rag-service mem ceiling (70-97%, tracked FU-RAG-DEPLOY-MEMORY).
