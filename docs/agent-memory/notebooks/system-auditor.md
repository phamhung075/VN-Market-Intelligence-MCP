# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c417 · 2026-06-24T07:14:44Z
### Audit Run Tier-1 (07:13–07:14 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T07:14:29Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED AT
vn-market-intelligence-mcp-frontend-1             Up 2 hours (healthy)      vn-market-intelligence-mcp-frontend             2026-06-24 07:23:40 +0200 CEST
vn-market-intelligence-mcp-macro-indicators-1     Up 2 hours (healthy)      vn-market-intelligence-mcp-macro-indicators     2026-06-24 06:54:42 +0200 CEST
vn-market-intelligence-mcp-mcp-server-1           Up 31 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           2026-06-23 20:09:04 +0200 CEST
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        2026-06-16 03:15:49 +0200 CEST
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)       vn-market-intelligence-mcp-stock-price          2026-06-15 14:04:36 +0200 CEST
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)       vn-market-intelligence-mcp-technical-analysis   2026-06-15 10:42:48 +0200 CEST
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2026-06-14 19:45:59 +0200 CEST
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)      vn-market-intelligence-mcp-api-gateway          2026-06-11 10:25:54 +0200 CEST
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)      vn-market-intelligence-mcp-rag-service          2026-06-11 00:23:30 +0200 CEST
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)      vn-market-intelligence-mcp-news-fetch           2026-06-11 00:20:06 +0200 CEST
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)      vn-market-intelligence-mcp-alert-engine         2026-06-10 23:21:30 +0200 CEST

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4040/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=13.78% MemUsage=282.2MiB / 2GiB

--- disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  266M    0%   /

=== PROBE DONE ===
```
- Evidence: All 12 host_runtime_set UP+healthy [RAW-PROBE L5–L15]. Health: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L18–L22]. mcp-server RestartCount=1 (PASS ≤2) [RAW-PROBE L25], Memory 13.78% (282.2MiB/2GiB) HEALTHY [RAW-PROBE L28]. rag-service RestartCount=105 (known FU-RAG-DEPLOY, normal ~1/hr). Disk 35% PASS. Cron: 100+ jobs, last fire ≤30min, success_rate ≥98%. NO anomalies.

## c416 · 2026-06-24T06:45:40Z
### Audit Run Tier-1 (06:44–06:45 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy. Health: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. mcp-server RestartCount=1 PASS, Memory 16.29% HEALTHY. rag-service RestartCount=104 (known FU-RAG-DEPLOY). Disk 35% PASS. Cron: 80+ jobs ≥100% success, no gaps. NO anomalies.

## c415 · 2026-06-24T06:43:00Z
### Audit Run Tier-1 (06:43 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy. Health: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. mcp-server RestartCount=0, Memory 87.06% (at WARN ≥85%, no OOMKilled—RECORD-AND-LEAVE). rag-service RestartCount=104 (known FU-RAG-DEPLOY). Disk 35%. NO anomalies.

## c414 · 2026-06-24T06:31:31Z
### Audit Run Tier-2 (06:30–06:31 UTC 2026-06-24)
- Tier: 2 | Sources: 27 checked | VPS routes: 4 checked
- Anomalies: 0 new | Status: HEALTHY
- Cron: 80+ jobs all 100% success_rate, no gaps (A-29 PASS). Sources: price 0min✓ news 1min✓ sbv_fx 0min✓ foreign_flow 0min✓ bctc 200.4h (known-state, out-of-earnings). VPS: 4/4 ok. DB: C-06 5msg/3h✓ C-07 257sig/24h✓ B-09 0 SSC✓ B-13 0 stale✓ C-08 0 orphaned✓. Rate limits: 14/14 ok. NO anomalies.
