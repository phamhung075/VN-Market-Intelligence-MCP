# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c344 · 2026-06-23T00:43:17Z
### Audit Run Tier-1 (00:43 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–17]. All 5 health endpoints HTTP 200 [RAW-PROBE L21–25]. Memory 33.60% PASS. Restart count=1. Disk 35% PASS.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T00:43:01Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           23 hours ago
vn-market-intelligence-mcp-frontend-1             Up 27 hours (healthy)   vn-market-intelligence-mcp-frontend             27 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)    vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)    vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 12 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=33.60% MemUsage=688.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  263M    0%   /

=== PROBE DONE ===
```
## c343 · 2026-06-23T00:30:16Z
### Audit Run Tier-3 (00:30 UTC 2026-06-23)
- Tier: 3 | Services: 12 | Runtime checks: A-22–A-31 all PASS | DB checks: C-01–C-16
- Anomalies: 2 WARN (C-06 market_messages stale, C-11 pdf extractions absent) | Status: DEGRADED
- C-01 distinct tickers=764 PASS | C-02 ohlcv rows=764 PASS | C-03 financial actions=32 PASS | C-04 low-conf=0 PASS | C-05 ssc-urls=0 PASS
- C-06 market_msg 3h=0 WARN | C-07 agent_signals 24h=165 PASS | C-08 orphan-alerts=0 PASS | C-09 macro-cols=3 PASS
- C-10 pdf-fail=0 PASS | C-11 pdf-done 48h=0 WARN | C-12 integrity all ok PASS | C-13 WAL <50MB PASS
- C-14 ticker-concentration=0.4% PASS | C-15 schema present PASS | C-16 stale-bctc=0 PASS
- A-22 pdftoppm PASS | A-23 tesseract PASS | A-24 tesseract-vie PASS | A-25–A-28 all services reachable PASS | A-31 epipe=0 PASS | B-08 pdf-landing=80 PASS
