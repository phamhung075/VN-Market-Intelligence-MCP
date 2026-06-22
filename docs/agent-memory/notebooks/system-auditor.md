# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c339 · 2026-06-22T22:43:28Z
### Audit Run Tier-1 (22:43 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–17]. All 5 health endpoints HTTP 200 [RAW-PROBE L21–25]. A-20 pdf-extractor 3/3 PASS. Memory 21.59% PASS [RAW-PROBE L31]. Restart count=1 [RAW-PROBE L33]. Disk 35% PASS [RAW-PROBE L36].

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-22T22:43:05Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)    vn-market-intelligence-mcp-mcp-server           21 hours ago
vn-market-intelligence-mcp-frontend-1             Up 25 hours (healthy)   vn-market-intelligence-mcp-frontend             25 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.59% MemUsage=442.2MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  263M    0%   /

=== PROBE DONE ===
```

## c338 · 2026-06-22T22:33:08Z
### Audit Run Tier-2 (22:33 UTC 2026-06-22)
- Tier: 2 | Market: CLOSED (05:30 VN, opens 09:00) | Checks: A-29 cron + B-06/B-07/B-08/B-09/B-13 VPS + C-06/C-07 DB
- Anomalies: 1 WARN | Status: DEGRADED (vn-sbv-fetch stale 3599s vs 2100s threshold)
- Cron health PASS: pollNews/newsHeadlines/deepFetchVps all success. BCTC queue PASS: 0 stale >72h, 0 invalid SSC URLs, 80 PDFs. DB freshness PASS: market_messages=1 (3h), agent_signals=170 (24h). VPS health: vn-news-fetch healthy; vn-sbv-fetch WARN (FX rates overdue); vn-bctc-fetch INFO (6.2d vs 168h, outside earnings window). Signal sau-2233-B07 written.

## c337 · 2026-06-22T22:13:40Z
### Audit Run Tier-1 (22:13 UTC 2026-06-22)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–17]. All 5 health endpoints HTTP 200 [RAW-PROBE L21–25]. A-20 pdf-extractor 3/3 PASS. Memory 19.60% PASS [RAW-PROBE L31]. Restart count=1 [RAW-PROBE L33]. Disk 35% PASS [RAW-PROBE L36].
