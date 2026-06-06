---
agent: system-auditor
session_date: 2026-06-06
---

## c051 · 2026-06-06T17:08:22Z
### Audit Run Tier-1 (17:08 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 80+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE: 2026-06-06T17:08:28Z
```
=== AUDITOR PROBE 2026-06-06T17:08:28Z ===

--- docker ps -a ---
NAMES                                           STATUS                    IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 21 minutes (healthy)   vn-market-intelligence-mcp-mcp-server         22 minutes ago
vn-market-intelligence-mcp-frontend-1           Up 6 hours (healthy)      vn-market-intelligence-mcp-frontend           6 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 6 hours (healthy)      vn-market-intelligence-mcp-pdf-extractor      6 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 6 hours (healthy)      vn-market-intelligence-mcp-macro-indicators   6 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 6 hours (healthy)      vn-market-intelligence-mcp-api-gateway        6 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=13.96% MemUsage=285.9MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    29%    393k  345M    0%   /

=== PROBE DONE ===
```

### Verdicts (A-01..A-32) — All PASS
- [RAW-PROBE L4–9] mcp-server/api-gateway/frontend/macro-indicators/pdf-extractor/mcp-gateway: all Up (healthy) ✓
- Health endpoints [RAW-PROBE L11–15]: all HTTP 200 ✓
- Memory: 13.96% (< 85%) ✓; Disk: 29% (< 85%) ✓; Restart: 0 (≤2) ✓
- System: Circuit breakers all [OK], WAL 9.55 MB, 0 recent errors ✓
- Cron: 70+ jobs running, all success rates ≥97%, no gaps detected ✓

## c050 · 2026-06-06T16:38:32Z
### Audit Run Tier-1 (16:38 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 80+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE: 2026-06-06T16:38:18Z
```
=== AUDITOR PROBE 2026-06-06T16:38:18Z ===

--- docker ps -a ---
NAMES                                           STATUS                 IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 4 hours (healthy)   vn-market-intelligence-mcp-mcp-server         4 hours ago
vn-market-intelligence-mcp-frontend-1           Up 5 hours (healthy)   vn-market-intelligence-mcp-frontend           5 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 5 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor      5 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 5 hours (healthy)   vn-market-intelligence-mcp-macro-indicators   5 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 5 hours (healthy)   vn-market-intelligence-mcp-api-gateway        5 hours ago
mcp-gateway                                     Up 10 days (healthy)   mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=44.46% MemUsage=910.5MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    29%    393k  345M    0%   /

=== PROBE DONE ===
```

### Verdicts (A-01..A-32) — All PASS
- [RAW-PROBE L4–9] mcp-server/api-gateway/frontend/macro-indicators/pdf-extractor/mcp-gateway: all Up (healthy) ✓
- Health endpoints [RAW-PROBE L11–15]: all HTTP 200 ✓
- Memory: 44.46% (< 85%) ✓; Disk: 29% (< 85%) ✓; Restart: 0 (≤2) ✓

## c049 · 2026-06-06T16:08:37Z
### Audit Run Tier-1 (16:08 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 80+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE: 2026-06-06T16:08:16Z
```
=== AUDITOR PROBE 2026-06-06T16:08:16Z ===

--- docker ps -a ---
NAMES                                           STATUS                 IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 3 hours (healthy)   vn-market-intelligence-mcp-mcp-server         3 hours ago
vn-market-intelligence-mcp-frontend-1           Up 5 hours (healthy)   vn-market-intelligence-mcp-frontend           5 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 5 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor      5 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 5 hours (healthy)   vn-market-intelligence-mcp-macro-indicators   5 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 5 hours (healthy)   vn-market-intelligence-mcp-api-gateway        5 hours ago
mcp-gateway                                     Up 10 days (healthy)   mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=37.11% MemUsage=760MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    33Gi    29%    393k  346M    0%   /

=== PROBE DONE ===
```

### Verdicts (A-01..A-32) — All PASS
- [RAW-PROBE L4–9] mcp-server/api-gateway/frontend/macro-indicators/pdf-extractor/mcp-gateway: all Up (healthy) ✓
- Health endpoints [RAW-PROBE L11–15]: all HTTP 200 ✓
- Memory: 37.11% (< 85%) ✓; Disk: 29% (< 85%) ✓; Restart: 0 (≤2) ✓
- System: Circuit breakers all [OK], WAL 4.88 MB, 0 recent errors ✓
- Cron: 80+ jobs running, all success rates ≥97.4%, no gaps detected ✓
