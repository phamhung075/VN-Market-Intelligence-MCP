# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c391 · 2026-07-21T06:41:59Z
### Audit Run Tier-1 (06:40–06:41 UTC 2026-07-21)
- Tier: 1 | Services: 13 checked (all host_runtime_set) | Container status: 12 UP, 1 UNHEALTHY
- Health endpoints: 3 OK (mcp-server, api-gateway, macro-indicators), 2 FAIL (pdf-extractor CURL_ERR, frontend CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall suspected
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 42.7% PASS | A-32 Disk: 35% PASS
- Anomalies: 0 new | 3 dedup-skipped (A-11, A-12, A-20 all seen in past 7d) | Status: DEGRADED
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T06:40:50Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 5 days (healthy)       mcpservergatway-gateway                         5 days ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)       vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        5 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 5 days (healthy)       vn-market-intelligence-mcp-news-fetch           5 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)      vn-market-intelligence-mcp-mcp-server           5 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 days (healthy)       vn-market-intelligence-mcp-rag-service          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 34 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 5 days (healthy)       vn-market-intelligence-mcp-alert-engine         5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ FAIL (HTTP CURL_ERR)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=42.71% MemUsage=1.281GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  262M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c390 · 2026-07-21T06:31:18Z
### Audit Run Tier-2 (06:30–06:31 UTC 2026-07-21)
- Tier: 2 | Cron fire check: A-29 PASS (no major gaps) | Sources checked: 27
- Per-source freshness: 25 PASS, 2 STALE (foreign-flow CRITICAL, vps-services WARN)
- VPS proxy health: 2/5 healthy (bctc-fetch, foreign-flow, price-fetch down) 
- BCTC SLA eval: healthy-idle (16.7h << 151h threshold, earnings-window OUT)
- DB freshness: C-06 PASS (2 messages 3h), C-07 PASS (343 signals 24h)
- BCTC URL shape B-09: PASS (0 SSC portal URLs) 
- Stale pending BCTC B-13: PASS (0 items > 72h)
- D-BCTC-EVAL: no snapshot changes
- D-IMPROVE: 0 candidates emitted
- Anomalies: 2 new (B-02 foreign-flow CRITICAL, B-06 VPS services WARN) | 0 dedup-skipped | Status: DEGRADED


