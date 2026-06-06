---
agent: system-auditor
session_date: 2026-06-06
---

## c047 · 2026-06-06T15:08:43Z
### Audit Run Tier-1 (15:08 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 80+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE: 2026-06-06T15:08:08Z
```
=== AUDITOR PROBE 2026-06-06T15:08:08Z ===

--- docker ps -a ---
NAMES                                           STATUS                 IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 2 hours (healthy)   vn-market-intelligence-mcp-mcp-server         2 hours ago
vn-market-intelligence-mcp-frontend-1           Up 4 hours (healthy)   vn-market-intelligence-mcp-frontend           4 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 4 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor      4 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 4 hours (healthy)   vn-market-intelligence-mcp-macro-indicators   4 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 4 hours (healthy)   vn-market-intelligence-mcp-api-gateway        4 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=29.15% MemUsage=596.9MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    31Gi    31%    393k  325M    0%   /

=== PROBE DONE ===
```

### Verdicts (A-01..A-32) — All PASS
- [RAW-PROBE L1–6] mcp-server/api-gateway/frontend/macro-indicators/pdf-extractor/mcp-gateway: all Up (healthy) ✓
- Health endpoints [RAW-PROBE L8–13]: all HTTP 200 ✓
- Memory: 29.15% (< 85%) ✓; Disk: 31% (< 85%) ✓; Restart: 0 (≤2) ✓
- System: Circuit breakers all [OK], WAL 4.88 MB, 0 recent errors ✓
- Cron: 80+ jobs running, all success rates ≥99.5%, no gaps detected ✓

## c046 · 2026-06-06T14:42:49Z
### Audit Run Tier-1 (14:42 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 80+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE: 2026-06-06T14:42:15Z
```
=== AUDITOR PROBE 2026-06-06T14:42:15Z ===

--- docker ps -a ---
NAMES                                           STATUS                 IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 2 hours (healthy)   vn-market-intelligence-mcp-mcp-server         2 hours ago
vn-market-intelligence-mcp-frontend-1           Up 3 hours (healthy)   vn-market-intelligence-mcp-frontend           3 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 3 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor      3 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 3 hours (healthy)   vn-market-intelligence-mcp-macro-indicators   3 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 3 hours (healthy)   vn-market-intelligence-mcp-api-gateway        3 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=29.18% MemUsage=597.5MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    31Gi    31%    393k  324M    0%   /

=== PROBE DONE ===
```

### Verdicts (A-01..A-32) — All PASS
- [RAW-PROBE L1–6] mcp-server/api-gateway/frontend/macro-indicators/pdf-extractor/mcp-gateway: all Up (healthy) ✓
- Health endpoints [RAW-PROBE L8–13]: all HTTP 200 ✓
- Memory: 29.18% (< 85%) ✓; Disk: 31% (< 85%) ✓; Restart: 0 (≤2) ✓
- System: Circuit breakers all [OK], WAL 4.88 MB, 0 recent errors ✓
- Cron: 80+ jobs running, all success rates ≥99.5%, no gaps detected ✓

## c045 · 2026-06-06T14:37:21Z
### Audit Run Tier-2 (14:36 UTC 2026-06-06)
- Tier: 2 (freshness sweep) | Sources: 4 checked | Crons: 80+ reviewed | VPS routes: 7 checked
- Anomalies: 4 new (4 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: CRITICAL — VPS data pipeline stale across multiple sources (prices 37m → 10m SLA; bctc 1278m → 360m SLA; foreign_flow 1417m → 10m SLA; sbv_fx 37m → 30m SLA)

### RAW-PROBE: 2026-06-06T14:36:47Z
```
=== AUDITOR PROBE 2026-06-06T14:36:47Z ===

--- docker ps -a ---
NAMES                                           STATUS                 IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 2 hours (healthy)   vn-market-intelligence-mcp-mcp-server         2 hours ago
vn-market-intelligence-mcp-frontend-1           Up 3 hours (healthy)   vn-market-intelligence-mcp-frontend           3 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 3 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor      3 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 3 hours (healthy)   vn-market-intelligence-mcp-macro-indicators   3 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 3 hours (healthy)   vn-market-intelligence-mcp-api-gateway        3 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=24.95% MemUsage=510.9MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    32Gi    30%    393k  335M    0%   /

=== PROBE DONE ===
```

### Freshness Verdicts (B-01 through B-13)
- [get_sla_status 14:37:06Z] CRITICAL SLA breaches: price (37/10min), bctc (1278/360min), foreign_flow (1417/10min), sbv_fx (37/30min)
- [get_vps_proxy_health 14:36:56Z] VPS routes stale: prices (last_push 2026-06-05 08:59:30, 1278m ago), bctc (last_push 2026-06-05 14:48:47, 833m ago); news+sbv OK
- [get_vps_service_health 14:36:55Z] VPS health: vn-bctc-fetch healthy, vn-news-fetch healthy, vn-sbv-fetch healthy, vn-price-fetch IDLE (market closed but 37m stale), vn-foreign-flow IDLE (1417m stale)
- Cron: no job gaps detected (all within 2× cadence); 80+ crons polled, 100% success
- News: flowing (14:28:57Z); BCTC: no flow since 2026-06-05 14:48:47Z (1278m = 21h+ gap vs 24h SLA in current window)
- Macro live (vn-direct tier); source_tier=2 carry computed 2026-06-03 (3d stale for real-time indicator)
