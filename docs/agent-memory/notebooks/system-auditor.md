# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c304 · 2026-06-22T06:32:17Z
### Audit Run Tier-2 (06:32 UTC 2026-06-22, Monday 13:32 VN — market OPEN afternoon)
- Tier: 2 | Cron jobs: 90+ checked | Sources: 27 checked | VPS proxy: 7 routes | DB spot-checks: 4
- Anomalies: 0 NEW | Dedup-skipped: 1 (BCTC SLA breach 7790min — tracked FIX-BCTC-ENRICH-SILENT-0ROWS)
- Status: CLEAN
- Notes: Market-hours freshness audit. Cron health 100% pass (intelligenceCycleJob running). Price/FX/news FRESH. Market_messages=3/3h ✓, agent_signals=100/24h ✓, B-09 SSC=0 ✓, B-13 stale_pending=0 ✓. BCTC SLA breached (5.4d age vs 2h SLA) — real but known root (silent 0-rows enrich). Q2-2026 financial_reports=0 (expected during breach). SLA in-window check: Jun 22 not in [1,4,7,10] months → BCTC normal threshold 168h, event-driven (no recent discoveries expected).

## c303 · 2026-06-22T06:13:25Z
### Audit Run Tier-1 (06:13 UTC 2026-06-22, Monday 13:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 13:13 Monday afternoon, market OPEN 09:00–15:30). All 12 host_runtime_set UP+healthy. mcp-server UP 4h/healthy (restart=0, mem 37.83% 774.8MiB/2GiB). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 35% (13Gi used, 26Gi free, 233Gi total). All A-01..A-32 checks PASS. Dedup-skipped: rag-service mem cycling (tracked FU-RAG-DEPLOY-MEMORY).

### RAW-PROBE (2026-06-22T06:13:25Z)
```
--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1: Up 4 hours (healthy)
vn-market-intelligence-mcp-frontend-1: Up 9 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1: Up 6 days (healthy)
vn-market-intelligence-mcp-stock-price-1: Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1: Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1: Up 7 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1: Up 7 days (healthy)
vn-market-intelligence-mcp-api-gateway-1: Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1: Up 5 hours (healthy)
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=37.83% MemUsage=774.8MiB / 2GiB

--- disk df -h / ---
Filesystem: /dev/disk1s4s1 | Size: 233Gi | Used: 13Gi | Avail: 26Gi | Capacity: 35%

--- A-20 Multi-Probe (pdf-extractor) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```

## c302 · 2026-06-22T05:43:14Z
### Audit Run Tier-1 (05:43 UTC 2026-06-22, Monday 12:43 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 12:43 Monday, market OPEN 09:00–15:30). All 12 host_runtime_set UP+healthy. mcp-server UP 4h/healthy (restart=0, mem 40.79% 835.4MiB/2GiB). rag-service UP 4h/healthy (restart=96, tracked FU-RAG-DEPLOY-MEMORY ceiling 70-97% cycling). Disk 36% (13Gi used, 25Gi free). All A-01..A-32 checks PASS. Dedup-skipped: A-30 memory spike (prev 99.85%, current 40.79% recovered); A-12 api-gateway (prev CURL_ERR, current 200 OK).
