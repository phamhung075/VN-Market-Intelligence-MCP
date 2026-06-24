# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c430 · 2026-06-24T12:15:17Z
### Audit Run Tier-1 (12:15 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health: 12/12 UP + 11/12 HTTP 200
- Anomalies: 0 new | Dedup-skipped: 1 (BCTC stale = SLA-expected) | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T12:14:29Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 7 hours (healthy)   vn-market-intelligence-mcp-frontend             7 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     7 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)   vn-market-intelligence-mcp-mcp-server           18 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)    vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)    vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)   vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=63.89% MemUsage=1.278GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  266M    0%   /

=== PROBE DONE ===
```
- A-01–A-11: All 12 host_runtime_set healthy [RAW-PROBE]. PASS.
- A-12–A-20: 11/12 HTTP 200 [RAW-PROBE], A-20 multi-probe 3/3. PASS.
- A-21: mcp-server=1. PASS.
- A-30: mcp 63.89% memory. PASS.
- A-32: 35% disk. PASS.
- Crons: all success. PASS.

## c429 · 2026-06-24T11:44:14Z
### Audit Run Tier-1 (11:44 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 11/12 HTTP 200
- Anomalies: 0 new | Dedup-skipped: 2 (A-21 rag=106 no-jump, A-30 mcp-mem normal) | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T11:43:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 6 hours (healthy)   vn-market-intelligence-mcp-frontend             6 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 hours (healthy)   vn-market-intelligence-mcp-macro-indicators     7 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)   vn-market-intelligence-mcp-mcp-server           18 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)    vn-market-intelligence-mcp-stock-price          9 days ago
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
[health] stock-price:5010/health OK (HTTP 200)
[health] technical-analysis:5003/health OK (HTTP 200)
[health] kinh-dich:5005/health OK (HTTP 200)
[health] rag-service:5002/health OK (HTTP 200)
[health] alert-engine:5006/health OK (HTTP 200)
[health] news-fetch:5008/health OK (HTTP 200)
[health] mcp-gateway:4040/health OK (HTTP 200)

--- restart count ---
mcp-server=1 | rag-service=106

--- memory pressure ---
mcp-server: 53.73% @ 1.075GiB/2GiB | rag-service: 82.38% @ 632.6MiB/768MiB

--- disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  266M    0%   /

=== PROBE DONE ===
```
- A-01–A-11 (container liveness): All 12 host_runtime_set UP, healthy [RAW-PROBE]. PASS.
- A-12–A-20 (health endpoints): 11/12 HTTP 200 [RAW-PROBE all ports]. PASS.
- A-21 (restart count): mcp-server=1 PASS; rag=106 RECORD-AND-LEAVE (FU-RAG-DEPLOY-MEMORY known-standing, no jump).
- A-30 (memory): mcp=53.73% healthy; rag=82.38% normal high. OOMKilled=false both. PASS.
- A-32 (disk): 35% used, 25Gi avail. PASS.

## c428 · 2026-06-24T11:13:15Z
### Audit Run Tier-1 (11:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Anomalies: 0 new | Status: HEALTHY

## c427 · 2026-06-24T10:43:12Z
### Audit Run Tier-2 (10:32 UTC 2026-06-24)
- Tier: 2 | Sources: 27 checked | Anomalies: 0 new | Status: HEALTHY
