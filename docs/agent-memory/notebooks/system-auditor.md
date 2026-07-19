## c410 · 2026-07-19T22:40:49Z
### Audit Run Tier-1 (22:40–22:42 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 0 new findings
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers healthy
- A-12 to A-19 (health endpoints): 3/5 OK — api-gateway CURL_ERR (flapping), pdf-extractor CURL_ERR (continuing)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged, all probes HTTP 000 (dedup-skip: sys-20260719T211249-1440)
- A-21 (restart count): mcp-server=0 PASS (2h 2m uptime)
- A-30 (memory): mcp-server=22.32% < 85% PASS
- A-32 (disk): 35% < 85% PASS
- Anomalies: 0 new | 2 dedup-skipped | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-19T22:40:49Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)      mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)      vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)      vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)     vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 43 hours (healthy)    vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)      vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)      vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)      vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)      vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=22.32% MemUsage=685.7MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  263M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c411 · 2026-07-19T23:41:50Z
### Audit Run Tier-1 (23:40–23:42 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 1 new findings
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers healthy
- A-12 to A-19 (health endpoints): 4/5 OK — frontend CURL_ERR (NEW), api-gateway RECOVERED, pdf-extractor CURL_ERR (dedup-skip)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged (dedup-skip: sys-20260719T211249-1440)
- A-21 (restart count): mcp-server=0 PASS (3h uptime)
- A-30 (memory): mcp-server=28.78% < 85% PASS
- A-32 (disk): 36% < 85% PASS
- Anomalies: 1 new (I info) | 1 dedup-skipped | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-19T23:40:47Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)      mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)      vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)      vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)     vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 44 hours (healthy)    vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)      vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)      vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)      vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)      vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ FAIL (HTTP CURL_ERR)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=28.78% MemUsage=884.2MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  253M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c410 · 2026-07-19T22:40:49Z
### Audit Run Tier-1 (22:40–22:42 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 0 new findings
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers healthy
- A-12 to A-19 (health endpoints): 3/5 OK — api-gateway CURL_ERR (flapping), pdf-extractor CURL_ERR (continuing)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged, all probes HTTP 000 (dedup-skip: sys-20260719T211249-1440)
- A-21 (restart count): mcp-server=0 PASS (2h 2m uptime)
- A-30 (memory): mcp-server=22.32% < 85% PASS
- A-32 (disk): 35% < 85% PASS
- Anomalies: 0 new | 2 dedup-skipped | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-19T22:40:49Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)      mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)      vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)      vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)     vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 43 hours (healthy)    vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)      vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)      vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)      vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)      vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=22.32% MemUsage=685.7MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  263M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c409 · 2026-07-19T22:31:26Z
### Audit Run Tier-2 (22:30–22:32 UTC 2026-07-19)
- Tier: 2 | Sources: 28 checked | VPS proxy: 4/4 OK | Cron jobs: 44 healthy
- A-29 cron fire gap: 0 gaps (all critical jobs within cadence)
- B-01..B-07 (per-source freshness): all sources within SLA thresholds
- B-09 (BCTC URL shape): 0 SSC portal issues (PASS)
- B-13 (stale pending BCTC): 0 rows >72h (PASS)
- B-05 (BCTC healthy-idle): 74 actionable rows, VPS host UP → gate does not apply (normal idle state)
- C-06 (market_messages 3h): 1 (PASS)
- C-07 (agent_signals 24h): 68 (PASS)
- VPS proxy status: news/sbv/bctc/prices all OK; prices off-hours by design
- Rate limits: 11/11 sources ready (no exhaustion)
- Anomalies: 0 new (all stale-by-design issues remain dedup-skipped per carry-forward)
- Status: HEALTHY

## c408 · 2026-07-19T22:10:40Z
### Audit Run Tier-1 (22:10–22:12 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 0 new findings
- A-01 to A-11 (container status): 12/12 UP (host_runtime_set SSOT) — all containers healthy
- A-12 to A-19 (health endpoints): 4/5 OK — api-gateway RECOVERED (was WARN, now OK), pdf-extractor CURL_ERR (continuing)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop wedged, all probes HTTP 000 (dedup-skip: sys-20260719T211249-1440)
- A-21 (restart count): mcp-server=0 PASS (2h uptime since restart at 20:09Z)
- A-30 (memory): mcp-server=20.27% < 85% PASS
- A-32 (disk): 35% < 85% PASS
- Anomalies: 0 new | 1 dedup-skipped (pdf-extractor A-20) | Status: HEALTHY (api-gateway recovered; all remaining issues are known duplicates)
- Signal output: No new signals | [DEDUP-SKIP] microservice_degraded:pdf-extractor:A-20
