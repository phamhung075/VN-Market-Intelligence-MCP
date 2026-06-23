# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c370 · 2026-06-23T12:13:59Z
### Audit Run Tier-1 (12:13 UTC 2026-06-23)
- Tier: 1 | Services: 13 checked (12 host_runtime_set + 1 infra) | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 13 services UP+healthy. Health endpoints all 200 OK. Memory 69.95% (1.399/2GiB) PASS. Disk 37% PASS. RestartCount: mcp-server=1, rag-service=100 (known-standing chronic OOM-loop, OOMKilled=false, stable healthy state, tracked FU-RAG-DEPLOY-MEMORY + RAG-SERVICE-AVAIL-01-FIX), others=0. No acute changes vs 29min prior (c369). NO new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T12:13:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 16 hours (healthy)   vn-market-intelligence-mcp-mcp-server           34 hours ago
vn-market-intelligence-mcp-frontend-1             Up 39 hours (healthy)   vn-market-intelligence-mcp-frontend             39 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)     vn-market-intelligence-mcp-stock-price          8 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)     vn-market-intelligence-mcp-technical-analysis   8 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)     vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)    vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 11 hours (healthy)   vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)    vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)    vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 12 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1
rag-service RestartCount=100 (known-standing)

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=69.95% MemUsage=1.399GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%    393k  242M    0%   /

=== PROBE DONE ===
```

## c369 · 2026-06-23T11:44:36Z
### Audit Run Tier-1 (11:44 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 1 WARN (rag-service RestartCount=100) | Status: DEGRADED
- Evidence: All 12 services UP+healthy. A-21 ANOMALY: **rag-service RestartCount=100** (vs mcp-server=1, others=0) — significantly elevated restart pattern. Health endpoints all 200. A-20 pdf-extractor multi-probe 3/3 PASS. Inter-service connectivity OK. A-31 EPIPE 0/30m PASS. Memory 63.55% PASS. Disk 36% PASS.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T11:43:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 16 hours (healthy)   vn-market-intelligence-mcp-mcp-server           34 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 10 hours (healthy)   vn-market-intelligence-mcp-rag-service          12 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1
rag-service RestartCount=100 ← ANOMALY (A-21 WARN)

--- memory pressure ---
MemPerc=63.55% MemUsage=1.271GiB / 2GiB

--- A-31 EPIPE Crash Check (30m) ---
0

--- disk df -h / ---
Capacity: 36%

=== PROBE DONE ===
```

## c368 · 2026-06-23T11:14:36Z
### Audit Run Tier-1 (11:14 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy. Health endpoints all 200. A-20 pdf-extractor 3/3 PASS. Inter-service OK. EPIPE 0/30m. Memory 61.81%. Disk 36%.
