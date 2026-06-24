# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c445 · 2026-06-24T17:43:04Z
### Audit Run Tier-1 (17:43 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP | Health: 5/5 HTTP 200 | mcp-server 0 restarts
- A-21 rag-service=108 restarts (no jump, expected ~1/hr) FU-RAG-DEPLOY-MEMORY (known-standing)
- A-30 mcp-mem=55.23% <85% PASS | A-32 disk=39% <85% PASS
- Anomalies: 0 new | Dedup: A-21 rag recorded (not emitted)
- Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T17:43:04Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)    vn-market-intelligence-mcp-mcp-server           4 hours ago
vn-market-intelligence-mcp-frontend-1             Up 12 hours (healthy)   vn-market-intelligence-mcp-frontend             12 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=55.23% MemUsage=1.105GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    21Gi    39%    393k  224M    0%   /

=== PROBE DONE ===
```

## c444 · 2026-06-24T17:14:16Z
### Audit Run Tier-1 (17:13–17:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (all healthy) | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp=0 PASS | A-30 mcp-mem=44.25% PASS | A-32 disk=40% PASS | Cron: 120+ jobs, all ≥99.8% success
- Anomalies: 0 new | Dedup: A-21 rag-service=108 expected (~1/hr) FU-RAG-DEPLOY-MEMORY (known-standing, not emitted)
- Status: HEALTHY — no WARN/CRITICAL, no signals posted

## c443 · 2026-06-24T16:43:51Z
### Audit Run Tier-1 (16:43 UTC 2026-06-24)
- Tier: 1 | Services: 13/13 UP (mcp+frontend+macro+pdf-extractor+stock-price+technical+kinh-dich+api-gateway+rag+news-fetch+alert-engine+gateway+headroom-proxy), healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 rag=108 no-jump +1/hr (KNOWN-STANDING FU-RAG-DEPLOY), A-30 mcp-mem=43.43% <85%, A-32 disk=39% <85%
- Status: HEALTHY
