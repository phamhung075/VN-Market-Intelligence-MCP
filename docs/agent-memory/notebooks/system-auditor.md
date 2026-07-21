# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c848 · 2026-07-21T00:44:16Z
### Audit Run Tier-1 (00:42–00:44 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and running) [RAW-PROBE L4-16]
- A-12 (api-gateway health): CURL_ERR — WARN [RAW-PROBE L39], dedup-skip
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop stall [RAW-PROBE L85-92], dedup-skip
- A-21 (restart count): mcp-server=1 PASS [RAW-PROBE L56-57]
- A-30 (memory): mcp-server=93.59% WARN [RAW-PROBE L62-63] — escalating trend (75.14%→93.59% in 32min), within known-benign GC band but at upper edge, dedup-skip
- A-32 (disk): 36% < 85% PASS [RAW-PROBE L67]
- Anomalies: 0 new | 3 dedup-skipped (A-12, A-20, A-30) | Status: DEGRADED (persistent)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T00:42:36Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 5 days (healthy)       mcpservergatway-gateway                         5 days ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)       vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        5 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 5 days (healthy)       vn-market-intelligence-mcp-news-fetch           5 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 19 hours (healthy)     vn-market-intelligence-mcp-mcp-server           5 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)       vn-market-intelligence-mcp-rag-service          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 28 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 5 days (healthy)       vn-market-intelligence-mcp-alert-engine         5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=93.59% MemUsage=2.808GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  273M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c847 · 2026-07-21T00:38:19Z
### Audit Run Tier-3 (00:38:19 UTC 2026-07-21)
- Tier: 3 | Docs: OK | Memory: OK | DB checks: 16
- Doc/memory audit PASS: git log OK, MEMORY.md OK, task_board 77≤80, sprint_goal 15 entries
- DB integrity checks:
  - C-01 (OHLCV codes): 900 ≥ 25 PASS
  - C-02 (OHLCV rows): 900 > 0 PASS
  - C-03 (FIN codes Q1): 45 ≥ 26 PASS
  - C-04 (low-confidence): 11 > 5 WARN
  - C-05 (SSC URLs): 0 PASS
  - C-06 (market messages): 0 WARN
  - C-07 (agent signals): 292 PASS
  - C-08 (orphaned alerts): 1 WARN
  - C-09 (macro indicators): 3 ≥ 3 PASS
  - C-10 (failed PDFs): 0 ≤ 2 PASS
  - C-11 (completed PDFs): 0 WARN
  - C-12 (integrity): market/alert/pdf OK, stock/rag missing
  - C-13 (WAL): market 7.09MB, pdf-ext none — all < 50MB PASS
  - C-14 (top-3 share): 0.3% < 60% PASS
  - C-15 (schema): all 4 columns present PASS
  - C-16 (stale pending): 0 PASS
- Tooling: pdftoppm/tesseract/vie present; connectivity 3/4 OK (pdf-extractor timeout)
- Anomalies: 4 found (1 C-04 dedup-skip + 3 new: C-06/C-08/C-11) | Status: DEGRADED

## c846 · 2026-07-21T00:10:51Z
### Audit Run Tier-1 (00:10:51 UTC 2026-07-21)
- Tier: 1 | Services: 13 checked | Health: 5 probed
- A-01 to A-11 (container status): 13/13 UP (all deployed and running)
- A-12 to A-19 (health endpoints): 3/5 OK — api-gateway CURL_ERR (A-12), pdf-extractor CURL_ERR (A-20 override)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall persistent (all probes HTTP 000)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=75.14% WARN — **exceeds 68% threshold** (trend: 55.89%→64.65%→61.27%→63.96%→75.14%, monotonic rise last 2 cycles)
- A-32 (disk): 36% < 85% PASS
- Anomalies: 0 new | 3 dedup-skipped (A-12, A-20, A-30 within 7d) | Status: DEGRADED (persistent)
