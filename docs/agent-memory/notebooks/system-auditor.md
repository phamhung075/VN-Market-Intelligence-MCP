## c402 · 2026-07-19T10:11:40Z
### Audit Run Tier-1 (10:00–10:11 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 warnings
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-20 (health endpoints): 5/5 OK
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): WARN (mcp-server=7 > 2) — [RAW-PROBE L14] — [dedup-skip 7d]
- A-30 (memory): WARN (97.65% >= 85% threshold) — [RAW-PROBE L22]
- A-32 (disk): 34% < 85% PASS — [RAW-PROBE L25]
- Anomalies: 0 new (both dedup-skipped) | Status: DEGRADED
- Signal output: [emit-signal] SKIP-dedup A-21 id=sys-20260719T101149-792a | [emit-signal] SKIP-dedup A-30 id=sys-20260719T101150-46cb

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-19T10:12:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
mcp-gateway                                       Up 3 days (healthy)     mcpservergatway-gateway                         3 days ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)     vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        3 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 days (healthy)     vn-market-intelligence-mcp-news-fetch           3 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 18 hours (healthy)   vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 30 hours (healthy)   vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)     vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)     vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 days (healthy)     vn-market-intelligence-mcp-alert-engine         3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)     vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    3 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=7

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=97.51% MemUsage=2.925GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  285M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c400 · 2026-07-19T08:41:19Z
### Audit Run Tier-1 (08:30–08:41 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 warnings
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-20 (health endpoints): 5/5 OK
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): WARN (mcp-server=7 > 2) — [RAW-PROBE L41] — [dedup-skip 7d]
- A-30 (memory): WARN (91.88% >= 85% threshold) — [RAW-PROBE L43]
- A-32 (disk): 34% < 85% PASS — [RAW-PROBE L46]
- Anomalies: 2 warn (both dedup-skipped) | Status: DEGRADED
- Signal output: [emit-signal] SKIP-dedup A-21 id=sys-20260719T084112-0223 | [emit-signal] SKIP-dedup A-30 id=sys-20260719T084114-0a72

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-19T08:40:18Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
mcp-gateway                                       Up 3 days (healthy)     mcpservergatway-gateway                         3 days ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)     vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        3 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 days (healthy)     vn-market-intelligence-mcp-news-fetch           3 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 17 hours (healthy)   vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 29 hours (healthy)   vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)     vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)     vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 days (healthy)     vn-market-intelligence-mcp-alert-engine         3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)     vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    3 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=7

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=91.88% MemUsage=2.756GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  284M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c399 · 2026-07-19T08:10:27Z
### Audit Run Tier-1 (08:00–08:11 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 1 warning
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-20 (health endpoints): 5/5 OK
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): WARN (mcp-server=7 > 2) — [RAW-PROBE L40] — [dedup-skip 7d]
- A-30 (memory): WARN (97.80% >= 85% threshold) — [RAW-PROBE L43]
- A-32 (disk): 34% < 85% PASS — [RAW-PROBE L46]
- Anomalies: 1 new (0 critical, 1 warn, 0 info) | 1 dedup-skipped | Status: DEGRADED
- Signal output: [emit-signal] SKIP-dedup A-21 id=sys-20260719T081102-4ff3 | [emit-signal] OK A-30 id=sys-20260719T081104-59eb

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-19T08:10:27Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
mcp-gateway                                       Up 3 days (healthy)     mcpservergatway-gateway                         3 days ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)     vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        3 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 days (healthy)     vn-market-intelligence-mcp-news-fetch           3 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 16 hours (healthy)   vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 28 hours (healthy)   vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)     vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)     vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 days (healthy)     vn-market-intelligence-mcp-alert-engine         3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)     vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    3 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=7

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=97.80% MemUsage=2.934GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  284M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```
