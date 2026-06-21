# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c253 · 2026-06-21T06:37:46Z
### Audit Run Tier-1 (06:37 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3 probes
- Anomalies: 0 NEW (all runtime checks PASS; stable)
- Status: HEALTHY

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ | A-21 restart: 0 ✓
- A-30 memory: 32.79% ✓ | A-32 disk: 37% ✓

**Signals:** 0 NEW | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T06:36:49Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)   vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)    vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)    vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)    vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)    vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)    vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)   vn-market-intelligence-mcp-rag-service          10 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)   vn-market-intelligence-mcp-news-fetch           10 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)   vn-market-intelligence-mcp-alert-engine         10 days ago
mcp-gateway                                       Up 10 days (healthy)   mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=32.79% MemUsage=671.4MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%    393k  242M    0%   /
```

**A-20 Multi-Probe Results:**
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```
Pass count: 3/3 (majority vote PASS) ✓

## c252 · 2026-06-21T06:32:07Z
### Audit Run Tier-2 (06:32 UTC 2026-06-21, Sunday off-market)
- Tier: 2 | Freshness sweep: 27 sources checked | Cron gaps: 0 | VPS routes: 5 healthy
- Anomalies: 0 NEW (all freshness checks PASS; weekend context applied)
- Status: HEALTHY (weekend/market-closed, price staleness INFO-flagged)

**Verdict Summary:**
- B-01..B-07 sources: all current cadence ✓ | B-09 BCTC URLs: 0 bad ✓ | B-13 stale pending: 0 ✓
- C-06 messages (3h): 0 (EXPECTED weekend) → INFO | C-07 signals (24h): 58 ✓
- VPS health: 5/5 routes active (vn-bctc-fetch idle=expected, vn-price-fetch idle=expected on closed market)
- OHLCV last date: 2026-06-19 (Fri, last trading day) → EXPECTED, no Sat/Sun trading

**Signals:** 0 NEW | Status: CLEAN | Weekend applied: price/FX staleness downgraded to INFO
