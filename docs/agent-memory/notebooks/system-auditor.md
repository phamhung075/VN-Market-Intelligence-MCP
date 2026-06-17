## c344 · 2026-06-17T22:45:29Z
### Audit Run Tier-1 (22:45 UTC 2026-06-17)
- Tier: 1 | Services: 11 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 11 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 26.22% < 85% ✓
- A-32 disk: 42% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T22:44:57Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)    vn-market-intelligence-mcp-mcp-server           2 hours ago
vn-market-intelligence-mcp-frontend-1             Up 29 hours (healthy)   vn-market-intelligence-mcp-frontend             29 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 45 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        45 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)     vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)     vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)     vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)     vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)     vn-market-intelligence-mcp-alert-engine         7 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=26.22% MemUsage=537MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    19Gi    42%    393k  195M    0%   /

=== PROBE DONE ===
```

### A-20 In-Container Multi-Probe Results:
```
[A-20-PROBE-1] pdf-extractor:5001/health HTTP 200 ✓
[A-20-PROBE-2] pdf-extractor:5001/health HTTP 200 ✓
[A-20-PROBE-3] pdf-extractor:5001/health HTTP 200 ✓
[A-20] pass_count=3 / 3 — PASS (event-loop healthy)
```

## c343 · 2026-06-18T22:23:45Z
### Audit Run Tier-1 (22:23–22:24 UTC 2026-06-18)
- Tier: 1 | Services: 11 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 11 PASS ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-21 restart count: 0 ✓
- A-30 memory: 23.83% < 85% ✓
- A-32 disk: 41% < 85% ✓
- DB checks: C-01 (1055 tickers ≥ 25 ✓) C-06 (0 msgs in 3h ✓) C-07 (147 signals in 24h ✓) C-12 (integrity ok ✓)

## c342 · 2026-06-17T21:44:22Z
### Audit Run Tier-1 (21:44 UTC 2026-06-17)
- Tier: 1 | Services: 11 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY

## c341 · 2026-06-17T21:14:35Z
### Audit Run Tier-1 (21:14–21:16 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
