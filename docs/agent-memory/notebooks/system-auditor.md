# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c472 · 2026-07-02T05:44:48Z
### Audit Run Tier-1 (05:30–05:45 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS ✓
- RAW-PROBE (05:44:48Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 5h (healthy)"; api-gateway "Up 3d"; frontend "Up 14h"; technical-analysis "Up 21h"; stock-price "Up 2d"; macro-indicators "Up 2d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; rag-service "Up 25m"; news-fetch "Up 6d"; alert-engine "Up 6d"; mcp-gateway "Up 6d"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - [A-20-PROBE-1] HTTP 200 | [A-20-PROBE-2] HTTP 200 | [A-20-PROBE-3] HTTP 200
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 99.66% ⚠⚠⚠ CRITICAL SPIKE (98.96→99.66% in 14min) | A-32 Disk: 39% ✓
- MCP System: uptime 4h 58m, circuits OK (16/16), WAL 0B ✓; cron 99%+ success; intelligenceCycleJob running; 10 unresolved errors (non-fatal)
- Anomalies: 1 CRITICAL (A-30 memory 99.66% — OOM-kill imminent, restart_count=1 same epoch, freeze predicate holds NO BUG re-emit; signal #8233 posted, orch-state row added) | Status: DEGRADED
- Trend: 66.41% (03:45Z) → 82.66% (04:17Z) → 85.51% (04:45Z) → 98.96% (05:15Z) → 99.66% (05:44Z) — climbing ~6.5pp/min last 14min

## c471 · 2026-07-02T05:15:18Z
### Audit Run Tier-1 (05:00–05:15 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS ✓
- RAW-PROBE (05:15:18Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 4h (healthy)"; api-gateway "Up 3d"; frontend "Up 14h"; technical-analysis "Up 20h"; stock-price "Up 2d"; macro-indicators "Up 2d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; rag-service "Up 7m"; news-fetch "Up 6d"; alert-engine "Up 6d"; mcp-gateway "Up 6d"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - [A-20-PROBE-1/2/3] all in-container HTTP 200
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 98.96% ⚠⚠ CRITICAL SPIKE (85.51→98.96% in 30min) | A-32 Disk: 40% ✓
- MCP System: uptime 4h 28m, circuits OK (16/16), WAL 0B ✓; cron health 99%+ success rate; 10 unresolved errors (non-fatal)
- Anomalies: 0 NEW SIGNALS (no OOM kill, restart=1, escalation already captured at c470) | Status: DEGRADED

## c470 · 2026-07-02T04:45:28Z
### Audit Run Tier-1 (04:30–04:45 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS ✓
- RAW-PROBE (04:45:00Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 4h (healthy)"; api-gateway "Up 3d"; frontend "Up 13h"; technical-analysis "Up 20h"; stock-price "Up 2d"; macro-indicators "Up 2d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; rag-service "Up 14m"; news-fetch "Up 6d"; alert-engine "Up 6d"; mcp-gateway "Up 6d"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - [A-20-PROBE-1/2/3] all in-container HTTP 200
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 85.51% ⚠ CRITICAL (threshold exceeded) | A-32 Disk: 38% ✓
- MCP System: uptime 3h 58m, circuits OK (16/16), WAL 0B ✓
- Anomalies: 1 CRITICAL (A-30 memory 85.51% exceeds hard threshold 85% — climbing trend ~25pp/h) | Status: DEGRADED
- Signal #8226 posted; orch-state signal_queue row sau-2026-07-02T04:45Z appended

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
