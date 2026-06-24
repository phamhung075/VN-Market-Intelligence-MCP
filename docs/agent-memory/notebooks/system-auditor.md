# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c395 · 2026-06-24T00:30:27Z
### Audit Run Tier-3 (00:30 UTC 2026-06-24)
- Tier: 3 | Services: 12 checked | DB checks: C-01 to C-16 + schema validation
- Anomalies: 0 new (C critical, W warn, I info) | Status: HEALTHY
- Evidence: A-22/23/24 tooling all PASS (pdftoppm, tesseract, vie lang present). A-25–A-28 inter-service: all 4 health checks 200 PASS. A-31 EPIPE=0 PASS. B-08 PDF landing=80 files PASS. C-01 watchlist=708 distinct codes (threshold ≥25) PASS. C-02 OHLCV rows=708 PASS. C-03 Q1 FY2026 reports=32 (≥26) PASS. C-04 low-confidence=0 (≤5) PASS. C-05 SSC portal URLs=0 PASS. C-06 market messages (3h)=0 expected closed-market PASS. C-07 agent signals (24h)=220 PASS. C-08 orphaned alerts=0 PASS. C-09 macro indicators=3 (≥3, API-gated threshold) PASS. C-10 failed PDFs (24h)=0 PASS. C-11 done PDFs (48h)=0 out-of-earnings-window expected. C-12 integrity_check=ok PASS. C-13 WAL sizes: market.db-wal=1.34MB, pdf_extractor.db-wal absent PASS. C-14 top-3 concentration=0.4% (<60%) PASS. C-15 schema=all 4 required cols PASS. C-16 stale pending=0 PASS. Cron health 100+ jobs: all success_rate 0.98–1.00. No new CRITICAL/WARN/INFO anomalies. All dedup-known patterns accounted for.

## c394 · 2026-06-24T00:13:38Z
### Audit Run Tier-1 (00:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L16]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L21-L25]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0 (optimal), Memory 57.19% (1.144GiB / 2GiB, healthy). Disk 35% (26Gi avail / 233Gi) PASS. 100+ cron jobs all firing (success_rate 0.98–1.00). VN market closed (expected empty prices). NO new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T00:13:15Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)   vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)    vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)    vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)    vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)    vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)   vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 6 hours (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)   vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)   vn-market-intelligence-mcp-alert-engine         13 days ago
headroom-proxy                                    Up 11 days             headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 13 days (healthy)   mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=57.19% MemUsage=1.144GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  269M    0%   /

=== PROBE DONE ===
```

## c393 · 2026-06-23T23:44:00Z
### Audit Run Tier-1 (23:43–23:44 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L17]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L22-L26]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 49.32% (1010MiB / 2GiB, healthy). Disk 36% (25Gi avail) PASS. 100+ cron jobs firing. No new signals emitted.

## c392 · 2026-06-23T23:13:37Z
### Audit Run Tier-1 (23:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy. Health endpoints all 200. A-20 pdf-extractor multi-probe 3/3 PASS. mcp-server RestartCount=0, Memory 45.08%, Disk 35% PASS.
