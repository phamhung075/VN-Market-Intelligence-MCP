---
agent_id: system-auditor
session_date: 2026-06-17
audit_tier: 1
last_clean: 2026-06-17T07:29:46Z
---

## c310 · 2026-06-17T07:29:46Z
### Audit Run Tier-1 (07:28–07:29 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (15m fresh), api-gateway (5d), frontend (14h), macro-indicators (2d), mcp-gateway (6d), pdf-extractor (30h), stock-price (43h), technical-analysis (47h), kinh-dich-service (2d), alert-engine (6d), rag-service (45m), news-fetch (6d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 (200, 200, 200) ✓ (no event-loop stall)
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=7.85% < 85% ✓
- A-32 disk: 38% < 85% ✓
- MCP system: 16 circuit breakers OK, DB uptime 15m 48s, WAL 3.94 MB, all ~140 cron jobs healthy ✓
- Context: mcp-server rebuild ~05:13Z (P0-A ohlcvForeignFlowStore merge + P0-B ta/bbAlertScanJob stub guards) — fresh uptime expected and normal ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T07:28:56Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 15 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           15 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 14 hours (healthy)     vn-market-intelligence-mcp-frontend             14 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 30 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        30 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 43 hours (healthy)     vn-market-intelligence-mcp-stock-price          43 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 47 hours (healthy)     vn-market-intelligence-mcp-technical-analysis   47 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-rag-service-1          Up 45 minutes (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)       vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)       vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days                 headroom-proxy:local                            10 days ago
mcp-gateway                                       Up 6 days (healthy)       mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=7.85% MemUsage=160.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    22Gi    38%    393k  231M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe (in-container):
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
pass_count=3/3 → PASS
```

## c309 · 2026-06-17T06:44:46Z
### Audit Run Tier-1 (06:44–06:45 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (4h), api-gateway (5d), frontend (13h), macro-indicators (2d), mcp-gateway (6d), pdf-extractor (29h), stock-price (43h), technical-analysis (46h), kinh-dich-service (2d), alert-engine (6d), rag-service (1m), news-fetch (6d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 (200, 200, 200) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=46.74% < 85% ✓
- A-32 disk: 40% < 85% ✓
- MCP system: 16 circuit breakers OK, DB size 281.61 MB, WAL 0 B, all cron jobs healthy ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T06:44:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                        IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)          vn-market-intelligence-mcp-mcp-server           4 hours ago
vn-market-intelligence-mcp-frontend-1             Up 13 hours (healthy)         vn-market-intelligence-mcp-frontend             13 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 29 hours (healthy)         vn-market-intelligence-mcp-pdf-extractor        29 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 43 hours (healthy)         vn-market-intelligence-mcp-stock-price          43 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 46 hours (healthy)         vn-market-intelligence-mcp-technical-analysis   46 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)           vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)           vn-market-intelligence-mcp-kinh-dich-service    2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)           vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-rag-service-1          Up About a minute (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)           vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)           vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days                     headroom-proxy:local                            10 days ago
mcp-gateway                                       Up 6 days (healthy)           mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=46.74% MemUsage=957.3MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    40%    393k  211M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe (in-container):
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
pass_count=3/3 → PASS
```

## c308 · 2026-06-17T06:39:01Z
### Audit Run Tier-2 (06:30–06:41 UTC 2026-06-17)
- Tier: 2 | Sources: 31 checked | Cron jobs: 141 verified | VPS routes: 4/4 probed
- Anomalies: 3 new (0 critical, 3 warn, 0 info) | Dedup: 0 skipped
- Status: DEGRADED
- Cron checks A-29: all pass (no >2× gaps detected) ✓
- Per-source freshness B-01..B-07, B-11..B-12: 28 pass, 3 fail (WARN)
  - B-06 FAIL: bctc-push VPS proxy stale 12.6h (last push 2026-06-16 18:02:24)
  - B-07 FAIL: vn-foreign-flow service unhealthy (uptime 3h 46m)
  - B-13 FAIL: bctc_vps_queue 8 pending rows >72h old (actionable backlog)
- DB spot checks C-06, C-07: both pass (market_messages=4, agent_signals=135)
- BCTC URL shape B-09: pass (0 SSC portal URLs in non-skipped queue)
- Rate limits B-12: all sources <100% ✓
- VPS proxy B-06/B-07: 3 ok (prices/news/sbv), 1 STALE (bctc) ⚠

### Signals Emitted:
- signal_id=6411: B-06 bctc-push proxy stale
- signal_id=6412: B-13 bctc pending backlog 8 rows
- signal_id=6413: B-07 foreign-flow service unhealthy
- Telegram: 3 messages sent to BUG channel
