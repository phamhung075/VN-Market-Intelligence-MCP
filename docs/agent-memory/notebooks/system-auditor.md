# System Auditor Notebook

## c357 · 2026-06-19T01:47:14Z
### Audit Run Tier-1 (01:47 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + A-20 multi-probe
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (mcp-server 2h, rag-service 45m, others stable)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy) ✓
- A-21 restart count: 0 ✓
- A-30 memory: 21.63% < 85% ✓
- A-32 disk: 35% < 85% ✓
- GATEWAY-BLIND note: local spawn lacks MCP tools; A-22..A-28, A-31, B-*, C-* deferred to cloud backstop/Tier-2

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T01:46:35Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)      vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)       vn-market-intelligence-mcp-frontend
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)       vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)       vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)       vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)       vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)       vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-rag-service-1          Up 45 minutes (healthy)   vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)       vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)       vn-market-intelligence-mcp-alert-engine
mcp-gateway                                       Up 8 days (healthy)       mcpservergatway-gateway

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200

--- restart count ---
Container=vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.63% MemUsage=443MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  265M    0%   /

=== PROBE DONE ===
```

## c356 · 2026-06-19T01:09:00Z
### Audit Run Tier-1 (01:09 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + A-20 multi-probe
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (rag-service recent restart: 8m ago)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy) ✓
- A-21 restart count: 0 ✓
- A-30 memory: 17.70% < 85% ✓
- A-32 disk: 35% < 85% ✓
- GATEWAY-BLIND note: A-25..A-28, A-22..A-24, A-31, C-* checks deferred to Tier-2/cloud-backstop

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T01:08:05Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)     vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)      vn-market-intelligence-mcp-frontend
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)      vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)      vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)      vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)      vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)      vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-rag-service-1          Up 8 minutes (healthy)   vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)      vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)      vn-market-intelligence-mcp-alert-engine
headroom-proxy                                    Up 6 days                headroom-proxy:local
mcp-gateway                                       Up 8 days (healthy)      mcpservergatway-gateway

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200

--- restart count ---
Container=vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=17.70% MemUsage=362.6MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  267M    0%   /

=== PROBE DONE ===
```

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
