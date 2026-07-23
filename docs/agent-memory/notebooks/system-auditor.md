

## c7e9f2a1 · 2026-07-23T02:31:49Z
### Audit Run Tier-2 (02:31 UTC 2026-07-23)
- Tier: 2 | Sources checked: 6 | VPS routes: 5
- Cron health: 1 crashed (alertDigestJob), others PASS
- SLA breaches: bctc 3641m > 120m, foreign-flow 2842m > 10m
- DB spot: C-06=3, C-07=211, B-09=0, B-13=0 → PASS
- VPS services: 3 unhealthy (bctc, foreign-flow, price); 2 healthy (news, sbv)
- Anomalies: 1 new (B-06 VPS health) | 1 dedup-skip (B-05 BCTC)
- Status: DEGRADED

## c0fdb6c95 · 2026-07-23T01:40:57Z
### Audit Run Tier-1 (01:40 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked, 5 health endpoints
- Memory: mcp-server 76.84% (2.305 GiB / 3 GiB), Disk: 29% used
- A-20 pdf-extractor multi-probe: 3/3 PASS
- Restart count: 0 | System uptime: 7h 52m 43s
- Anomalies: 0 new
- Status: HEALTHY
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T01:40:57Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)    vn-market-intelligence-mcp-mcp-server           8 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 34 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        34 hours ago
mcp-gateway                                       Up 7 days (healthy)     mcpservergatway-gateway                         7 days ago
vn-market-intelligence-mcp-frontend-1             Up 7 days (healthy)     vn-market-intelligence-mcp-frontend             7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)     vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 7 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 8 hours (healthy)    vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)     vn-market-intelligence-mcp-alert-engine         7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    7 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=76.84% MemUsage=2.305GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    29%    393k  347M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## cc84767309 · 2026-07-23T00:41:49Z
### Audit Run Tier-1 (HH:MM–HH:MM UTC 2026-07-23)
- Tier: 1 | Services: 13 checked (12 in host_runtime_set + mcp-gateway), 5 health endpoints
- Memory: mcp-server 69.49% (2.085 GiB / 3 GiB), Disk: 29% used (< 85%)
- A-20 pdf-extractor multi-probe: 3/3 PASS
- Restart count: 0 | System uptime: 6h 52m 40s
- Anomalies: 0 new
- Status: HEALTHY
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T00:41:07Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 7 hours (healthy)    vn-market-intelligence-mcp-mcp-server           7 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 33 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        33 hours ago
mcp-gateway                                       Up 7 days (healthy)     mcpservergatway-gateway                         7 days ago
vn-market-intelligence-mcp-frontend-1             Up 7 days (healthy)     vn-market-intelligence-mcp-frontend             7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)     vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 7 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)    vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)     vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)     vn-market-intelligence-mcp-alert-engine         7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    7 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=69.49% MemUsage=2.085GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    29%    393k  349M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c0077263 · 2026-07-23T00:31:44Z
### Audit Run Tier-3 (00:31 UTC 2026-07-23)
- Tier: 3 | Runtime (Tier-1): 12 containers UP, 5 health endpoints 200 OK
- Doc/Memory audit: Steps 1-6 all PASS (CLAUDE.md 62L, task_board 0, WAL 4.1MB)
- DB Integrity (C-01 to C-16): C-02=51 rows, C-03=45 codes, C-07=182 signals, PRAGMA=ok
- Off-hours note: C-01=0 codes, C-06=0 messages (expected before market open 09:00 VN)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T00:31:44Z ===

--- docker ps -a ---
All 12 containers UP (healthy status)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=69.08% MemUsage=2.072GiB / 3GiB

--- disk df -h / ---
Filesystem: 233Gi Size, 13Gi Used, 33Gi Avail, 29% Capacity

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```
