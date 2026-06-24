# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c428 · 2026-06-24T11:13:15Z
### Audit Run Tier-1 (11:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T11:13:15Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 6 hours (healthy)   vn-market-intelligence-mcp-frontend             6 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     6 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)   vn-market-intelligence-mcp-mcp-server           17 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)    vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)    vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)   vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
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
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=53.47% MemUsage=1.069GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  256M    0%   /

=== PROBE DONE ===
```
- A-01 to A-11 (container liveness): All 12 host_runtime_set UP and healthy [RAW-PROBE]. PASS.
- A-12 to A-20 (health endpoints): 5 probed 200 OK [RAW-PROBE]. A-20 pdf-extractor multi-probe 3/3 pass [in-container HTTP 200]. PASS.
- A-21 (restart count): mcp-server=1 PASS; rag-service=106 RECORD-AND-LEAVE (FU-RAG-DEPLOY-MEMORY known-standing chronic ~1/hr OOM, no jump >+10 this cycle).
- A-30 (memory): mcp-server 53.47% at 1.069GiB/2GiB, rag-service 82.44% at 633.1MiB/768MiB cap (both PASS, no pressure). OOMKilled=false both.
- A-32 (disk): 36% capacity used, 24Gi avail (PASS).
- All crons 100% success last 7d. No anomalies. HEALTHY.

## c427 · 2026-06-24T10:43:12Z
### Audit Run Tier-1 (10:43 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Anomalies: 0 new | Status: HEALTHY

## c426 · 2026-06-24T10:32:02Z
### Audit Run Tier-2 (10:32 UTC 2026-06-24)
- Tier: 2 | Sources: 27 checked | Anomalies: 0 new | Dedup-skipped: 1 (bctc SLA out-of-season) | Status: HEALTHY
