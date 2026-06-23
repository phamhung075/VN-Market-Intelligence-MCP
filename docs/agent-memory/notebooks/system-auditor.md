# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c359 · 2026-06-23T07:13:44Z
### Audit Run Tier-1 (07:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–18]. All 5 health endpoints HTTP 200 [RAW-PROBE L22–26]. A-20 pdf-extractor 3/3 multi-probe PASS. Memory 46.23% PASS. Restart count=1 PASS. Disk 35% PASS.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T07:13:15Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 11 hours (healthy)   vn-market-intelligence-mcp-mcp-server           29 hours ago
vn-market-intelligence-mcp-frontend-1             Up 34 hours (healthy)   vn-market-intelligence-mcp-frontend             34 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 7 days (healthy)     vn-market-intelligence-mcp-technical-analysis   7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)     vn-market-intelligence-mcp-macro-indicators     8 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    8 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 11 days (healthy)    vn-market-intelligence-mcp-api-gateway          11 days ago
vn-market-intelligence-mcp-rag-service-1          Up 6 hours (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)    vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)    vn-market-intelligence-mcp-alert-engine         12 days ago
headroom-proxy                                    Up 10 days              headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 12 days (healthy)    mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=46.23% MemUsage=946.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  264M    0%   /

=== PROBE DONE ===
```

## c358 · 2026-06-23T06:43:47Z
### Audit Run Tier-1 (06:43 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy [RAW-PROBE L6–18]. All 5 health endpoints HTTP 200 [RAW-PROBE L22–26]. A-20 pdf-extractor 3/3 multi-probe PASS. Memory 46.54% PASS. Restart count=1 PASS. Disk 37% PASS.

## c357 · 2026-06-23T06:30:27Z
### Audit Run Tier-2 (06:30 UTC 2026-06-23 — market hours)
- Tier: 2 | Domains: 8 | Status: HEALTHY
- Anomalies: 0 new | Macro 18h (within 24h SLA) | vps-bctc known-standing
- Summary: market_prices 30s old, agent_signals 20s old, daily_ohlcv 765 codes. Macro 18h 17m (cadence 6h, threshold 24h). BCTC queue: pending=0, SSC URLs=0 (PASS). VPS: 4/5 healthy (bctc-fetch unhealthy known-standing ~156h). Crons: 15 recent all success/running, no gaps.
