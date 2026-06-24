# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c441 · 2026-06-24T15:44:04Z
### Audit Run Tier-1 (15:44 UTC 2026-06-24)
- Tier: 1 | Services: 13/13 UP (mcp+frontend+macro+pdf-extractor+stock-price+technical+kinh-dich+api-gateway+rag+news-fetch+alert-engine+gateway+headroom-proxy), healthy | Health: 5/5 HTTP 200 | A-20 multi-probe: 3/3 PASS
- Anomalies: 0 new | Dedup: A-21 mcp=0 PASS, rag=107 no-jump (KNOWN-STANDING), A-30 mcp-mem=34.14% <85% normal, A-32 disk=39% <85% normal
- Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T15:43:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)    vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 10 hours (healthy)   vn-market-intelligence-mcp-frontend
vn-market-intelligence-mcp-macro-indicators-1     Up 11 hours (healthy)   vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)     vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)     vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)    vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)    vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)    vn-market-intelligence-mcp-alert-engine
headroom-proxy                                    Up 11 days              headroom-proxy:local
mcp-gateway                                       Up 13 days (healthy)    mcpservergatway-gateway

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.14% MemUsage=699.2MiB / 2GiB

--- disk df -h / ---
Capacity: 39% (13Gi used of 233Gi)

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```
- Cron health: 145+ jobs, 100% success rate, no gaps. All checks PASS. MCP uptime 2h 8m. Cron history stable. Circuits: 0 open/half-open.

## c440 · 2026-06-24T15:13:08Z
### Audit Run Tier-1 (15:13 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 mcp=0 PASS, rag=107 no-jump (KNOWN-STANDING), A-30 mcp-mem=32.48% normal, A-32 disk=39% normal
- Status: HEALTHY
