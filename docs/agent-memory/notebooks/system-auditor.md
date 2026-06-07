<!-- System Auditor Notebook — cycle log (≤200L, NEWEST-FIRST ordering) -->

## c066 · 2026-06-07T02:31:45Z
### Audit Run Tier-2 (02:31 UTC 2026-06-07)
- Tier: 2 (freshness sweep) | Crons: 71 checked | Sources: 5 checked | VPS: 4 routes checked
- Anomalies: 3 CRITICAL (BCTC SLA breach 65min, VPS sbv unhealthy, BCTC-EVAL 4 red) | Status: DEGRADED
- BUG alerts: 3 (B-02 BCTC SLA, B-07 VPS sbv-fetch, D-BCTC-EVAL red count)

BCTC-EVAL-SNAPSHOT:
[{"ticker":"VNM","period":"Q4-2025","overall_status":"red"},{"ticker":"VEA","period":"Q4-2025","overall_status":"red"},{"ticker":"HPG","period":"Q4-2025","overall_status":"red"},{"ticker":"PPC","period":"Q1-2026","overall_status":"red"},{"count_yellow":10,"count_red":4}]

## c065 · 2026-06-07T02:12:03Z
### Audit Run Tier-1 (02:12 UTC 2026-06-07)
- Tier: 1 (runtime ping) | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE: 2026-06-07T02:11:56Z
```
=== AUDITOR PROBE 2026-06-07T02:11:56Z ===

--- docker ps -a ---
NAMES                                           STATUS                    IMAGE                                         CREATED
vn-market-intelligence-mcp-mcp-server-1         Up 38 minutes (healthy)   vn-market-intelligence-mcp-mcp-server         38 minutes ago
vn-market-intelligence-mcp-frontend-1           Up 4 hours (healthy)      vn-market-intelligence-mcp-frontend           4 hours ago
vn-market-intelligence-mcp-macro-indicators-1   Up 4 hours (healthy)      vn-market-intelligence-mcp-macro-indicators   4 hours ago
headroom-proxy                                  Up 7 hours                headroom-proxy:local                          7 hours ago
vn-market-intelligence-mcp-pdf-extractor-1      Up 15 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor      15 hours ago
vn-market-intelligence-mcp-api-gateway-1        Up 15 hours (healthy)     vn-market-intelligence-mcp-api-gateway        15 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=11.78% MemUsage=241.3MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    37%    393k  248M    0%   /

=== PROBE DONE ===
```

**Tier-1 verdicts:**
- [A-01..A-11] Container status: All 6 host_runtime_set services UP (healthy)✓
- [A-12..A-20] Health endpoints: mcp-server:3000✓, api-gateway:4000✓, macro-indicators:5004✓, pdf-extractor:5001✓, frontend:3001✓
- [A-21] Restart count: 0 (≤2)✓
- [A-30] Memory: 11.78% (< 85%)✓
- [A-32] Disk: 37% (< 85%)✓

## c064 · 2026-06-07T01:42:52Z
### Audit Run Tier-1 (01:42 UTC 2026-06-07)
- Tier: 1 (runtime ping) | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY

All 6 host_runtime_set services UP (healthy). Health endpoints OK. Restart: 0. Memory: 9.97%. Disk: 40%.

## c063 · 2026-06-07T01:12:24Z
### Audit Run Tier-1 (01:12 UTC 2026-06-07)
- Tier: 1 (runtime ping) | Services: 6 checked
- Anomalies: 0 new | Status: HEALTHY

All 6 host_runtime_set services UP (healthy). Health endpoints OK. Restart: 0. Memory: 11.99%. Disk: 37%.
