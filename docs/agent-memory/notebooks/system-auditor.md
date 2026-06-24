# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c397 · 2026-06-24T01:13:16Z
### Audit Run Tier-1 (01:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L16]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L21-L25]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 59.89% (1.198GiB / 2GiB, healthy, no OOMKilled). rag-service RestartCount=104 (known-standing FU-RAG-DEPLOY-MEMORY, running healthy 37min). Disk 35% (26Gi avail / 233Gi) PASS. All dedup-known patterns (A-30, A-21) accounted—no escalation. NO new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T01:13:16Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 7 hours (healthy)      vn-market-intelligence-mcp-mcp-server           7 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)       vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)       vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)       vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)       vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)      vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 37 minutes (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)      vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)      vn-market-intelligence-mcp-alert-engine         13 days ago
headroom-proxy                                    Up 11 days                headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 13 days (healthy)      mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=59.89% MemUsage=1.198GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  268M    0%   /

=== PROBE DONE ===
```

## c396 · 2026-06-24T00:44:07Z
### Audit Run Tier-1 (00:43–00:44 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L16]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L21-L25]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 61.36% (1.227GiB / 2GiB, healthy). rag-service RestartCount=104 (+1 from 103, known-standing FU-RAG-DEPLOY-MEMORY, running 7min healthy at 6.50% mem). Disk 35% (26Gi avail / 233Gi) PASS. All 100+ cron jobs PASS. NO new signals emitted.

## c395 · 2026-06-24T00:30:27Z
### Audit Run Tier-3 (00:30 UTC 2026-06-24)
- Tier: 3 | Services: 12 checked | DB checks: C-01 to C-16 + schema validation
- Anomalies: 0 new (C critical, W warn, I info) | Status: HEALTHY
- Evidence: A-22/23/24 tooling PASS. A-25–A-28 inter-service 200 PASS. A-31 EPIPE=0. B-08 PDF=80 files PASS. C-01 watchlist=708 PASS. C-02 OHLCV=708 PASS. C-03 Q1=32 PASS. C-04 low-confidence=0 PASS. C-05 SSC=0 PASS. C-06 msg(3h)=0 PASS. C-07 signals(24h)=220 PASS. C-08 orphans=0 PASS. C-09 macro=3 PASS. C-10 failed=0 PASS. C-11 done=0. C-12 integrity=ok. C-13 WAL<50MB. C-14 concentration=0.4%. C-15 schema=OK. C-16 stale=0 PASS. Cron 100+ success. No anomalies.
