# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## 0dd94b3 · 2026-07-21T22:32:54Z
### Audit Run Tier-2 (22:31–22:32 UTC 2026-07-21)
- Tier: 2 | Sources: 7 checked | Cron: 98 jobs nominal, 0 gaps | VPS: news OK, sbv/bctc off-hours idle
- DB: market_messages 3h=1 PASS, agent_signals 24h=402 PASS | BCTC: 183 pending (healthy for off-hours)
- Rate limits: 14 APIs at 0% capacity | Anomalies: 0 new (DEGRADED→HEALTHY recovery) | Status: HEALTHY

## d5c3f7e · 2026-07-21T22:10:41Z
### Audit Run Tier-1 (22:10–22:11 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: 95.69% (GC sawtooth pattern, dedup applies) | A-32 Disk: 27% PASS
- Cron health: All 98 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T22:10:41Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)   vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        6 hours ago
mcp-gateway                                       Up 6 days (healthy)    mcpservergatway-gateway                         6 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)    vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)    vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)    vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)    vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)    vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)    vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)    vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=95.69% MemUsage=2.871GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    37Gi    27%    393k  391M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

## cee9029 · 2026-07-21T21:48:51Z
### Audit Run Tier-1 (21:46–21:48 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: FALSE-POSITIVE GC sawtooth PASS | A-32 Disk: 26% PASS
- Anomalies: 0 new | Status: HEALTHY

## c3a2f1c · 2026-07-21T21:11:38Z
### Audit Run Tier-1 (21:11–21:11 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Container status: 12 UP (healthy)
- Anomalies: 0 new | 1 dedup-skipped (A-30 mem) | Status: HEALTHY

## c1f9d2b · 2026-07-21T18:41:15Z
### Audit Run Tier-1 (18:40–18:41 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | A-30 Memory: 64.41% PASS | Anomalies: 0 new | Status: HEALTHY

## c4e8f3a · 2026-07-21T18:32:31Z
### Audit Run Tier-2 (18:15–18:32 UTC 2026-07-21)
- Tier: 2 | Cron checks: 87 all nominal | Sources: 28 checked | VPS routes: 4 checked
- Freshness: 1 stale (sbv_fx CRITICAL) | VPS services: 2 unhealthy (vn-bctc-fetch, vn-sbv-fetch WARN)
- Anomalies: 6 new (1 critical, 2 warn, 3 info/BCTC-EVAL) | Status: DEGRADED
