

## c319 · 2026-06-17T11:14:56Z
### Audit Run Tier-1 (11:14–11:14 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 in-container HTTP 200 ✓
- A-21 restart count: 0 ✓
- A-30 memory: 31.80% < 85% ✓
- A-32 disk: 39% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T11:14:16Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)    vn-market-intelligence-mcp-mcp-server           4 hours ago
vn-market-intelligence-mcp-frontend-1             Up 18 hours (healthy)   vn-market-intelligence-mcp-frontend             18 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 34 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        34 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 47 hours (healthy)   vn-market-intelligence-mcp-stock-price          47 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)     vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)     vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)     vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)     vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)     vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days               headroom-proxy:local                            10 days ago
mcp-gateway                                       Up 6 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=31.80% MemUsage=651.3MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    22Gi    39%    393k  226M    0%   /
```

### A-20 Multi-Probe Evidence:
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
Verdict: pass_count=3 ≥ 2 → PASS
```

## c318 · 2026-06-17T10:45:27Z
### Audit Run Tier-1 (10:45–10:45 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 1 new WARN (A-30) | Dedup: 0 skipped
- Status: DEGRADED (memory pressure)
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-30 memory: 99.6% used > 85% ✗ WARN (host pages 99.6%, Docker 1.4–2.1 GiB / 8GiB cap OK, but system pages critical)
- A-32 disk: 39% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T10:45:27Z ===

--- docker ps (host_runtime_set SSOT) ---
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 17 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 33 hours (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 47 hours (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)
mcp-gateway                                       Up 6 days (healthy)

--- health endpoints (sample probe) ---
[200] http://localhost:3000/health (mcp-server)
[200] http://localhost:4000/health (api-gateway)
[200] http://localhost:5004/health (macro-indicators)
[200] http://localhost:5001/health (pdf-extractor)
[200] http://localhost:3001/ (frontend)

--- memory raw (host) ---
Pages free: 2080
Pages active: 1419658
Pages wired down: 807752
PhysMem: 16G used (4254M wired, 1848M compressor), 174M unused
Total Docker MemPerc: ~1.4-2.1 GiB (within 8GiB cap)

--- disk ---
/ dev/disk1s4s1 39% used (< 85% threshold PASS)
```
