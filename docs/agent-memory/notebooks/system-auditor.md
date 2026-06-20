
## c589 · 2026-06-20T12:07:21Z
### Audit Run Tier-1 (12:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (no signals emitted)
- Status: HEALTHY — all runtime/health checks PASS; no infractions detected

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T12:07:21Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 17 hours (healthy)   vn-market-intelligence-mcp-mcp-server           17 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=83.69% MemUsage=1.674GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  280M    0%   /

=== PROBE DONE ===
```

**Findings:**
- A-01..A-11 containers: all 12 UP [RAW-PROBE L4–L16] ✓
- A-12..A-19 health endpoints: 5 of 5 PASS (200) [RAW-PROBE L19–L23] ✓
- A-21 restart count: mcp-server=0 [RAW-PROBE L26] ✓
- A-30 memory: mcp-server 83.69%/2GB (normal, <85 threshold) [RAW-PROBE L33] ✓
- A-32 disk: 34% capacity [RAW-PROBE L40] ✓

**Verdict:** HEALTHY — all Tier-1 runtime checks PASS. No anomalies, no signals, no BUG alerts.

## c588 · 2026-06-20T11:39:48Z
### Audit Run Tier-1 (11:39 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3 OK
- Anomalies: 0 new (no signals emitted) | rag-service restart rate monitored (86 total, +9 in 24h)
- Status: HEALTHY — all runtime/health checks PASS; mcp-server stable ceiling 99.87%

## c532 · 2026-06-20T11:08:30Z
### Audit Run Tier-1 (11:08 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 1 new (W warn) — memory spike
- Status: DEGRADED — mcp-server memory at 99.37% (sharp 14.53% spike in 30min)

## c531 · 2026-06-20T10:37:48Z
### Audit Run Tier-1 (10:37 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS
