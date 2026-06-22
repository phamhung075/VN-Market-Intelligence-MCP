# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c311 · 2026-06-22T10:14:39Z
### Audit Run Tier-1 (10:14 UTC 2026-06-22, Monday 17:14 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 8h/up (mem 51.28% 1.026GiB/2GiB, restart=0). All A-01..A-32 PASS. api-gateway/health all 9 services OK, latencies <2ms. Host disk 34% (13Gi/27Gi, healthy). DB: C-05 PASS (0 bad SSC URLs), C-06 PASS (3 market_messages in 3h), C-07 PASS (162 agent_signals in 24h), B-13 PASS (0 stale BCTC >72h). Dedup-skip: rag-service mem=94.04% (cyclic, tracked FU-RAG-DEPLOY-MEMORY, 96 restarts, healthy).

## c310 · 2026-06-22T09:43:40Z
### Audit Run Tier-1 (09:43 UTC 2026-06-22, Monday 16:43 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 8h/up (mem 48.93% 1002MiB/2GiB, restart=0). All A-01..A-32 PASS. Host disk 36% (13Gi/233Gi). Now_VN: MONDAY 16:43, market CLOSED (15:30 post-close). Dedup-skip: rag-service mem=92.60% (cyclic, tracked FU-RAG-DEPLOY-MEMORY, 96 restarts known).

### RAW-PROBE (2026-06-22T09:43:01Z)
```
--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1: Up 8 hours (healthy)
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

--- restart counts ---
All 12 containers: 0 restarts (except rag-service: 96 — tracked)

--- memory pressure ---
mcp-server: 48.93% (1002MiB / 2GiB)
rag-service: 92.60% (711.2MiB / 768MiB) — cyclic, healthy

--- disk df -h / ---
Filesystem: /dev/disk1s4s1 | Used: 13Gi | Avail: 25Gi | Capacity: 36%
```

## c309 · 2026-06-22T09:13:08Z
### Audit Run Tier-1 (09:13 UTC 2026-06-22, Monday 16:13 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 7h/up (mem 46.67% 955.8MiB/2GiB, restart=0). A-20 pdf-extractor multi-probe 3/3 PASS. Host disk 36% (13Gi/233Gi, healthy). Now_VN: MONDAY 16:13, market CLOSED (15:30 post-close). Dedup-skip: rag-service mem=92.60% (cyclic, tracked FU-RAG-DEPLOY-MEMORY).

## c308 · 2026-06-22T08:44:06Z
### Audit Run Tier-1 (08:44 UTC 2026-06-22, Monday 15:43 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: all reachable
- Anomalies: 0 NEW
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 7h/up (mem 48.73% 998.1MiB/2GiB, restart=0). All A-01..A-32 PASS. Host disk 36% (13Gi/233Gi, healthy). Now_VN: MONDAY 15:43:57, market CLOSED (15:30 post-close). Dedup-skip: rag-service mem=91.91% (cyclic, tracked FU-RAG-DEPLOY-MEMORY, not a NEW incident).
