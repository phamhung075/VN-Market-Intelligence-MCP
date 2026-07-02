# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c468 · 2026-07-02T03:45:21Z
### Audit Run Tier-1 (03:30–03:45 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: SKIP (boundary — docker exec denied)
- RAW-PROBE (03:44:52Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 3h (healthy)"; api-gateway "Up 3d"; frontend "Up 12h"; technical-analysis "Up 19h"; stock-price "Up 2d"; macro-indicators "Up 2d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; rag-service "Up 2m (healthy)"; news-fetch "Up 6d"; alert-engine "Up 6d"; mcp-gateway "Up 6d"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 66.41% ✓ | A-32 Disk: 48% ✓
- MCP System: uptime 2h 57m 43s, circuits OK (16/16), WAL 0B ✓, 30 alerts/24h (5 HIGH/CRITICAL)
- Cron Health: 100+ jobs, 99%+ success rate; noted: marketScanJob:close 80%, vnstockTradingStatsRefresh 87.5%
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c467 · 2026-07-02T03:16:15Z
### Audit Run Tier-1 (03:00–03:16 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK
- RAW-PROBE (03:15:37Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 2h (healthy)"; api-gateway "Up 3d"; frontend "Up 12h"; technical-analysis "Up 18h"; stock-price "Up 2d"; macro-indicators "Up 2d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; rag-service "Up 5m"; news-fetch "Up 6d"; alert-engine "Up 6d"; mcp-gateway "Up 6d"]
  - [health] mcp-server:3000/health OK (HTTP 200) | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=1 ✓ | A-32 Disk: 48% ✓
- A-20 multi-probe: SKIPPED(boundary — docker exec permission denied per dispatcher note)
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c466 · 2026-07-02T02:49:34Z
### Audit Run Tier-1 (02:30–02:49 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS ✓
- RAW-PROBE (02:48:36Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 2h"; technical-analysis "Up 18h"; stock-price "Up 2d"; macro-indicators "Up 2d"; api-gateway "Up 3d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; news-fetch "Up 6d"; alert-engine "Up 6d"; rag-service "Up 9m"]
  - [health] mcp-server:3000/health OK (HTTP 200) | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - [A-20-PROBE-1] in-container HTTP 200 | [A-20-PROBE-2] HTTP 200 | [A-20-PROBE-3] HTTP 200
- A-21 RestartCount: mcp-server=1 ✓ | A-30 Memory: 45.07% ✓ | A-32 Disk: 48% ✓
- MCP System: uptime 2h 2m, circuits OK (16/16), WAL 3.94MB ✓, 33 alerts/24h
- Cron Health: 100+ jobs, 99%+ success rate; noted: marketScanJob:close 80%, vnstockTradingStatsRefresh 87.5%
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY
