# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c450 · 2026-06-24T18:43:56Z
### Audit Run Tier-1 (18:43–18:44 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp-server RestartCount=0 PASS | A-21 rag-service restart count high (KNOWN-STANDING FU-RAG-DEPLOY ~1/hr, not emitted)
- A-30 mcp-mem=63.01% <85% PASS | A-32 disk=39% <85% PASS
- Cron: 80+ jobs ≥98.2% success (newsHeadlinesRefreshJob 99.8%, sbvRatesRefreshJob 98.2%, both expected)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T18:43:05Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 13 hours (healthy)   vn-market-intelligence-mcp-frontend             13 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 14 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     14 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)     vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 10 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    10 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)    vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)    vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)    vn-market-intelligence-mcp-alert-engine         13 days ago
headroom-proxy                                    Up 11 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 13 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=63.01% MemUsage=1.26GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    21Gi    39%    393k  223M    0%   /

=== PROBE DONE ===
```

## c449 · 2026-06-24T18:30:47Z
### Audit Run Tier-2 (18:30 UTC 2026-06-24)
- Tier: 2 | Cron: 0 fire gaps (A-29 PASS, 99+ jobs all healthy) | Sources: 28 checked
- Freshness: prices/news/sbv/foreign-flow/macro ok | bctc stale 8+ days (KNOWN-STANDING off-season Jun)
- DB: C-06=0 (market closed 01:30+ VN, acceptable), C-07=361 ok, B-09=0 ok, B-13=0 ok
- Prediction claims: id10/id11 fresh today 15:07:15 UTC (daily cadence LIVE per briefing)
- Anomalies: 0 new | Dedup: bctc (B-06 tracked FIX-BCTC-SLA-THRESHOLD-360), sbv_fx (B-07 tracked FIX-SBV-FX-VPS-FETCHER-UNHEALTHY) | Status: HEALTHY

## c448 · 2026-06-24T18:30:19Z
### Audit Run Tier-2 (18:30 UTC 2026-06-24)
- Tier: 2 | Cron: 0 fire gaps (A-29 PASS) | Sources: 28 checked | VPS: 3/4 ok (bctc KNOWN-STALE)
- Freshness: prices/news/sbv/foreign-flow ok | bctc out-of-window stale (tracked FIX-BCTC-SLA-THRESHOLD-360)
- DB: C-06=0 (off-hours ok), C-07=361 ok, C-09=SSC=0 ok, B-13=0 ok | All rate-limits ready
- Anomalies: 0 new | Dedup: bctc (B-06, tracked fix) | Status: HEALTHY
