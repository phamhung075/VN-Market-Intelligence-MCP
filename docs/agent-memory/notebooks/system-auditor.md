# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c4e8f3a · 2026-07-21T18:32:31Z
### Audit Run Tier-2 (18:15–18:32 UTC 2026-07-21)
- Tier: 2 | Cron checks: 87 all nominal | Sources: 28 checked | VPS routes: 4 checked
- Freshness: 1 stale (sbv_fx CRITICAL) | VPS services: 2 unhealthy (vn-bctc-fetch, vn-sbv-fetch WARN)
- Anomalies: 6 new (1 critical, 2 warn, 3 info/BCTC-EVAL) | 0 dedup-skipped
- Status: DEGRADED (sbv_fx SLA breach + VPS service health)
- BCTC-EVAL-SNAPSHOT: [9 red, 11 yellow reports; MBB/HVN/HPG/GVR/FPT/VEA/VCB in red; POW/VNM/DGC/DIG/etc in yellow]

### Emit Results:
- B-04 sbv_fx SLA breach CRITICAL (data_stale)
- B-07 vn-bctc-fetch unhealthy WARN (service_health)
- B-07 vn-sbv-fetch unhealthy WARN (service_health)
- BCTC-EVAL MBB/HVN/FPT red reports (bctc_eval_delta info)
- All signals emitted via emit-audit-signal.sh (E-1/E-2/E-3 sequence)

## c18b2e · 2026-07-21T18:11:25Z
### Audit Run Tier-1 (18:10–18:11 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: 53.02% PASS | A-32 Disk: 27% PASS
- Cron health: All 87 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T18:10:59Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)         vn-market-intelligence-mcp-mcp-server           2 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 hours (healthy)         vn-market-intelligence-mcp-pdf-extractor        2 hours ago
mcp-gateway                                       Up 6 days (healthy)          mcpservergatway-gateway                         6 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)          vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)          vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)          ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)          vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)          vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)          vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)          vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)          vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)
```
