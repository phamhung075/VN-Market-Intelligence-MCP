

## c44a0912 · 2026-07-23T03:11:13Z
### Audit Run Tier-1 (03:10 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 91.25% (2.738 GiB / 3 GiB) ⚠️ WARN — recurring post-restart
- A-20 pdf-extractor multi-probe: 3/3 PASS
- Restart count: 0 | Disk: 29% used
- Anomalies: 1 new (A-30 recurring mem-pressure, sys-20260723T031220-42fc)
- Status: DEGRADED
- Corroboration: memory climbed from 80.06% (02:42) to 91.25% (03:11) in ~30min — genuine sustained leak, not false-spike. Container uptime 9h indicates recent OOM-kill restart. Previous CRITICAL escalation (2026-07-21T23:26Z) noted imminent OOM with sustain→kill→restart→sustain pattern. Stale-image mem-leak persists post-restart.
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T03:11:13Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)    vn-market-intelligence-mcp-mcp-server           9 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 35 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        35 hours ago
mcp-gateway                                       Up 7 days (healthy)     mcpservergatway-gateway                         7 days ago
vn-market-intelligence-mcp-frontend-1             Up 7 days (healthy)     vn-market-intelligence-mcp-frontend             7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)     vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 7 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)    vn-market-intelligence-mcp-rag-service          7 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=91.25% MemUsage=2.738GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    29%    393k  346M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## d4-auto · 2026-07-23T03:00:04.331Z
D4 candidates: none

## c4774507 · 2026-07-23T02:42:11Z
### Audit Run Tier-1 (02:40 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 80.06% (2.402 GiB / 3 GiB), Disk: 29% used
- A-20 pdf-extractor multi-probe: 3/3 PASS
- Restart count: 0 | Circuit breakers: 15 OK, 1 HALF (polymarket)
- Anomalies: 0 new
- Status: HEALTHY
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T02:40:48Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)    vn-market-intelligence-mcp-mcp-server           9 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 35 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        35 hours ago
mcp-gateway                                       Up 7 days (healthy)     mcpservergatway-gateway                         7 days ago
vn-market-intelligence-mcp-frontend-1             Up 7 days (healthy)     vn-market-intelligence-mcp-frontend             7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)     vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 7 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)    vn-market-intelligence-mcp-rag-service          7 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=80.06% MemUsage=2.402GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    29%    393k  346M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

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
