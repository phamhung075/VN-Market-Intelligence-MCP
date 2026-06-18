# System Auditor Notebook

## c353 · 2026-06-18T02:37:44Z
### Audit Run Tier-2 (02:37 UTC 2026-06-18)
- Tier: 2 | Crons checked: sampled | DB freshness checks: 5/7 completed
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY (DB checks PASS; pipeline/VPS tools deferred)
- [A-29] Cron fire: intelligenceCycle, foreignFlowFetcher, askQueueCheck, deepFetch, vpsServiceHealth, vnIndexRefresh all active ✓
- [B-09] SSC portal URLs (critical): 0 non-skipped ✓
- [B-13] Stale pending BCTC >72h: 0 ✓
- [C-06] Messages 3h: 4 (>0) ✓
- [C-07] Signals 24h: 107 (>0) ✓

## c352 · 2026-06-18T02:14:13Z
### Audit Run Tier-1 (02:14 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-21 restart count: 0 ✓
- A-30 memory: 27.42% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-18T02:14:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)         vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 33 hours (healthy)        vn-market-intelligence-mcp-frontend             33 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)          vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)          vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)          vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    3 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)          vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 7 days (healthy)          vn-market-intelligence-mcp-news-fetch           7 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 7 days (healthy)          vn-market-intelligence-mcp-alert-engine         7 days ago
headroom-proxy                                    Up 5 days                    headroom-proxy:local                            11 days ago
mcp-gateway                                       Up 7 days (healthy)          mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=27.42% MemUsage=561.5MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    41%    393k  208M    0%   /

=== PROBE DONE ===
```

## c351 · 2026-06-18T01:44:52Z
### Audit Run Tier-1 (01:44 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 21.43% < 85% ✓
- A-32 disk: 42% < 85% ✓

## c350 · 2026-06-18T01:15:00Z
### Audit Run Tier-1 (01:15 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: 0 ✓
- A-30 memory: 21.71% < 85% ✓
- A-32 disk: 40% < 85% ✓
- MCP system: status=ok, toolCount=165, uptime=7048.6s ✓

## c349 · 2026-06-18T00:45:14Z
### Audit Run Tier-1 (00:45 UTC 2026-06-18)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-21 restart count: 0 ✓
- A-30 memory: 16.11% < 85% ✓
- A-32 disk: 43% < 85% ✓
- MCP system: status=ok, toolCount=165, uptime=5242s ✓

## c348 · 2026-06-18T00:38:52Z
### Audit Run Tier-3 (00:38 UTC 2026-06-18)
- Tier: 3 | Services: 12 checked | DB checks: C-01..C-16 | Inter-service: A-22..A-28
- Anomalies: 1 CRITICAL (C-08 orphaned alerts) | 0 WARN | 0 INFO | Dedup: 0 skipped
- Status: DEGRADED
- A-01..A-11 container UP: all 12 PASS ✓
- A-12..A-19 health: all 5 PASS ✓
- A-22..A-24 tooling: pdftoppm ✓ tesseract ✓ vie-lang ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-31 EPIPE: 0 in 30m ✓
- B-08 BCTC PDFs: 80 present ✓
- C-01 OHLCV tickers: 953 ✓ (≥25)
- C-02 OHLCV rows: 953 ✓ (>0)
- C-05 SSC URLs: 0 ✓ (must be 0)
- C-06 messages 3h: 0 ✓ (pre-market, expected)
- C-07 signals 24h: 103 ✓ (>0)
- **C-08 orphaned alerts: 63 CRITICAL** (expected 0) — dup-symptom of FIX-ALERT-ORPHAN-CORRELATION (REVIEW), no re-mint per sau-c08-202606180038
- C-09 macro indicators: 3 ✓ (≥3, TradingEconomics VPS active)
- C-10 PDF failed 24h: 0 ✓ (≤2)
- C-12 DB integrity: ok ✓
- C-13 WAL: 4.1MB ✓ (<50MB)
- C-16 stale pending BCTC: 0 ✓ (0 actionable pending >72h)
