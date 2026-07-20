
## c427 · 2026-07-20T07:11:01Z
### Audit Run Tier-1 (07:11:01–07:11:50 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 findings (0 new + 2 dedup-skipped)
- A-01 to A-11 (container status): 12/12 UP (all healthy or marked unhealthy)
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (dedup)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (dedup: last=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=19.59% < 85% PASS (uptime ~1h, climbing from 8.26%→16.11%→19.59%, benign trend)
- A-32 (disk): 36% < 85% PASS
- System status: mcp-server fresh restart 1h ago, all circuits OK, 61/63 crons healthy (bctcReparseJob running)
- Anomalies: 0 new | 2 dedup-skipped (A-13, A-20) | Status: DEGRADED (pdf-extractor endpoint down + event-loop stall ongoing)
- Signals emitted: A-13 (SKIP-dedup id=sys-20260720T071212-53b5), A-20 (SKIP-dedup id=sys-20260720T071219-0f5e)

## c426 · 2026-07-20T06:42:37Z
### Audit Run Tier-1 (06:41:00–06:42:37 UTC 2026-07-20)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 2 findings (0 new + 2 dedup-skipped)
- A-01 to A-11 (container status): 12/12 UP (all healthy or marked unhealthy)
- A-12 to A-19 (health endpoints): 4/5 OK — pdf-extractor CURL_ERR (dedup)
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — event loop stall (dedup: last=2026-07-19T20:46:16Z)
- A-21 (restart count): mcp-server=1 PASS (≤2 threshold)
- A-30 (memory): mcp-server=16.11% < 85% PASS (fresh restart ~39m uptime, climbing from 8.26% at 06:11Z)
- A-32 (disk): 36% < 85% PASS
- System status: api-gateway recovered (FAIL→OK since 06:12:28Z run), all circuits OK, 61/63 crons healthy (bctcReparseJob running)
- Anomalies: 0 new | 2 dedup-skipped (A-13, A-20) | Status: DEGRADED (pdf-extractor endpoint down + event-loop stall ongoing)
- Signals emitted: A-13 (SKIP-dedup id=sys-20260720T064208-2fba), A-20 (SKIP-dedup id=sys-20260720T064214-2283)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-20T06:41:00Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 4 days (healthy)       mcpservergatway-gateway                         4 days ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)       vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)       vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        4 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 days (healthy)       vn-market-intelligence-mcp-news-fetch           4 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 38 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           4 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)       vn-market-intelligence-mcp-rag-service          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)       vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 10 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)       vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 days (healthy)       vn-market-intelligence-mcp-alert-engine         4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.11% MemUsage=495MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  261M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```
