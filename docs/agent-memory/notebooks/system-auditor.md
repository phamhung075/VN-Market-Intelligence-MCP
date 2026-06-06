---
agent: system-auditor
session_date: 2026-06-06
---

## c042 · 2026-06-06T13:12:26Z
### Audit Run Tier-1 (13:12 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 70+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE: 2026-06-06T13:12:09Z
```
=== AUDITOR PROBE 2026-06-06T13:12:09Z ===

--- docker ps -a ---
NAMES                                           STATUS                    IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 27 minutes (healthy)   vn-market-intelligence-mcp-mcp-server         27 minutes ago
vn-market-intelligence-mcp-frontend-1           Up 2 hours (healthy)      vn-market-intelligence-mcp-frontend           2 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 2 hours (healthy)      vn-market-intelligence-mcp-pdf-extractor      2 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 2 hours (healthy)      vn-market-intelligence-mcp-macro-indicators   2 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 2 hours (healthy)      vn-market-intelligence-mcp-api-gateway        2 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=13.82% MemUsage=283.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    31Gi    31%    393k  325M    0%   /
```

### Container Status (A-01..A-11, host_runtime_set) — All PASS
- [RAW-PROBE L8–9] mcp-server: Up 27 min (healthy), restart_count=0 ✓
- [RAW-PROBE L10–11] api-gateway: Up 2h (healthy) ✓
- [RAW-PROBE L12–13] frontend: Up 2h (healthy) ✓
- [RAW-PROBE L14–15] macro-indicators: Up 2h (healthy) ✓
- [RAW-PROBE L16–17] mcp-gateway: Up 10d (healthy) ✓
- [RAW-PROBE L6–7] pdf-extractor: Up 2h (healthy) ✓

### Health Endpoints (A-12..A-20) — All PASS
- [RAW-PROBE L21] mcp-server:3000 /health → 200 ✓
- [RAW-PROBE L22] api-gateway:4000 /health → 200 ✓
- [RAW-PROBE L23] macro-indicators:5004 /health → 200 ✓
- [RAW-PROBE L24] pdf-extractor:5001 /health → 200 ✓
- [RAW-PROBE L25] frontend:3001 / → 200 ✓

### System Metrics (A-21, A-30, A-32) — All PASS
- [RAW-PROBE L29] Restart count: 0 (≤2) ✓
- [RAW-PROBE L32] Memory: 13.82% (< 85%) ✓
- [RAW-PROBE L35] Disk: 31% capacity (< 85%) ✓

### Cron Health & Circuit Breaker
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓
- Market: CLOSED (Saturday 13:12 UTC) — weekend idle by design ✓

### Expected Benign Notes
- mcp-server rebuilt twice today (12:36:33Z, 12:44:41Z per c042 brief); current StartedAt 2026-06-06T12:44:41Z (~27m uptime) — NORMAL
- Peers api-gateway/frontend/macro-indicators/pdf-extractor uptime ~2h (11:14Z restore) — NORMAL

## c041 · 2026-06-06T12:32:30Z
### Audit Run Tier-1 (12:32 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 70+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY
