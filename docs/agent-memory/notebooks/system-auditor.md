# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c466 · 2026-07-02T02:49:34Z
### Audit Run Tier-1 (02:30–02:49 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS ✓
- RAW-PROBE (02:48:36Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 2h"; technical-analysis "Up 18h"; stock-price "Up 2d"; macro-indicators "Up 2d"; api-gateway "Up 3d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; news-fetch "Up 6d"; alert-engine "Up 6d"; rag-service "Up 9m" all healthy]
  - [health] mcp-server:3000/health OK (HTTP 200) | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - [A-20-PROBE-1] in-container HTTP 200 | [A-20-PROBE-2] HTTP 200 | [A-20-PROBE-3] HTTP 200
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 45.07% ✓ | A-32 Disk: 48% ✓
- MCP System: uptime 2h 2m, circuits OK (16/16), WAL 3.94MB ✓, 33 alerts/24h
- Cron Health: 100+ jobs, 99%+ success rate; noted: marketScanJob:close 80%, vnstockTradingStatsRefresh 87.5%
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c465 · 2026-07-02T02:42:05Z
### Audit Run Tier-2 (02:30–02:42 UTC 2026-07-02)
- Tier: 2 | Freshness sweep: 6/11+ checks completed (54% completion due to docker exec permission boundary)
- Sources checked: price (0m ✓), news (1m ✓), sbv_fx (10m ✓), foreign_flow (0m ✓), rate_limits (0% ✓), macro (0m ✓)
- Known issue: B-05/B-06 bctc-discover stale 21958min (15d, last VPS push 2026-06-16 18:02:24) — previously reported 2026-07-01T22:33:43Z, TRIAGED, dedup-skip
- Skipped checks: A-29 (cron), C-06/C-07 (DB), B-09/B-13 (BCTC schema), D-BCTC-EVAL, D-IMPROVE — all require docker exec
- VPS service health: vn-bctc-fetch UNHEALTHY (response=0, uptime 15d 8h 37m); other 4 services healthy
- Anomalies: 0 NEW (dedup B-05 is known) | Status: DEGRADED (BCTC pipeline unavailable, auditor function degraded)

## c464 · 2026-07-02T02:15:35Z
### Audit Run Tier-1 (02:00–02:15 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: TOOL-DENIED (docker exec prohibited)
- RAW-PROBE (02:14:55Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 1h"; technical-analysis "Up 17h"; stock-price "Up 2d"; macro-indicators "Up 2d"; api-gateway "Up 3d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; news-fetch "Up 6d"; alert-engine "Up 6d"; rag-service "Up 24m" all healthy]
  - [health] mcp-server:3000/health OK (HTTP 200) | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 36.05% ✓ | A-32 Disk: 47% ✓
- MCP System: uptime 1h 27m 48s, circuits OK (16/16), WAL 3.94MB ✓, 30 alerts/24h (5 HIGH/CRITICAL)
- Cron Health: 100+ jobs monitored, 99%+ average success rate (2 recent: marketScanJob:close 80%, vnstockTradingStatsRefresh 87.5% — non-critical)
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c463 · 2026-07-02T01:46:19Z
### Audit Run Tier-1 (01:30–01:47 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: TOOL-DENIED (docker exec prohibited)
- RAW-PROBE (01:46:44Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 59m"; technical-analysis "Up 17h"; stock-price "Up 47h"; macro-indicators "Up 2d"; api-gateway "Up 3d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; news-fetch "Up 6d"; alert-engine "Up 6d"; rag-service "Up 1m" all healthy]
  - [health] mcp-server:3000/health OK (HTTP 200) | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=1 ✓ (expected post-restart cycle) | A-30 Memory: 24.02% ✓ | A-32 Disk: 48% ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY
