## c404 · 2026-07-19T11:10:43Z
### Audit Run Tier-1 (11:00–11:10 UTC 2026-07-19)
- Tier: 1 | Services: 12 checked | Health: 5 probed | 3 findings
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set) — [RAW-PROBE L5-16]
- A-12 to A-20 (health endpoints): 5/5 OK — [RAW-PROBE L32-37]
- A-20 (pdf-extractor multi-probe): 3/3 PASS — [RAW-PROBE L43-46]
- A-21 (restart count): WARN (mcp-server=7 > 2) — [RAW-PROBE L18] — [dedup-skip 7d recent]
- A-30 (memory): WARN (95.54% >= 85% threshold) — [RAW-PROBE L22] — [dedup-skip 3h recent]
- A-32 (disk): 34% < 85% PASS — [RAW-PROBE L25]
- **CRITICAL FINDING**: boardDetailsRefreshJob persistent database corruption — "database disk image is malformed" — 0/5 success rate — 2nd independent observation confirms NOT transient — affects vnstock-sync + multiple jobs — [get_cron_health report]
- Anomalies: 1 new critical (DB corruption) | 2 dedup-skipped warns | Status: CRITICAL
- Signal output: [emit-signal] OK dedup_key=database_corruption:market.db:boardDetailsRefreshJob id=sys-20260719T111146-74ec | [emit-signal] SKIP-dedup A-30 | [emit-signal] SKIP-dedup A-21

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-19T11:10:43Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
mcp-gateway                                       Up 3 days (healthy)     mcpservergatway-gateway                         3 days ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)     vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        3 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 days (healthy)     vn-market-intelligence-mcp-news-fetch           3 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 19 hours (healthy)   vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 31 hours (healthy)   vn-market-intelligence-mcp-rag-service          3 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=95.54% MemUsage=2.866GiB / 3GiB

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

### Re-Probe Analysis (2nd Observation — DB Corruption Confirmation):
```
boardDetailsRefreshJob Status (from get_cron_health):
  last_run:        2026-07-18 21:00:01
  last_status:     error
  last_error:      database disk image is malformed
  success_rate:    0.00 (0/5 successful runs)
  total_runs:      5
  avg_duration:    55261 ms

Confirmation: PERSISTENT (not transient). Same error message seen in get_system_status recent errors:
  - [2026-07-19 18:02:03] [ERROR] [vnstock-sync] storeOfficers NOT NULL — database disk image is malformed
  - [2026-07-19 18:04:03] [ERROR] [vnstock-sync] storeOfficers NOT NULL — database disk image is malformed
  - [2026-07-19 18:05:50] [WARN] [fetchAllPageTexts] DB query failed — database disk image is malformed

Impact: Multiple background jobs failing. Market.db file corruption confirmed.
Check-ID Note: Previous cycle (c403) labeled this A-32, but A-32 is disk *capacity* (which PASSES at 34%). 
This is database *integrity* corruption — distinct from disk capacity. Separate check category needed.
```

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

## c129 · 2026-07-19T10:32:09Z
### Audit Run Tier-2 (10:30–10:31 UTC 2026-07-19)
- Tier: 2 | Sources: 29 checked | Crons: 1 checked | DB checks: 2 spot-checks
- A-29 (cron fire): 1 job with error (boardDetailsRefreshJob — dedup-skip) | All firing on schedule
- B-01..B-07,B-11,B-12 (source freshness): 29/29 within SLA | VPS services: 2 unhealthy (expected off-market)
- B-05 (BCTC gate): queue=173 active | push-age=51h << 107h threshold | HEALTHY IDLE
- B-09 (SSC URLs): 0 (PASS)
- B-13 (stale pending): 0 (PASS)
- C-06 (market_messages 3h): 0 (WARN - no activity 3h window)
- C-07 (agent_signals 24h): 93 (PASS)
- Anomalies: 1 new warn | Status: DEGRADED
- Signal output: [emit-signal] OK dedup_key=data_stale:market_messages:C-06 id=sys-20260719T103153-60de
