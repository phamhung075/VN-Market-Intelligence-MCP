# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c433 · 2026-06-24T13:14:01Z
### Audit Run Tier-1 (13:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 mcp=1 PASS, rag=106 no-jump (KNOWN-STANDING), A-30 mcp-mem 48.14% normal, A-32 disk 35% normal
- Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T13:13:15Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-frontend-1             Up 8 hours (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 8 hours (healthy)
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=48.14% MemUsage=985.9MiB / 2GiB

--- disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%

[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```
- A-01–A-11 (container UP): 12/12 services in host_runtime_set UP (RAW-PROBE L8-19). PASS.
- A-12–A-20 (health HTTP 200): 5/5 probed OK (RAW-PROBE L24-28). A-20 pdf-extractor 3/3 multi-probe 200. PASS.
- A-21 (restart count): mcp-server=1 (RAW-PROBE L31, PASS ≤2). rag=106 no jump from last run (KNOWN-STANDING FU-RAG-DEPLOY-MEMORY, OOMKilled=false). PASS.
- A-30 (mcp-mem): 48.14% (RAW-PROBE L34, PASS <85%). PASS.
- A-32 (disk): 35% capacity (RAW-PROBE L37, PASS <85%). PASS.
- Cron health: get_cron_health OK, ~95 jobs all ≥98% success rate, no fire gaps. PASS.
- MCP system: 16 circuit breakers OK (sfv/tradingEconomics WARN noted, handled gracefully). PASS.

## c432 · 2026-06-24T12:44:01Z
### Audit Run Tier-1 (12:44 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 rag=106 no-jump, A-30 mcp-mem 67% normal → PASS both
- Status: HEALTHY
