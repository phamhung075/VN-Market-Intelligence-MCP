<!-- System Auditor Notebook — cycle log (≤200L, NEWEST-FIRST ordering) -->

## c063 · 2026-06-07T01:12:24Z
### Audit Run Tier-1 (01:12 UTC 2026-06-07)
- Tier: 1 (runtime ping) | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE: 2026-06-07T01:12:19Z
```
=== AUDITOR PROBE 2026-06-07T01:12:19Z ===

--- docker ps -a ---
NAMES                                           STATUS                    IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 27 minutes (healthy)   vn-market-intelligence-mcp-mcp-server         27 minutes ago
vn-market-intelligence-mcp-frontend-1           Up 3 hours (healthy)      vn-market-intelligence-mcp-frontend           3 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 3 hours (healthy)      vn-market-intelligence-mcp-macro-indicators   3 hours ago
headroom-proxy                                  Up 6 hours                headroom-proxy:local                          6 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 14 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor      14 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 14 hours (healthy)     vn-market-intelligence-mcp-api-gateway        14 hours ago
mcp-gateway                                     Up 10 days (healthy)      mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=11.99% MemUsage=245.6MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    37%    393k  247M    0%   /

=== PROBE DONE ===
```

**Tier-1 verdicts:**
- [A-01..A-11] Container status: All 6 host_runtime_set services UP (healthy)✓
- [A-12..A-20] Health endpoints: mcp-server:3000✓, api-gateway:4000✓, macro-indicators:5004✓, pdf-extractor:5001✓, frontend:3001✓
- [A-21] Restart count: 0 (≤2)✓
- [A-30] Memory: 11.99% (< 85%)✓
- [A-32] Disk: 37% (< 85%)✓

## c062 · 2026-06-07T00:42:18Z
### Audit Run Tier-1 (00:42 UTC 2026-06-07)
- Tier: 1 (runtime ping) | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE: 2026-06-07T00:42:07Z
```
=== AUDITOR PROBE 2026-06-07T00:42:07Z ===

--- docker ps -a ---
NAMES                                           STATUS                  IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 2 hours (healthy)    vn-market-intelligence-mcp-mcp-server         2 hours ago
vn-market-intelligence-mcp-frontend-1           Up 3 hours (healthy)    vn-market-intelligence-mcp-frontend           3 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 3 hours (healthy)    vn-market-intelligence-mcp-macro-indicators   3 hours ago
headroom-proxy                                  Up 6 hours              headroom-proxy:local                          6 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 13 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor      13 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 13 hours (healthy)   vn-market-intelligence-mcp-api-gateway        13 hours ago
mcp-gateway                                     Up 10 days (healthy)    mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=20.02% MemUsage=410.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    21Gi    39%    393k  225M    0%   /

=== PROBE DONE ===
```

**Tier-1 verdicts:**
- [A-01..A-11] Container status: All 6 host_runtime_set services UP (healthy)✓
- [A-12..A-20] Health endpoints: mcp-server:3000✓, api-gateway:4000✓, macro-indicators:5004✓, pdf-extractor:5001✓, frontend:3001✓
- [A-21] Restart count: 1 (≤2)✓
- [A-30] Memory: 20.02% (< 85%)✓
- [A-32] Disk: 39% (< 85%)✓

## c061 · 2026-06-07T00:30:46Z
### Audit Run Tier-3 (00:30 UTC 2026-06-07)
- Tier: 3 (runtime + DB integrity + doc audit) | Services: 6 checked | DB checks: 6/16 runnable (sqlite3 unavailable in container)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

**Tier-1 Runtime (A-01..A-32):**
- All 6 host_runtime_set services UP (healthy): mcp-server 1h, api-gateway 13h, frontend 3h, macro-indicators 3h, pdf-extractor 13h, mcp-gateway 10d✓
- Health endpoints: mcp-server:3000✓, api-gateway:4000✓, macro-indicators:5004✓, pdf-extractor:5001✓, frontend:3001✓
- Memory: 16.65% (<85%)✓; Disk: 40% (<85%)✓; Restart: 1 (≤2)✓

**Tier-2 Freshness (B-01..B-13):**
- Pipeline health: Aggregator last=2026-06-05, all TA ready✓
- Cron health: 100+ jobs, success rates ≥97%, no gaps✓
- VPS proxy: prices/news/sbv OK; bctc last_push=2026-06-05T14:48:47 (60h old, <168h threshold)✓
- Rate limits: all sources <100%✓

**Tier-3 DB/Doc:**
- Git log 24h: commits exist (fdcd544..359d90a)→continue doc audit
- BCTC SLA (Jun 7, out-of-earnings-window): 168h threshold, 60h elapsed ✓ within threshold
- News SLA CRITICAL logged c060 @22:31Z (within 7d dedup window — no new alert)
- sbv_fx SLA: known false-flag issue (orch-state watch_items entry #2)

**New anomalies:** 0 (all findings in signal_queue are pre-existing or dedup-skipped)

## c060 · 2026-06-07T00:12:29Z
### Audit Run Tier-1 (00:12 UTC 2026-06-07)
- Tier: 1 (runtime ping) | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE: 2026-06-07T00:11:57Z
```
=== AUDITOR PROBE 2026-06-07T00:11:57Z ===

--- docker ps -a ---
NAMES                                           STATUS                       IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server         About an hour ago
vn-market-intelligence-mcp-frontend-1           Up 2 hours (healthy)         vn-market-intelligence-mcp-frontend           2 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 2 hours (healthy)         vn-market-intelligence-mcp-macro-indicators   2 hours ago
headroom-proxy                                  Up 5 hours                   headroom-proxy:local                          5 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 13 hours (healthy)        vn-market-intelligence-mcp-pdf-extractor      13 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 13 hours (healthy)        vn-market-intelligence-mcp-api-gateway        13 hours ago
mcp-gateway                                     Up 10 days (healthy)         mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.53% MemUsage=338.5MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    38%    393k  236M    0%   /

=== PROBE DONE ===
```

**Tier-1 verdicts:**
- [A-01..A-11] Container status: All 6 host_runtime_set services UP (healthy)✓
- [A-12..A-20] Health endpoints: mcp-server:3000✓, api-gateway:4000✓, macro-indicators:5004✓, pdf-extractor:5001✓, frontend:3001✓
- [A-21] Restart count: 1 (≤2)✓
- [A-30] Memory: 16.53% (< 85%)✓
- [A-32] Disk: 38% (< 85%)✓
- [MCP Status] All circuits OK, 0 open, 0 half-open, 0 unresolved errors✓
- [Cron Health] 100+ jobs, all success rates ≥97%, no gaps✓

## c059 · 2026-06-06T23:44:55Z
### Audit Run Tier-1 (23:44 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY

All 6 host_runtime_set services UP (healthy): mcp-server 33min, api-gateway 12h, frontend 2h, macro-indicators 2h, pdf-extractor 12h, mcp-gateway 10d
Health endpoints: mcp-server:3000✓, api-gateway:4000✓, macro-indicators:5004✓, pdf-extractor:5001✓, frontend:3001✓
Memory: 9.79%✓; Disk: 39%✓; Restart: 1✓; Crons: 100+ jobs ≥97% success✓
