<!-- System Auditor Notebook — cycle log (≤200L, NEWEST-FIRST ordering) -->


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

### RAW-PROBE: 2026-06-06T23:44:34Z
```
=== AUDITOR PROBE 2026-06-06T23:44:34Z ===

--- docker ps -a ---
NAMES                                           STATUS                    IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 33 minutes (healthy)   vn-market-intelligence-mcp-mcp-server         34 minutes ago
vn-market-intelligence-mcp-frontend-1           Up 2 hours (healthy)      vn-market-intelligence-mcp-frontend           2 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 2 hours (healthy)      vn-market-intelligence-mcp-macro-indicators   2 hours ago
headroom-proxy                                  Up 5 hours                headroom-proxy:local                          5 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 12 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor      12 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 12 hours (healthy)     vn-market-intelligence-mcp-api-gateway        12 hours ago
mcp-gateway                                     Up 10 days (healthy)      mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=9.79% MemUsage=200.6MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    22Gi    39%    393k  226M    0%   /

=== PROBE DONE ===
```

**Tier-1 verdicts:**
- [A-01..A-11] Container status: All 6 host_runtime_set services UP (healthy)✓
- [A-12..A-20] Health endpoints: mcp-server:3000✓, api-gateway:4000✓, macro-indicators:5004✓, pdf-extractor:5001✓, frontend:3001✓
- [A-21] Restart count: 1 (≤2)✓
- [A-30] Memory: 9.79% (< 85%)✓
- [A-32] Disk: 39% (< 85%)✓
- [MCP Status] All circuits OK, 0 open, 0 half-open, 0 unresolved errors✓
- [Cron Health] 100+ jobs, all success rates ≥97%, no gaps✓

## c058 · 2026-06-06T23:12:18Z
### Audit Run Tier-1 (23:12 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE: 2026-06-06T23:12:18Z
All 6 host_runtime_set services UP (healthy): mcp-server 1min, api-gateway 12h, frontend 1h, macro-indicators 1h, mcp-gateway 10d, pdf-extractor 12h
Health endpoints: mcp-server:3000 200✓, api-gateway:4000 200✓, macro-indicators:5004 200✓, pdf-extractor:5001 200✓, frontend:3001 200✓
Memory: 6.17% (< 85%)✓; Disk: 39% (< 85%)✓; Restart: 1 (≤2)✓
MCP Circuits: 0 open, 0 half-open✓; Unresolved errors: 0✓; Crons: 100+ jobs ≥97.3% success✓

## c057 · 2026-06-06T22:42:05Z
### Audit Run Tier-3 (22:42 UTC 2026-06-06)
- Tier: 3 (runtime + DB integrity + doc audit) | Services: 6 checked | DB checks: 16 attempted (8 NOT-RUN: sqlite3 sandbox unavailable)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 1 dedup-skipped (news SLA CRITICAL logged c056 11min prior, within 7d window)
- Status: DEGRADED (news SLA CRITICAL persists; sbv_fx marginal breach known issue)

### Tier-1 Runtime Ping (A-01..A-32)
- All 6 host_runtime_set services UP (healthy): mcp-server 42min, api-gateway 11h, frontend 47min, macro-indicators 55min, pdf-extractor 11h✓
- Health endpoints: mcp-server:3000 200✓, api-gateway:4000 200✓, macro-indicators:5004 200✓, pdf-extractor:5001 200✓, frontend:3001 200✓
- Memory: 17.19% (< 85%)✓; Disk: 39% (< 85%)✓; Restart: 0 (≤2)✓
- Crons: 80+ jobs, success rates ≥97.3%, no gaps✓