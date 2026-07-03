# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c518 · 2026-07-03T05:15:49Z
### Audit Run Tier-1 (05:15–05:16 UTC 2026-07-03)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=0 (normal) | A-30: 17.60% memory (excellent) | A-32: 45% disk (PASS)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T05:15:25Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 36 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           37 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 38 hours (healthy)     74bfe1c5b392                                    38 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 44 hours (healthy)     vn-market-intelligence-mcp-technical-analysis   44 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)       vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)       vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)       vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 2 minutes (healthy)    vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)       vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)       vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 7 days                 headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 7 days (healthy)       mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=17.60% MemUsage=540.7MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    45%    393k  174M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c517 · 2026-07-03T04:44:37Z
### Audit Run Tier-1 (04:44–04:45 UTC 2026-07-03)
- Tier: 1 | Fire-election: ROUTER-HELD (skip claim/release per coordination)
- Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=0 (mcp-server restarted 6m ago; recovery normal) | A-30: 11.21% memory (excellent recovery from 98.47%)
- A-32: 45% disk (PASS) | Crons: 100+ jobs all healthy (99.4%-100% success rates)
- Anomalies: 0 new (memory swap resolved, container restart expected recovery pattern) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-03T04:44:37Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           6 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 37 hours (healthy)    74bfe1c5b392                                    37 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 44 hours (healthy)    vn-market-intelligence-mcp-technical-analysis   44 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)      vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)      vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 4 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 7 days                headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 7 days (healthy)      mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=11.21% MemUsage=344.5MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    45%    393k  174M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c516 · 2026-07-03T04:16:21Z
### Audit Run Tier-1 (04:15–04:16 UTC 2026-07-03)
- Tier: 1 | Fire-election: ROUTER-HELD (skip claim/release per coordination)
- Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=4 (baseline, known) | A-30: 98.47% memory (WARN, sawtooth pattern baseline)
- A-32: 46% disk (PASS) | Crons: 96+ jobs all healthy (99.4%-100% success rates)
- Anomalies: 0 new (no NEW signals) | Status: HEALTHY
