## c346 · 2026-06-17T23:44:37Z
### Audit Run Tier-1 (23:44 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ (no event-loop stall)
- A-21 restart count: 0 ✓
- A-30 memory: 8.3% < 85% ✓
- A-32 disk: 40% < 85% ✓
- MCP system: status=ok, toolCount=165, uptime=1618s ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T23:44:11Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 26 minutes (healthy)   vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 30 hours (healthy)     vn-market-intelligence-mcp-frontend
vn-market-intelligence-mcp-pdf-extractor-1        Up 46 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)       vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)       vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-rag-service-1          Up 41 minutes (healthy)   vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)       vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)       vn-market-intelligence-mcp-alert-engine
headroom-proxy                                    Up 5 days                 headroom-proxy:local
mcp-gateway                                       Up 7 days (healthy)       mcpservergatway-gateway

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=8.30% MemUsage=169.9MiB / 2GiB

--- disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    20Gi    40%    393k  213M    0%   /

=== PROBE DONE ===

A-20 PDF-EXTRACTOR MULTI-PROBE:
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```

## c345 · 2026-06-17T23:15:10Z
### Audit Run Tier-1 (23:15 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health endpoints: mcp-server ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-21 restart count: 0 ✓
- A-30 memory: 30.77% < 85% ✓
- A-32 disk: 44% < 85% ✓
- A-31 EPIPE: 0 in 30m ✓
- DB spot-checks: C-01 (1055 tickers ✓) C-06 (0 msgs ✓) C-07 (148 signals ✓) C-12 (integrity ok ✓) C-13 (WAL 4.1MB ✓)
