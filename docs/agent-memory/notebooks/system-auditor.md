# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c469 · 2026-07-02T04:17:53Z
### Audit Run Tier-1 (04:00–04:17 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS ✓
- RAW-PROBE (04:16:13Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 3h (healthy)"; api-gateway "Up 3d"; frontend "Up 13h"; technical-analysis "Up 19h"; stock-price "Up 2d"; macro-indicators "Up 2d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; rag-service "Up 1m"; news-fetch "Up 6d"; alert-engine "Up 6d"; mcp-gateway "Up 6d"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - [A-20-PROBE-1] in-container HTTP 200 | [A-20-PROBE-2] HTTP 200 | [A-20-PROBE-3] HTTP 200
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 82.66% ⚠ CLIMBING (45→66→82) | A-32 Disk: 48% ✓
- MCP System: uptime 3h 29m 31s, circuits OK (16/16), WAL 0B ✓, 30 alerts/24h (5 HIGH/CRITICAL)
- Cron Health: 100+ jobs, 99%+ success rate; marketScanJob:close 80%, vnstockTradingStatsRefresh 87.5% (tracked)
- Anomalies: 1 WARN (A-30 memory trend climbing — known stale-image leak, fix d9280133 blocked on user approval)
- Status: HEALTHY (escalation flag: A-30 >70%)

## c468 · 2026-07-02T03:45:21Z
### Audit Run Tier-1 (03:30–03:45 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: SKIP (boundary — docker exec denied)
- RAW-PROBE (03:44:52Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 3h (healthy)"; api-gateway "Up 3d"; frontend "Up 12h"; technical-analysis "Up 19h"; stock-price "Up 2d"; macro-indicators "Up 2d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; rag-service "Up 2m (healthy)"; news-fetch "Up 6d"; alert-engine "Up 6d"; mcp-gateway "Up 6d"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 66.41% ✓ | A-32 Disk: 48% ✓
- Anomalies: 0 NEW | Status: HEALTHY

## c467 · 2026-07-02T03:16:15Z
### Audit Run Tier-1 (03:00–03:16 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK
- RAW-PROBE: 12/12 UP; A-21 RestartCount mcp-server=1 ✓; A-32 Disk 48% ✓
- A-20 multi-probe: SKIPPED (boundary — docker exec permission denied)
- Anomalies: 0 NEW | Status: HEALTHY

## c466 · 2026-07-02T02:49:34Z
### Audit Run Tier-1 (02:30–02:49 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS ✓
- RAW-PROBE (02:48:36Z): 12/12 UP; [A-20-PROBE-1/2/3] all HTTP 200
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 45.07% ✓ | A-32 Disk: 48% ✓
- Anomalies: 0 NEW | Status: HEALTHY
