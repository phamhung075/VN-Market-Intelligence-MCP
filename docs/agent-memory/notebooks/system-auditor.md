# System Auditor Notebook

## c392 · 2026-06-19T17:39:34Z
### Audit Run Tier-1 (17:39–17:40 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 1 CRITICAL (mcp-server memory spike) | Dedup: 0 skipped
- Status: CRITICAL — mcp-server memory pressure escalation
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L13]
- A-12..A-19 health endpoints: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓ [RAW-PROBE L15-L19]
- A-20 pdf-extractor multi-probe: 3/3 in-container HTTP 200 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓ [RAW-PROBE L21]
- A-30 memory: **mcp-server 98.90%/2GB CRITICAL** ⚠️ [RAW-PROBE L24] — escalation +24.31pp from 74.59% at 17:08 in 31 minutes (trend: 74.59%→88.62%→98.90%)
- A-32 disk: 34% < 85% PASS ✓ [RAW-PROBE L26-L28]
- Signal row: sau-20260619T173934Z emitted (microservice_degraded, mcp-server, A-30, CRITICAL)
- Orch-state signal_queue row appended (now 17 active rows)
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T17:39:34Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)   vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)     vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)     vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)     vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)     vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)    vn-market-intelligence-mcp-rag-service          7 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)     vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)     vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days               headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=98.90% MemUsage=1.978GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    34%    393k  278M    0%   /

=== PROBE DONE ===
```

## c391 · 2026-06-19T17:08:03Z
### Audit Run Tier-1 (17:06–17:08 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 1 WARN (rag-service restart count climbing) | Dedup: 0 skipped
- Status: DEGRADED — WARN on rag-service restarts
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L13]
- A-12..A-19 health endpoints: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓ [RAW-PROBE L15-L19]
- A-20 pdf-extractor multi-probe: 3/3 in-container HTTP 200 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓; **rag-service=77 WARN** ⚠️ (high restart count, healthy=true, OOMKilled=false)
- A-30 memory: mcp-server 74.59%/2GB PASS ✓; **rag-service 99.82%/768MB WARN** ⚠️ (at ceiling but healthy)
- A-32 disk: 35% < 85% PASS ✓ [RAW-PROBE L26-L28]
- Signal row: sau-20260619T170803Z emitted (microservice_degraded, rag-service, A-21, WARN)
- Orch-state signal_queue row appended
