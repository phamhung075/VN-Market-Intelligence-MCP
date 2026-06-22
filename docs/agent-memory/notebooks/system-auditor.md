# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c314 · 2026-06-22T11:43:15Z
### Audit Run Tier-1 (11:43 UTC 2026-06-22, Monday 18:43 VN — market OPEN)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 10h/up (mem 53.78% 1.076GiB/2GiB, restart=0). All A-01..A-32 PASS. api-gateway /health responding. Host disk 35% (13Gi/233Gi, healthy). Now_VN: MONDAY 18:43 market-open. Dedup-skip: rag-service mem cycling (tracked FU-RAG-DEPLOY-MEMORY).

### RAW-PROBE (2026-06-22T11:43:15Z)
```
--- docker ps -a ---
mcp-server-1: Up 10 hours (healthy)
frontend-1: Up 14 hours (healthy)
pdf-extractor-1: Up 6 days (healthy)
stock-price-1: Up 7 days (healthy)
technical-analysis-1: Up 7 days (healthy)
macro-indicators-1: Up 7 days (healthy)
kinh-dich-service-1: Up 7 days (healthy)
api-gateway-1: Up 11 days (healthy)
rag-service-1: Up 10 hours (healthy)
news-fetch-1: Up 11 days (healthy)
alert-engine-1: Up 11 days (healthy)
mcp-gateway: Up 11 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
mcp-server: RestartCount=0

--- memory pressure ---
mcp-server: MemPerc=53.78% MemUsage=1.076GiB / 2GiB

--- disk df -h / ---
Capacity: 35% (13Gi used, 26Gi available, 233Gi total)
```

## c313 · 2026-06-22T11:13:40Z
### Audit Run Tier-1 (11:13 UTC 2026-06-22, Monday 18:13 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Evidence: All 12 containers UP+healthy. mcp-server 9h/up (mem 54.16% 1.083GiB/2GiB, restart=0). A-20 pdf-extractor multi-probe 3/3 PASS. Host disk 35% (13Gi/26Gi, healthy). Now_VN: MONDAY 18:13 post-close. Dedup-skip: rag-service mem cycling (tracked FU-RAG-DEPLOY-MEMORY).

## c312 · 2026-06-22T10:30:24Z
### Audit Run Tier-2 (10:30 UTC 2026-06-22, Monday 17:30 VN — market CLOSED 15:30)
- Tier: 2 | Sources: 29 checked | DB spot-checks: 4/4 PASS
- Anomalies: 0 NEW (all freshness PASS)
- Status: CLEAN
- Evidence: C-06 market_messages(3h)=2 PASS, C-07 agent_signals(24h)=162 PASS, B-09 SSC-URLs=0 PASS, B-13 stale-BCTC(>72h)=0 PASS. Post-market window. No cron fire gaps. Dedup-skip: BCTC-push & bctc-discover SLA window (Jun not in [1,4,7,10]), normal cadence applies.

## c311 · 2026-06-22T10:14:39Z
### Audit Run Tier-1 (10:14 UTC 2026-06-22, Monday 17:14 VN — market CLOSED 15:30)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
