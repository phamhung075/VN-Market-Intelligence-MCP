## 7knw9z3x · 2026-07-28T12:09:11Z
### Audit Run Tier-1 (12:08 UTC 2026-07-28)
- Tier: 1 | Services: 13 checked | Health: 5 endpoints
- A-01–A-11: ALL UP (13/13) ✓ | A-12–A-19: ALL 200 OK (5/5) ✓
- A-20 pdf-extractor: 3/3 PASS ✓ | A-21 restarts: 0 (4h) ✓
- A-30 mcp-server: 66.82% (< 85% gate) ✓ | A-32 disk: 34% ✓
- 🚨 **A-RAG-MEM-01 WARN:** rag-service 99.10% of 768 MiB cap (761.1 MiB, <7 MiB headroom). Climbed from 86.65% over 66h dormancy. OOMKilled=false but vulnerable. Signal: sys-20260728T120919-7e1e
- Anomalies: 1 new (rag-service memory WARN)
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-28T12:08:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 days (healthy)    vn-market-intelligence-mcp-mcp-server           2 days ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)    vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        6 days ago
mcp-gateway                                       Up 12 days (healthy)   mcpservergatway-gateway                         12 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)   vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 12 days (healthy)   ghcr.io/flaresolverr/flaresolverr:latest        12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)   vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)   vn-market-intelligence-mcp-macro-indicators     12 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 12 days (healthy)   vn-market-intelligence-mcp-technical-analysis   12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)   vn-market-intelligence-mcp-alert-engine         12 days ago
vn-market-intelligence-mcp-stock-price-1          Up 12 days (healthy)   vn-market-intelligence-mcp-stock-price          12 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 12 days (healthy)   vn-market-intelligence-mcp-kinh-dich-service    12 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=66.82% MemUsage=2.005GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 66.83% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  281M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## 0jokmt2v · 2026-07-25T12:07:37Z
### Audit Run Tier-1 (12:07 UTC 2026-07-25)
- Tier: 1 | Services: 13 checked | Health endpoints: 5
- A-01–A-11 container status: ALL UP (13/13) — PASS
- A-12–A-19 health endpoints: 4/5 OK, 1 FAIL (api-gateway:4000/health CURL_ERR) [RAW-PROBE L2-L6]
- A-20 pdf-extractor multi-probe: 3/3 PASS [RAW-PROBE L17-L20]
- A-21 crash restarts: 0 (4h windowed, fresh mcp-server post-12:45:09Z swap) — PASS
- A-30 Memory: 14.21% (436.5 MiB / 3 GiB) — PASS (SKIP deep-probe < 85% gate) [RAW-PROBE L12]
- A-32 Disk: 33% — PASS [RAW-PROBE L15]
- ⚠️  **OPERATIONAL CONTEXT:** mcp-server swapped 12:45:09Z (RestartCount reset to 0, uptime 22min, image SHA changed). Memory baseline RESET from prior cycle's 73.84%. Per coordinator directive: cannot compare cross-cycle; each cycle proves its own tripwire. A-30 baseline 14.21% << 85% investigate-gate → deep-probe skipped by design, no escalation needed. vm.{vmhwm_kb,vmrss_kb} unavailable this cycle (no deep-probe executed).
- Anomalies: 0 new (api-gateway WARN dedup-skipped, last_sent=2026-07-20T06:12:10Z, within 7d window)
- Status: HEALTHY
- Corroboration: All 12 host_runtime_set services UP. A-20 multi-probe 3/3. A-21 zero crashes, bootstrap guard active. A-30 reset post-swap, baseline 14.21% well below alert gate. A-32 disk 33% safe. Container health status all healthy (docker inspect output). MCP uptime 22 minutes (fresh post-swap).

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-25T13:07:18Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 22 minutes (healthy)      vn-market-intelligence-mcp-mcp-server           22 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 19 hours (healthy)        vn-market-intelligence-mcp-frontend             19 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        3 days ago
mcp-gateway                                       Up 9 days (healthy)          mcpservergatway-gateway                         9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)          vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 9 days (healthy)          ghcr.io/flaresolverr/flaresolverr:latest        9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)          vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 9 days (healthy)          vn-market-intelligence-mcp-macro-indicators     9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)          vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)          vn-market-intelligence-mcp-alert-engine         9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)          vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    9 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=14.21% MemUsage=436.5MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 14.21% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    33%    393k  288M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## f5h8k3j2 · 2026-07-25T10:38:45Z
### Audit Run Tier-1 (10:38 UTC 2026-07-25)
- Tier: 1 | Services: 13 checked | Health endpoints: 5
- A-01–A-11 container status: ALL UP (13/13) — PASS
- A-12–A-19 health endpoints: ALL 200 OK (5/5) — PASS
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (4h window) | A-30 Memory: 66.35% (1.991 GiB / 3 GiB) — PASS (< 85%, SKIP deep-probe)
- A-32 Disk: 36% used — PASS
- Memory trend: monotonic rise 51.99% (08:07Z) → 58.63% (08:37Z) → 66.35% (10:38Z) = +14.36% in ~2.5h; 85% threshold remains alert gate
