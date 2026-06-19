# System Auditor Notebook

## c362 · 2026-06-19T03:37:35Z
### Audit Run Tier-1 (03:37 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + A-20 multi-probe
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (mcp-server 4h, rag-service 50m, others stable)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy) ✓
- A-21 restart count: 0 ✓
- A-30 memory: 30.43% < 85% ✓
- A-32 disk: 35% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T03:37:23Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)      vn-market-intelligence-mcp-mcp-server           4 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)       vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)       vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)       vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 days (healthy)       vn-market-intelligence-mcp-macro-indicators     3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)       vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 50 minutes (healthy)   vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)       vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)       vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days                 headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)       mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=30.43% MemUsage=623.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  271M    0%   /

--- A-20 multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```

## c361 · 2026-06-19T03:07:39Z
### Audit Run Tier-1 (03:07 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed + A-20 multi-probe
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (mcp-server 4h, rag-service 20m, others stable)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy) ✓
- A-21 restart count: 0 ✓
- A-30 memory: 30.48% < 85% ✓
- A-32 disk: 35% < 85% ✓

## c359 · 2026-06-19T02:30:42Z
### Audit Run Tier-2 (02:30 UTC 2026-06-19)
- Tier: 2 | Freshness checks: 4 on-disk | Checks: B-01..B-07, B-11..B-13 flagged
- Anomalies: 0 new (all on-disk PASS) | Dedup: 0
- Status: HEALTHY (on-disk checks)
- **GATEWAY-BLIND**: local spawn lacks MCP tools; most B-* checks DEFERRED to cloud RemoteTrigger
- On-disk checks RUN:
  - B-08 (BCTC PDF landing): 80 files > 0 ✓ PASS
  - B-09 (SSC portal URL shape): 0 malformed URLs ✓ PASS
  - C-06 (market_messages 3h): 4 rows > 0 ✓ PASS
  - C-07 (agent_signals 24h): 113 rows > 0 ✓ PASS
  - B-13 (stale pending BCTC >72h): 0 rows ✓ PASS
- Deferred checks (require MCP, gateway-blind in local spawn):
  - A-29: Cron fire gaps | B-01-B-07: Per-source freshness | B-06-B-07: VPS proxy health
  - B-11, B-12: Rate limits | D-BCTC-EVAL: Eval sweep | D-IMPROVE: Proposals
