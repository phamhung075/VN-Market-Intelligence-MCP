# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c8f3b5d · 2026-07-22T01:41:09Z
### Audit Run Tier-1 (01:41–01:42 UTC 2026-07-22)
- Tier: 1 | Services: 13 checked (all host_runtime_set) | Container status: 13 UP (all healthy)
- Health endpoints: 5 OK (all recovered from 01:40Z api-gateway failure)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: 99.86% (CONVERGE-benign, GC sawtooth pattern) | A-32 Disk: 27% PASS
- Health-3000 multi-probe: 5/5 PASS (no transient failures detected under memory pressure)
- Anomalies: 0 new (transient api-gateway recovery from 01:40Z) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-22T01:41:09Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)     vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 10 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        10 hours ago
mcp-gateway                                       Up 6 days (healthy)       mcpservergatway-gateway                         6 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)       vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)       vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)       vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 36 minutes (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)       vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)       vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)       vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)       vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.86% MemUsage=2.996GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    37Gi    27%    393k  390M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

--- mcp-server health-3000 multi-probe (A-30 discriminator) ---
[PROBE-1 2026-07-22T01:41:42Z] HTTP response: 200
[PROBE-2 2026-07-22T01:41:45Z] HTTP response: 200
[PROBE-3 2026-07-22T01:41:47Z] HTTP response: 200
[PROBE-4 2026-07-22T01:41:49Z] HTTP response: 200
[PROBE-5 2026-07-22T01:41:51Z] HTTP response: 200
[health-3000] pass_count=5/5 — endpoint stable under memory pressure
```

## c8f3b5d · 2026-07-22T01:41:09Z
### Audit Run Tier-1 (01:40–01:41 UTC 2026-07-22)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 4 OK / 1 FAIL (api-gateway:4000/health CURL_ERR — NEW ANOMALY)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: 96.05% (CONVERGE-benign) | A-32 Disk: 27% PASS
- Anomalies: 1 new CRITICAL (A-01: api-gateway health check failed) | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-22T01:40:48Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)     vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 10 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        10 hours ago
mcp-gateway                                       Up 6 days (healthy)       mcpservergatway-gateway                         6 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)       vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)       vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)       vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 36 minutes (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)       vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)       vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)       vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)       vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=96.05% MemUsage=2.881GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    37Gi    27%    393k  390M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

## c8f3b5d · 2026-07-22T01:11:42Z
### Audit Run Tier-1 (01:11–01:12 UTC 2026-07-22)
- Tier: 1 | Services: 13 checked (all host_runtime_set) | Container status: 13 UP (all healthy)
- Health endpoints: 5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: 99.24% (CONVERGE-benign, GC sawtooth + no OOMKilled) | A-32 Disk: 27% PASS
- Anomalies: 0 new | Status: HEALTHY
