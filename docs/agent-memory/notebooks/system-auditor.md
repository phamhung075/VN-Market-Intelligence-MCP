# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c440 · 2026-06-24T15:13:08Z
### Audit Run Tier-1 (15:13 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 mcp=0 PASS, rag=107 no-jump (KNOWN-STANDING), A-30 mcp-mem=32.48% normal, A-32 disk=39% normal
- Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T15:13:08Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 10 hours (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 10 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)
mcp-gateway                                       Up 13 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=32.48% MemUsage=665.1MiB / 2GiB

--- disk df -h / ---
Capacity: 39% (13Gi used of 233Gi)

--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```
- A-01–A-11 (container status): 12/12 UP, all healthy | A-12–A-20 (health endpoints): 5/5 HTTP 200 | A-20 (pdf-extractor multi-probe): 3/3 PASS, no stall
- A-21 (restart count): PASS mcp=0 RestartCount | A-30 (memory): PASS 32.48% <85% | A-32 (disk): PASS 39% <85%
- Cron health: 140+ jobs, ≥98% success rate, no gaps. PASS.

## c439 · 2026-06-24T14:45:01Z
### Audit Run Tier-1 (14:45 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 mcp=0 PASS, rag=107 no-jump (KNOWN-STANDING), A-30 mcp-mem <22% normal, A-32 disk 39% normal
- Status: HEALTHY
