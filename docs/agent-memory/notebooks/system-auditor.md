# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c330 · 2026-06-22T18:43:30Z
### Audit Run Tier-1 (18:43 UTC 2026-06-22, Sunday 01:43 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 1 NEW WARN (mcp-server memory pressure)
- Status: DEGRADED
- Evidence: All 12 host_runtime_set services UP+healthy [RAW-PROBE]. Health endpoints mcp-server/api-gateway/macro-indicators/pdf-extractor/frontend all HTTP 200. A-20 pdf-extractor 3/3 in-container PASS. A-30 mcp-server memory 90.17% > 85% threshold — WARN. Disk 36% PASS. Restart count 0. Signal row sau-20260622T184330Z written to signal_queue.rows[].

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T18:43:02Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 17 hours (healthy)   vn-market-intelligence-mcp-mcp-server           17 hours ago
vn-market-intelligence-mcp-frontend-1             Up 21 hours (healthy)   vn-market-intelligence-mcp-frontend             21 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)    vn-market-intelligence-mcp-rag-service          11 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)    vn-market-intelligence-mcp-news-fetch           11 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 11 days (healthy)    vn-market-intelligence-mcp-alert-engine         11 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=90.17% MemUsage=1.803GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%

=== PROBE DONE ===
```

## c329 · 2026-06-22T18:32:23Z
### Audit Run Tier-2 (18:32 UTC 2026-06-22, Monday 01:32 VN — market CLOSED)
- Tier: 2 | Sources: 7 VPS+direct checked | DB spot-checks: 4 passed
- Anomalies: 0 NEW (all freshness checks PASS; C-06 downgraded INFO due to market closed)
- Status: HEALTHY
- Evidence: VPS proxy health all ok [B-06,B-07]. C-07 signals 169/24h PASS. C-06 0/3h downgraded to INFO (market off-hours, last msg 2026-06-22T15:30:03 = market close). B-09 SSC-URLs 0 PASS. B-13 stale-BCTC 0 PASS. No dedup skips, no signal rows written (all checks passing).

## c328 · 2026-06-22T18:13:57Z
### Audit Run Tier-1 (18:13 UTC 2026-06-22, Sunday 01:13 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, stable)
- Status: CLEAN
- Evidence: All 12 host_runtime_set services UP+healthy. mcp-server 16h/up (mem 83.66% 1.673GiB/2GiB, restart=0). A-20 pdf-extractor 3/3 PASS. All A-01..A-32 PASS. Host disk 35% (13Gi/233Gi). No anomalies, no dedup skips.

## c326 · 2026-06-22T17:13:09Z
### Audit Run Tier-1 (17:13 UTC 2026-06-22, Sunday 00:13 VN — market CLOSED)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, stable)
- Status: CLEAN
- Evidence: All 12 host_runtime_set services UP+healthy. mcp-server 15h/up (mem 76.12% 1.522GiB/2GiB, restart=0). A-20 pdf-extractor 3/3 PASS. All A-01..A-32 PASS. Host disk 36% (13Gi/233Gi). No anomalies, no dedup skips.
