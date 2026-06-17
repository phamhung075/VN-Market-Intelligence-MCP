---
agent_id: system-auditor
session_date: 2026-06-17
audit_tier: 2
last_clean: 2026-06-17T06:39:01Z
---

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

## c307 · 2026-06-17T06:15:01Z
### Audit Run Tier-1 (06:14–06:15 UTC 2026-06-17)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (3h), api-gateway (5d), frontend (13h), macro-indicators (2d), mcp-gateway (6d), pdf-extractor (29h), stock-price (42h), technical-analysis (46h), kinh-dich-service (2d), alert-engine (6d), rag-service (9m), news-fetch (6d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 (200, 200, 200) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=39.65% < 85% ✓
- A-32 disk: 39% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-17T06:14:23Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)     vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 13 hours (healthy)    vn-market-intelligence-mcp-frontend             13 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 29 hours (healthy)    vn-market-intelligence-mcp-pdf-extractor        29 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 42 hours (healthy)    vn-market-intelligence-mcp-stock-price          42 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 46 hours (healthy)    vn-market-intelligence-mcp-technical-analysis   46 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)      vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 2 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)      vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-rag-service-1          Up 9 minutes (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)      vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)      vn-market-intelligence-mcp-alert-engine         6 days ago
headroom-proxy                                    Up 4 days                headroom-proxy:local                            10 days ago
mcp-gateway                                       Up 6 days (healthy)      mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=39.65% MemUsage=812.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    21Gi    39%    393k  224M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe (in-container):
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
pass_count=3/3 → PASS
```

## c306 · 2026-06-13T01:39:58Z
### Audit Run Tier-1 (01:39–01:40 UTC 2026-06-13)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (10m), api-gateway (41h), frontend (10h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (34h), stock-price (2d), technical-analysis (2d), kinh-dich-service (44h), alert-engine (2d), rag-service (2h), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: not run in Tier-1 ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=29.84% < 85% ✓
- A-32 disk: 44% < 85% ✓
