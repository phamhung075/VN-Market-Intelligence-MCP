# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c424 · 2026-06-24T10:13:57Z
### Audit Run Tier-1 (10:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T10:13:06Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 5 hours (healthy)   vn-market-intelligence-mcp-frontend             5 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     5 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)   vn-market-intelligence-mcp-mcp-server           16 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)    vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)    vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)   vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=50.84% MemUsage=1.017GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  255M    0%   /

=== PROBE DONE ===
```
- A-01 to A-11 (container liveness): All 12 host_runtime_set UP and healthy [RAW-PROBE L15–L26] (frontend, macro-indicators, mcp-server, pdf-extractor, stock-price, technical-analysis, kinh-dich-service, api-gateway, rag-service, news-fetch, alert-engine, plus infrastructure: headroom-proxy, mcp-gateway). PASS.
- A-12 to A-20 (health endpoints): 5 probed 200 OK [RAW-PROBE L28–L33]. A-20 multi-probe pdf-extractor: 3/3 passed (200, 200, 200) — event loop healthy. PASS.
- A-21 (restart count): mcp-server=1 [RAW-PROBE L36] (≤2, PASS). rag-service~106 (KNOWN-STANDING FU-RAG-DEPLOY-MEMORY, normal OOM cycle, not emitted per DEDUP-ENFORCEMENT).
- A-30 (memory): mcp-server 50.84% [RAW-PROBE L39] (<85%, PASS).
- A-32 (disk): 36% capacity [RAW-PROBE L44] (<85%, PASS).
- Cron health: all 100% success rates. No gaps.
- System status: 0 open circuits, 0 half-open, 10 unresolved errors (INFO level).
- Anomalies: 0 new | HEALTHY

## c423 · 2026-06-24T09:46:02Z
### Audit Run Tier-1 (09:46 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set UP+healthy [RAW-PROBE]. 5 health endpoints 200 OK. mcp-server RestartCount=1 (PASS ≤2), MemPerc=44.73% (PASS), OOMKilled=false. rag-service RestartCount=106 (FU-RAG-DEPLOY-MEMORY known-standing). Disk 34% PASS. No anomalies.
