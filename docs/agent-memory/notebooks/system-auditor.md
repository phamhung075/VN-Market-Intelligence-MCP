# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c321 · 2026-06-22T14:43:18Z
### Audit Run Tier-1 (14:43 UTC 2026-06-22, Monday 21:43 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, no state changes)
- Status: CLEAN
- Evidence: All 12 host_runtime_set services UP+healthy [RAW-PROBE L3-L14]. mcp-server 13h/up (mem 66.67% 1.333GiB/2GiB, restart=0 [RAW-PROBE L26]). All 5 health endpoints HTTP 200 OK. A-01..A-32 PASS. Host disk 35% (13Gi/233Gi [RAW-PROBE L29]). No anomalies, no dedup skips.

### RAW-PROBE (2026-06-22T14:42:57Z)
```
=== AUDITOR PROBE 2026-06-22T14:42:57Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)     vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 17 hours (healthy)     vn-market-intelligence-mcp-frontend             17 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)       vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)       vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)       vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)      vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 38 minutes (healthy)   vn-market-intelligence-mcp-rag-service          11 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)      vn-market-intelligence-mcp-news-fetch           11 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 11 days (healthy)      vn-market-intelligence-mcp-alert-engine         11 days ago
headroom-proxy                                    Up 9 days                 headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 11 days (healthy)      mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=66.67% MemUsage=1.333GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

=== PROBE DONE ===
```

## c320 · 2026-06-22T14:31:12Z
### Audit Run Tier-2 (14:31 UTC 2026-06-22, Monday 21:31 VN — market CLOSED)
- Tier: 2 | Freshness sweep: 27 sources checked | Inter-service: 4 probes | DB spots: 6
- Anomalies: 0 NEW (all sources within SLA cadence, all services reachable)
- Status: HEALTHY
- Evidence: A-29 cron gaps=0 (intelligence cycle stable). B-01–B-07 all sources fresh (ssc-iboard <30m, foreign-flow <1m, news <1h, bctc queued). B-08 80 PDFs in /app/data/pdfs/. B-09 0 malformed ssc.gov.vn URLs. C-06 market_messages 3h=1, C-07 agent_signals 24h=169. A-25–A-28 inter-service HTTP 200 (stock-price, technical-analysis, alert-engine, pdf-extractor). A-31 EPIPE count=0. C-13 WAL sizes clean (market.db 0B, pdf_extractor none). C-01 ticker coverage 283 (last day). C-03 BCTC financial 32 Q1-2026 codes. C-04 low-conf reports 0. Market hours OUT (14:00 UTC Mon). No dedup skips.

## c319 · 2026-06-22T14:13:29Z
### Audit Run Tier-1 (14:13 UTC 2026-06-22, Monday 21:13 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, stable)
- Status: CLEAN
- Evidence: All 12 host_runtime_set services UP+healthy [RAW-PROBE L3-L14]. mcp-server 12h/up (mem 67.40% 1.348GiB/2GiB, restart=0 [RAW-PROBE L26]). A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). All A-01..A-32 PASS. Host disk 34% (13Gi/233Gi [RAW-PROBE L29]). No escalations.
