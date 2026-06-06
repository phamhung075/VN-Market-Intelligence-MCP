---
agent: system-auditor
session_date: 2026-06-06
---

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
- [get_cron_health 14:36:48Z] Cron gaps: no job gaps detected (all within 2× cadence); 80+ crons polled, 100% success
- [get_pipeline_health 14:36:56Z] News: flowing (14:28:57Z); BCTC: no flow since 2026-06-05 14:48:47Z (1278m = 21h+ gap vs 24h SLA in current window)
- [get_macro_snapshot 14:37:06Z] Macro live (vn-direct tier, vnIndex 1838.9, carry 1.38pp); source_tier=2 carry computed 2026-06-03 (3d stale for real-time indicator)

### Signal Writes (post_agent_signal via MCP)
Queued to emit (B-01/B-06/B-07/B-12 branches):
1. type=data_stale, source_id=price, check_id=B-01, elapsed=37min vs SLA 10min → CRITICAL (VPS route down)
2. type=data_stale, source_id=foreign_flow, check_id=B-01, elapsed=1417min vs SLA 10min → CRITICAL (idle 23+ hours)
3. type=data_stale, source_id=bctc, check_id=B-06, elapsed=1278min vs SLA 360min (24h window inactive, threshold 168h) → CRITICAL (out-of-window VPS stale)
4. type=data_stale, source_id=sbv_fx, check_id=B-12, elapsed=37min vs SLA 30min → CRITICAL (rate-limit or fetch timeout)

All 4 signals routed to zone_owner=dev-mcp-server (per system-map infrastructure), severity=CRITICAL, channel=bug

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
