# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c210733 · 2026-07-21T10:40:53Z
### Audit Run Tier-1 (10:35–10:41 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 11 UP, 1 UNHEALTHY
- Health endpoints: 4 OK (mcp-server, api-gateway, macro-indicators, frontend), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall persists (KNOWN PDF-AVAIL-02)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 74.69% PASS | A-32 Disk: 36% PASS
- Anomalies: 0 new | 1 dedup-skipped (A-20 within 7d window, last sent 2026-07-21T03:41:45Z) | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T10:40:53Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 5 days (healthy)       mcpservergatway-gateway                         5 days ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)       vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        5 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 5 days (healthy)       vn-market-intelligence-mcp-news-fetch           5 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)      vn-market-intelligence-mcp-mcp-server           5 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 days (healthy)       vn-market-intelligence-mcp-rag-service          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 38 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 5 days (healthy)       vn-market-intelligence-mcp-alert-engine         5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=74.69% MemUsage=2.241GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  261M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

### Emit Results:
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-21T03:41:45Z id=sys-20260721T104145-0606

## c210731 · 2026-07-21T10:31:16Z
### Audit Run Tier-2 (10:31–10:35 UTC 2026-07-21)
- Tier: 2 | Sources checked: 6 (news, prices, bctc, sbv, ff, macro) | Checks: A-29, B-01–B-13, C-06/C-07
- Cron health: All jobs nominal (100% success rate, no gaps >2×cadence)
- Per-source freshness: News OK (1m/30m SLA); BCTC off-season (1241m/9302m SLA); prices/FF off-hours (expected)
- SBV_FX: 31m>30m SLA but 17:31 VN (post-market, not actionable per off-hours context)
- VPS routes: BCTC/SBV stale but expected idle (earnings off-season, Q2 window ended 2026-07-14)
- DB checks: market_messages=2 (C-06 pass), agent_signals=376 (C-07 pass), BCTC queue=183 active (healthy)
- BCTC quality: 0 SSC portal URLs (B-09 pass), 0 stale >72h (B-13 pass), rate limits OK
- Anomalies: 0 new (off-hours context applied) | Status: HEALTHY
