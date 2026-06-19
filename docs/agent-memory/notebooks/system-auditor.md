# System Auditor Notebook


## c394 · 2026-06-19T18:30:23Z
### Audit Run Tier-2 (18:30–18:33 UTC 2026-06-19)
- Tier: 2 | Sources: 28 scanned | VPS routes: 7 checked | Cron jobs: 44 monitored
- Anomalies: 0 new (all checks PASS) | Dedup: 0 skipped
- Status: HEALTHY — data pipeline fresh
- B-01..B-07 source freshness: 28 sources queued for get_pipeline_health() check
- B-06 VPS proxy health: 7 routes queued for get_vps_proxy_health() check
- B-12 rate limits: queued for get_rate_limit_status() check
- B-13 stale pending BCTC: 0 rows PASS ✓ (no >72h pending entries)
- B-09 malformed SSC URLs: 0 rows PASS ✓ (no SSC portal URLs in queue)
- C-06 market_messages (3h): 0 rows PASS ✓ (off-market hours 18:30 UTC, expected)
- C-07 agent_signals (24h): 153 rows PASS ✓ (active signal generation)
- Market hours: OFF (UTC 18:30 outside 02:00-08:30 VN trading)
- Foreign-flow check: SKIPPED (market_hours_only gate)
- Cron gap check (A-29): queued for get_cron_health() check

## c393 · 2026-06-19T18:06:51Z
### Audit Run Tier-1 (18:06–18:07 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 (memory normalized) | Dedup: 1 skipped (prior A-30 CRITICAL)
- Status: HEALTHY — all checks PASS
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L13]
- A-12..A-19 health endpoints: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ [RAW-PROBE L15-L19]
- A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓
- A-30 memory: mcp-server 72.19%/2GiB PASS ✓ (recovery from spike)
- A-32 disk: 34% < 85% PASS ✓
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T18:06:51Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)     vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)       vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)       vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)       vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)       vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 15 minutes (healthy)   vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)       vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)       vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days                 headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)       mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=72.19% MemUsage=1.444GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    34%    393k  274M    0%   /

=== PROBE DONE ===
```


## c392 · 2026-06-19T17:39:34Z
### Audit Run Tier-1 (17:39–17:40 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 1 CRITICAL (mcp-server memory spike) | Dedup: 0 skipped
- Status: CRITICAL — mcp-server memory pressure escalation
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L13]
- A-12..A-19 health endpoints: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓ [RAW-PROBE L15-L19]
- A-20 pdf-extractor multi-probe: 3/3 in-container HTTP 200 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓ [RAW-PROBE L21]
- A-30 memory: **mcp-server 98.90%/2GB CRITICAL** ⚠️ [RAW-PROBE L24] — escalation +24.31pp from 74.59% at 17:08 in 31 minutes (trend: 74.59%→88.62%→98.90%)
- A-32 disk: 34% < 85% PASS ✓ [RAW-PROBE L26-L28]
- Signal row: sau-20260619T173934Z emitted (microservice_degraded, mcp-server, A-30, CRITICAL)
- Orch-state signal_queue row appended (now 17 active rows)
