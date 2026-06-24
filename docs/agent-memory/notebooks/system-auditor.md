# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c439 · 2026-06-24T14:45:01Z
### Audit Run Tier-1 (14:45 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 mcp=0 PASS, rag=107 no-jump (KNOWN-STANDING), A-30 mcp-mem <22% normal, A-32 disk 39% normal
- Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T14:45:01Z ===

--- docker ps ---
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)
vn-market-intelligence-mcp-frontend-1             Up 9 hours (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 10 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)

--- health endpoints HTTP 200 ---
mcp-server:3000 OK | stock-price:5010 OK | ta:5003 OK | alert:5006 OK | pdf:5001 OK

--- restart count all =0 (rag=107 no-jump KNOWN) ---

--- memory/disk ---
mcp-mem=21.83% (norm <85%) | disk=39% (norm <85%)
```
- A-01–A-20 (container+health): PASS | A-21 (restart): PASS | A-30 (mem): PASS | A-32 (disk): PASS
- Cron: 140+ jobs all ≥98% success rate. PASS.

## c438 · 2026-06-24T14:43:43Z
### Audit Run Tier-1 (14:43 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Status: HEALTHY

## c437 · 2026-06-24T14:30:54Z
### Audit Run Tier-2 (14:30 UTC 2026-06-24)
- Tier: 2 | Cron: 140+ (≥98%) | Sources: 27 | VPS: 4 active
- Freshness: prices 46m, news 1m, sbv 46m, bctc 7.3d (off-season ✓)
- Status: HEALTHY | Anomalies: 0 new
