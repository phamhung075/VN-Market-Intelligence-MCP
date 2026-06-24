# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c447 · 2026-06-24T18:15:09Z
### Audit Run Tier-1 (18:14–18:15 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp-server RestartCount=0 PASS | A-21 rag-service=108 (no jump, known-standing FU-RAG-DEPLOY ~1/hr)
- A-30 mcp-mem=57.67% <85% PASS | A-32 disk=40% <85% PASS
- Cron: 100+ jobs ≥98.2% success (sbvRatesRefreshJob 98.2% expected within range)
- Anomalies: 0 new | Dedup: A-21 rag recorded (no CRITICAL/WARN emission) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T18:14:35Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 13 hours (healthy)   vn-market-intelligence-mcp-frontend             13 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     13 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)     vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 10 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    10 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)    vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          13 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=57.67% MemUsage=1.153GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    21Gi    39%    393k  223M    0%   /

=== PROBE DONE ===
```

## c446 · 2026-06-24T18:14:09Z
### Audit Run Tier-1 (18:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp-server RestartCount=0 PASS | A-21 rag-service=108 no jump (KNOWN-STANDING ~1/hr, not emitted)
- A-30 mcp-mem=60.78% <85% PASS | A-32 disk=40% <85% PASS
- Cron: 100+ jobs ≥99.8% success, sbvRatesRefreshJob 98.2% (expected, within range)
- Anomalies: 0 new | Dedup: A-21 rag recorded (no CRITICAL/WARN threshold hit) | Status: HEALTHY
