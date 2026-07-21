# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c2e7f1 · 2026-07-21T16:41:40Z
### Audit Run Tier-1 (16:41–16:42 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy (resolved from stall)
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: 40.16% PASS (resolved from 99.75% WARN) | A-32 Disk: 26% PASS
- Cron health: All 87 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | Status: HEALTHY (improved from DEGRADED)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T16:41:20Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 31 minutes (healthy)      vn-market-intelligence-mcp-mcp-server           31 minutes ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 38 minutes (healthy)      vn-market-intelligence-mcp-pdf-extractor        38 minutes ago
mcp-gateway                                       Up 5 days (healthy)          mcpservergatway-gateway                         5 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)          vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)          vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)          ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)          vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)          vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)          vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)          vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)          vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=40.16% MemUsage=1.205GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    39Gi    26%    393k  406M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Emit Results:
- No anomalies detected — all checks PASS, status improved to HEALTHY
## c9a1f5 · 2026-07-21T15:12:51Z
### Audit Run Tier-1 (15:11–15:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (1 UNHEALTHY)
- Health endpoints: 4 OK (mcp-server, macro-indicators, frontend, api-gateway), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall (KNOWN PDF-AVAIL-02-FIX)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 99.75% WARN (spike from sawtooth) | A-32 Disk: 34% PASS
- Cron health: All 87 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | 2 dedup-skipped (A-20 last 2026-07-21T03:41:45Z, A-30 last 2026-07-19T08:11:04Z) | Status: DEGRADED
