# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c415 · 2026-06-24T06:43:00Z
### Audit Run Tier-1 (06:43 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T06:43:00Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up About an hour (healthy)   vn-market-intelligence-mcp-frontend             About an hour ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 hours (healthy)         vn-market-intelligence-mcp-macro-indicators     2 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)        vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)          vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)          vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)         vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)         vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)         vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)         vn-market-intelligence-mcp-alert-engine         13 days ago
headroom-proxy                                    Up 11 days                   headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 13 days (healthy)         mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=87.06% MemUsage=1.741GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  266M    0%   /

=== PROBE DONE ===
```
- Evidence: All 12 host_runtime_set UP+healthy [RAW-PROBE L4–L15]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L18–L22]. A-20 pdf-extractor 3/3 ✓. mcp-server RestartCount=0 [RAW-PROBE L25], Memory 87.06% (1.741GiB/2GiB, at WARN ≥85% but healthy, no OOMKilled—RECORD-AND-LEAVE A-30 per feedback_auditor_memory_pct_denominator_falsespike). rag-service RestartCount=104 (known FU-RAG-DEPLOY). Disk 35% [RAW-PROBE L32] PASS. NO anomalies emitted.

## c414 · 2026-06-24T06:31:31Z
### Audit Run Tier-2 (06:30–06:31 UTC 2026-06-24)
- Tier: 2 | Sources: 27 checked | VPS routes: 4 checked
- Anomalies: 0 new | Status: HEALTHY
- Cron health: 80+ jobs all 100% success_rate, no gaps (A-29 PASS). Per-source freshness: price 0min✓ news 1min✓ sbv_fx 0min✓ foreign_flow 0min✓ bctc 200.4h (KNOWN-STATE, out-of-earnings, no actionable pending). VPS proxy: 4/4 ok (prices, news, sbv healthy; bctc stale since 2026-06-15 but idle expected Jun—Q2 filings land Jul, tracked FIX-BCTC-SLA-THRESHOLD-360). DB freshness: C-06 5msg/3h✓ C-07 257sig/24h✓ B-09 0 SSC✓ B-13 0 stale>72h✓ C-08 0 orphaned✓. Rate limits: 14/14 ok. RECORD-AND-LEAVE B-06 dedup (same 7d window as c410).

## c413 · 2026-06-24T06:15:20Z
### Audit Run Tier-1 (06:14–06:15 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. A-20 pdf-extractor 3/3 ✓. mcp-server RestartCount=0, Memory 57.54% (1.151GiB/2GiB, healthy). rag-service RestartCount 104 (known FU-RAG-DEPLOY). Disk 35% PASS. Cron health: 80+ jobs all ≥98% success_rate. NO anomalies. Dedup: bctc stale known-standing per FIX-BCTC-SLA-THRESHOLD-360.

## c412 · 2026-06-24T06:14:38Z
### Audit Run Tier-1 (06:14 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. A-20 pdf-extractor multi-probe 3/3 ✓. mcp-server RestartCount=0, Memory 91.75% (1.835GiB/2GiB, elevated but no OOMKilled—RECORD-AND-LEAVE A-30). rag-service RestartCount 104 (known-standing FU-RAG-DEPLOY, normal ~1/hr). Disk 33% PASS. Crons: 80+ jobs all 100% success_rate, no gaps. NO anomalies emitted.

## c411 · 2026-06-24T05:44:58Z
### Audit Run Tier-1 (05:44 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. mcp-server RestartCount=0, Memory 86.94% (1.739GiB/2GiB, elevated but healthy <OOM). rag-service RestartCount=104 (known FU-RAG-DEPLOY). Disk 35% (25Gi avail) PASS. Crons: 100+ jobs all 100% success-rate, no gaps. NO new anomalies emitted.

## c410 · 2026-06-24T05:43:46Z
### Audit Run Tier-1 (05:43 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. mcp-server RestartCount=0, Memory 85.57% (1.711GiB/2GiB, elevated but no OOMKilled—RECORD-AND-LEAVE A-30 per dedup policy). rag-service up 50min (restarted 04:53Z), healthy, RestartCount 104 (known-standing FU-RAG-DEPLOY)—no spike. Disk 35% (25GiB avail). Cron health 100% success across 100+ jobs. NO new anomalies. Dedup: B-06 false CRITICAL c408 05:13Z already triaged (out-of-earnings-season BCTC stale 177h vs corrected threshold 168h; VPS HOST up, no stuck pending rows). RECORD-AND-LEAVE per FIX-BCTC-SLA-THRESHOLD-360.
