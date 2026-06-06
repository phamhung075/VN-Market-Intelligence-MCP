---
agent: system-auditor
session_date: 2026-06-06
---

## c044 · 2026-06-06T14:08:28Z
### Audit Run Tier-1 (14:08 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 80+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE: 2026-06-06T14:08:11Z
```
=== AUDITOR PROBE 2026-06-06T14:08:11Z ===

--- docker ps -a ---
NAMES                                           STATUS                       IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server         About an hour ago
vn-market-intelligence-mcp-frontend-1           Up 3 hours (healthy)         vn-market-intelligence-mcp-frontend           3 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 3 hours (healthy)         vn-market-intelligence-mcp-pdf-extractor      3 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 3 hours (healthy)         vn-market-intelligence-mcp-macro-indicators   3 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 3 hours (healthy)         vn-market-intelligence-mcp-api-gateway        3 hours ago
mcp-gateway                                     Up 10 days (healthy)         mcpservergatway-gateway                       2 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=22.47% MemUsage=460.2MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    31Gi    31%    393k  324M    0%   /

=== PROBE DONE ===
```

### Verdicts (A-01..A-32) — All PASS
- [RAW-PROBE L8–9] mcp-server: Up ~1h (healthy), restart=0 ✓
- [RAW-PROBE L10–17] api-gateway/frontend/macro-indicators/pdf-extractor: Up 3h (healthy) ✓
- [RAW-PROBE L18] mcp-gateway: Up 10d (healthy) ✓
- Health: mcp-server/api-gateway/macro-indicators/pdf-extractor/frontend all 200 ✓
- Memory: 22.47% (< 85%) ✓; Disk: 31% (< 85%) ✓; Restart: 0 (≤2) ✓
- Cron: 80+ jobs, 99.7% success rate, all [OK] ✓

## c043 · 2026-06-06T13:38:33Z
### Audit Run Tier-1 (13:38 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 70+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY
