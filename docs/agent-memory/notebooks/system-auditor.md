

## 228bf600 · 2026-07-23T04:11:48Z
### Audit Run Tier-1 (04:11 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 21.30% (654.4 MiB / 3 GiB) — recovered post-restart (was 92.50% at 03:42)
- A-20 pdf-extractor multi-probe: 3/3 PASS
- Restart count: 1 | Disk: 29% used
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: mcp-server restarted between 03:42Z and 04:11Z, successfully cleared memory pressure. Container uptime 3m indicates clean restart. All health endpoints OK, all services up and healthy. CircuitBreakers all OK.
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T04:11:19Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 36 hours (healthy)    vn-market-intelligence-mcp-pdf-extractor        36 hours ago
mcp-gateway                                       Up 7 days (healthy)      mcpservergatway-gateway                         7 days ago
vn-market-intelligence-mcp-frontend-1             Up 7 days (healthy)      vn-market-intelligence-mcp-frontend             7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)      vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 7 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)      vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 8 hours (healthy)     vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)      vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)      vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)      vn-market-intelligence-mcp-alert-engine         7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)      vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    7 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.30% MemUsage=654.4MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    34Gi    29%    393k  357M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## 0b0d9707 · 2026-07-23T03:42:43Z
### Audit Run Tier-1 (03:41 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 92.50% (2.775 GiB / 3 GiB) — sustained growth from 91.25% at 03:11Z
- A-20 pdf-extractor multi-probe: 3/3 PASS
- Restart count: 0 | Disk: 29% used
- Anomalies: 1 new (A-30 CRITICAL mem-pressure, sys-20260723T034235-2a44)
- Status: DEGRADED
- Corroboration: memory at 92.50%, up from 91.25% in ~30min cycle-to-cycle. Sustained growth pattern confirms memory leak. Container uptime 10h post-restart.
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T03:41:48Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)   vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 36 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        36 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=92.50% MemUsage=2.775GiB / 3GiB

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

## c44a0912 · 2026-07-23T03:11:13Z
### Audit Run Tier-1 (03:10 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 91.25% (2.738 GiB / 3 GiB) ⚠️ WARN — recurring post-restart
- A-20 pdf-extractor multi-probe: 3/3 PASS
- Restart count: 0 | Disk: 29% used
- Anomalies: 1 new (A-30 recurring mem-pressure, sys-20260723T031220-42fc)
- Status: DEGRADED
- Corroboration: memory climbed from 80.06% (02:42) to 91.25% (03:11) in ~30min — genuine sustained leak, not false-spike. Container uptime 9h indicates recent OOM-kill restart. Previous CRITICAL escalation (2026-07-21T23:26Z) noted imminent OOM with sustain→kill→restart→sustain pattern. Stale-image mem-leak persists post-restart.
