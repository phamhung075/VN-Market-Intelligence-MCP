# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c438 · 2026-06-24T14:43:43Z
### Audit Run Tier-1 (14:43 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 mcp=0 PASS, rag=107 no-jump (KNOWN-STANDING), A-30 mcp-mem 21.83% normal, A-32 disk 39% normal
- Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T14:43:13Z ===

--- docker ps -a ---
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

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.83% MemUsage=447MiB / 2GiB

--- disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    21Gi    39%
```
- A-01–A-11 (container UP): 12/12 services UP (RAW-PROBE L8-18 all healthy). PASS.
- A-12–A-20 (health HTTP 200): 5/5 endpoints OK (RAW-PROBE L20-24). PASS.
- A-21 (restart count): mcp-server=0 (RAW-PROBE L27, PASS ≤2). PASS.
- A-30 (mcp-mem): 21.83% (RAW-PROBE L31, PASS <85%). PASS.
- A-32 (disk): 39% capacity (RAW-PROBE L34, PASS <85%). PASS.
- Cron: 140+ jobs all 100%/99.8% success rate. PASS.

## c437 · 2026-06-24T14:30:54Z
### Audit Run Tier-2 (14:30 UTC 2026-06-24)
- Tier: 2 | Cron: 140+ (≥98% success) | Sources: 27 checked | VPS routes: 4 active
- Freshness: prices 46min, news 1min, sbv 46min, bctc 7.3d (off-season, expected) | Market: CLOSED (21:30 VN)
- DB checks: market_messages=1 (3h ✓), agent_signals=357 (24h ✓), BCTC-SSC=0 ✓, stale-pending-BCTC=0 ✓
- Macro: oil/gold/usdvnd/carry/yield live 14:30:41Z (is_estimate=false, within 24h SLA ✓)
- Anomalies: 0 new | Dedup: B-06 BCTC idle (KNOWN-STANDING earnings-off-season 06), B-12 SBV timing drift (KNOWN-STANDING)
- Status: HEALTHY

## c436 · 2026-06-24T14:30:23Z
### Audit Run Tier-2 (14:30 UTC 2026-06-24)
- Tier: 2 | Sources: 27 checked | Cron: 140+ all healthy (100% success rate)
- Anomalies: 0 new | Dedup: B-06 BCTC stale (KNOWN-STATE), off-hours idle
- Status: HEALTHY
- Market: CLOSED (21:30 VN). Post-market freshness delays expected.

## c435 · 2026-06-24T14:14:19Z
### Audit Run Tier-1 (14:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 UP, healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 mcp=0 PASS, rag=107 no-jump (KNOWN-STANDING), A-30 mcp-mem 17.13% normal, A-32 disk 38% normal
- Status: HEALTHY
