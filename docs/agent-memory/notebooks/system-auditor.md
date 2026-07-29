## ad265f86 · 2026-07-29T07:09:23Z
### Audit Run Tier-1 (07:00–07:09 UTC 2026-07-29)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=0 PASS | A-30 SKIP deep-probe (baseline 24.60% < 85%) | A-32 Disk 39% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY (state-change: prior Tier-1 DEGRADED→HEALTHY)

Fire-election: tick=2026-07-29T07:00Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-29T07:08:38Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-pdf-extractor-1        Up 13 hours (healthy)        vn-market-intelligence-mcp-pdf-extractor        14 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)          vn-market-intelligence-mcp-frontend             4 days ago
mcp-gateway                                       Up 13 days (healthy)         mcpservergatway-gateway                         13 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)         vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 13 days (healthy)         ghcr.io/flaresolverr/flaresolverr:latest        13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)         vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)         vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 13 days (healthy)         vn-market-intelligence-mcp-technical-analysis   13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)         vn-market-intelligence-mcp-alert-engine         13 days ago
vn-market-intelligence-mcp-stock-price-1          Up 13 days (healthy)         vn-market-intelligence-mcp-stock-price          13 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 13 days (healthy)         vn-market-intelligence-mcp-kinh-dich-service    13 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=4

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=27.37% MemUsage=840.7MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 24.60% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    22Gi    39%    393k  230M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

Verdict: All checks PASS — A-01/A-11 services UP, A-12/A-20 health OK, A-21 crashRestarts=0<2, A-30 SKIP (24.60%<85%), A-32 disk 39%<85%.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## ad265f86 · 2026-07-29T06:43:43Z
### Audit Run Tier-1 (06:30–06:43 UTC 2026-07-29)
- Tier: 1 | Services: 12/12 host_runtime_set Up(healthy) | Health: 5/5 OK | A-20 pdf-extractor 3/3 pass | A-21 crashRestarts=1 PASS | A-30 SKIP deep-probe (baseline 18.80% < 85%) | A-32 Disk 40% PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY (state-change: prior DEGRADED→HEALTHY)

Fire-election: tick=2026-07-29T06:30Z (`*/30 * * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-29T06:43:07Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-pdf-extractor-1        Up 13 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        14 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 59 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)       vn-market-intelligence-mcp-frontend             4 days ago
mcp-gateway                                       Up 13 days (healthy)      mcpservergatway-gateway                         13 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)      vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 13 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)      vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 42 minutes (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)      vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 13 days (healthy)      vn-market-intelligence-mcp-technical-analysis   13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)      vn-market-intelligence-mcp-alert-engine         13 days ago
vn-market-intelligence-mcp-stock-price-1          Up 13 days (healthy)      vn-market-intelligence-mcp-stock-price          13 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 13 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    13 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=4

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.71% MemUsage=513.4MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 18.80% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    21Gi    40%    393k  220M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

Verdict: All checks PASS — A-01/A-11 services UP, A-12/A-20 health OK, A-21 crashRestarts=1<2, A-30 SKIP (18.80%<85%), A-32 disk 40%<85%.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## ad265f86 · 2026-07-29T06:38:49Z
### Audit Run Tier-2 (06:36–06:38 UTC 2026-07-29)
- Tier: 2 | Cron health: A-29 BLOCKED (known-broken spec) | Data freshness: 11 checks (11 PASS, 0 CRITICAL)
- BCTC queue: 167 pending (within SLA threshold — 22.2h last-push < 342h dynamic threshold out-of-earnings-window)
- VPS proxy: all routes ok | Rate limits: ok | DB spot-checks C-06/C-07: ok
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 1 dedup-skipped (B-06 from 4h prior)
- Status: HEALTHY (state-change: prior Tier-2 DEGRADED→HEALTHY)

Fire-election: tick=2026-07-29T04:00Z (`0 */4 * * *` boundary) — `task_claim` returned `claimed:true`. Led this tick.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
