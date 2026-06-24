# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c455 · 2026-06-24T21:13:59Z
### Audit Run Tier-1 (21:13–21:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp-server RestartCount=0 PASS | A-21 rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY ~1/hr, RECORD-AND-LEAVE per dedup policy)
- A-30 mcp-mem=84.13% <85% PASS | A-32 disk=39% <85% PASS | Cron: 80+ jobs ≥98.2% success rate
- Anomalies: 0 new (all known-standing) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T21:13:10Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)    vn-market-intelligence-mcp-mcp-server           8 hours ago
vn-market-intelligence-mcp-frontend-1             Up 16 hours (healthy)   vn-market-intelligence-mcp-frontend             16 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 16 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     16 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)     vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 10 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    10 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)    vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)    vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)    vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)    vn-market-intelligence-mcp-alert-engine         2 weeks ago
headroom-proxy                                    Up 12 days              headroom-proxy:local                            2 weeks ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=84.13% MemUsage=1.683GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    21Gi    39%    393k  224M    0%   /

=== PROBE DONE ===
```

A-20 Multi-Probe Results:
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```

## c454 · 2026-06-24T20:44:03Z
### Audit Run Tier-1 (20:43–20:44 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp-server RestartCount=0 PASS | A-21 rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY ~1/hr, RECORD-AND-LEAVE per dedup policy)
- A-30 mcp-mem=83.30% <85% PASS | A-32 disk=39% <85% PASS | Cron: 80+ jobs ≥98.2% success rate
- Anomalies: 0 new (all known-standing) | Status: HEALTHY

## c453 · 2026-06-24T20:13:58Z
### Audit Run Tier-1 (20:13–20:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp-server RestartCount=0 PASS | A-21 rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY ~1/hr, RECORD-AND-LEAVE per dedup policy)
- A-30 mcp-mem=75.61% <85% PASS | A-32 disk=39% <85% PASS | Cron: 80+ jobs ≥98.2% success rate
- Anomalies: 0 new (all known-standing) | Status: HEALTHY
