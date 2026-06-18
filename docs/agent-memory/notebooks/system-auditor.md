# System Auditor Notebook

## c355 · 2026-06-18T03:14:39Z
### Audit Run Tier-1 (03:14 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + inter-service
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie language pack ✓
- A-31 EPIPE: 0 in 30m ✓
- A-32 disk: 41% < 85% ✓
- C-05 SSC portal URLs: 0 (CRITICAL check) ✓
- C-06 messages 3h: 5 (>0) ✓
- C-07 signals 24h: 106 (>0) ✓
- C-16 stale BCTC >72h: 0 ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-18T03:14:39Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)    vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 34 hours (healthy)   vn-market-intelligence-mcp-frontend
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)     vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)     vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)     vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)     vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)     vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)     vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)     vn-market-intelligence-mcp-alert-engine

--- health endpoints ---
[health] port 3000 OK (HTTP 200)
[health] port 4000 OK (HTTP 200)
[health] port 5004 OK (HTTP 200)
[health] port 5001 OK (HTTP 200)
[health] port 3001 OK (HTTP 200)

--- inter-service connectivity ---
stock-price:5000 OK
technical-analysis:5003 OK
alert-engine:5006 OK
pdf-extractor:5001 OK

--- container tooling ---
pdftoppm: /usr/bin/pdftoppm ✓
tesseract: /usr/bin/tesseract ✓
vie language: present ✓

--- restart count ---
RestartCount: 0 ✓

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    20Gi    41%

=== PROBE DONE ===
```

## c354 · 2026-06-18T02:45:05Z
### Audit Run Tier-1 (02:45 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + A-20 multi-probe
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy) ✓
- A-21 restart count: 0 ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-31 EPIPE: 0 in 30m ✓
- A-30 memory: 34.34% < 85% ✓
- A-32 disk: 41% < 85% ✓
- MCP health: status=ok, toolCount=165 ✓
- [A-29] Cron fire: intelligenceCycle, foreignFlowFetcher, askQueueCheck, deepFetch, vpsServiceHealth, vnIndexRefresh all active ✓
- [B-09] SSC portal URLs (critical): 0 non-skipped ✓
- [B-13] Stale pending BCTC >72h: 0 ✓
- [C-06] Messages 3h: 4 (>0) ✓
- [C-07] Signals 24h: 107 (>0) ✓
