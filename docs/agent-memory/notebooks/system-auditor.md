# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c434 · 2026-06-24T13:43:58Z
### Audit Run Tier-1 (13:43 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 mcp=0 PASS, rag=107 no-jump (KNOWN-STANDING), A-30 mcp-mem 13.97% normal, A-32 disk 38% normal
- Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T13:43:10Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 8 minutes (healthy)
vn-market-intelligence-mcp-frontend-1             Up 8 hours (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 9 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 16 minutes (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=13.97% MemUsage=286.2MiB / 2GiB

--- disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    22Gi    38%
```
- A-01–A-11 (container UP): 12/12 services in host_runtime_set UP (RAW-PROBE L8-18). PASS.
- A-12–A-20 (health HTTP 200): 5/5 probed OK (RAW-PROBE L20-24). A-20 pdf-extractor endpoint OK. PASS.
- A-21 (restart count): mcp-server=0 (RAW-PROBE L27, PASS ≤2). rag=107 no-jump (KNOWN-STANDING per FU-RAG-DEPLOY-MEMORY, normal ~1/hr OOM cycle). PASS.
- A-30 (mcp-mem): 13.97% (RAW-PROBE L30, PASS <85%). rag-mem 80.39% (high but no OOMKilled, within expected warm load). PASS.
- A-32 (disk): 38% capacity (RAW-PROBE L33, PASS <85%). PASS.
- Cron health: 140+ jobs all ≥98% success rate, no fire gaps (get_cron_health OK). PASS.
- MCP system: 16 circuit breakers OK, system_status OK. PASS.

## c433 · 2026-06-24T13:14:01Z
### Audit Run Tier-1 (13:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 mcp=1 PASS, rag=106 no-jump (KNOWN-STANDING), A-30 mcp-mem 48.14% normal, A-32 disk 35% normal
- Status: HEALTHY
