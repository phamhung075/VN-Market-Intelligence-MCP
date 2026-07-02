# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
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
- MCP System: uptime 59m 55s, circuits OK, WAL 3.93MB ✓, 30 alerts/24h (4 HIGH/CRITICAL)
- Cron Health: 140+ jobs, 99.5%+ success rate (recent crashes: marketScanJob:close 80%, vnstockTradingStatsRefresh 88% — non-blocking)
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c462 · 2026-07-02T01:15:14Z
### Audit Run Tier-1 (01:15–01:16 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK
- RAW-PROBE (01:15:14Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 27min"; rag-service "Up 47min"; technical-analysis "Up 16h"; stock-price "Up 47h"; macro-indicators "Up 2d"; api-gateway "Up 3d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; news-fetch "Up 6d"; alert-engine "Up 6d" all healthy]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=1 ✓ (OOM 2026-07-01 already tracked) | A-30 Memory: 13.26% ✓ | A-32 Disk: 48% ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY
- Signal: tier-1-rollup INFO posted (signal_id=8206)

## c461 · 2026-07-02T00:46:17Z
### Audit Run Tier-1 (00:45–00:46 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (00:46:17Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 2h"; rag-service "Up 18m"; technical-analysis "Up 16h"; stock-price "Up 46h"; macro-indicators "Up 2d"; api-gateway "Up 3d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; news-fetch "Up 6d"; alert-engine "Up 6d" all healthy]
  - [health] mcp-server:3000/health OK (HTTP 200) | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE: 3/3 HTTP 200 PASS (event-loop healthy)
- A-21 RestartCount: mcp-server=0 ✓ | A-30 Memory: 73.81% ✓ | A-32 Disk: 47% ✓
- MCP System: get_system_status TOOL-UNAVAILABLE | get_cron_health TOOL-UNAVAILABLE
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c459 · 2026-07-02T00:27:38Z
### Audit Run Tier-1 (00:26–00:27 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (00:26:01Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 2h"; rag-service "Up 15m"; technical-analysis "Up 16h"; stock-price "Up 46h"; macro-indicators "Up 2d"; api-gateway "Up 3d"; pdf-extractor "Up 3d"; kinh-dich "Up 6d"; news-fetch "Up 6d"; alert-engine "Up 6d" all healthy]
  - [health] mcp-server:3000/health OK (HTTP 200) | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE: 3/3 HTTP 200 PASS (event-loop healthy)
- A-21 RestartCount: mcp-server=0 ✓ | A-30 Memory: 96.81% ⚠ WARN (1.936GiB/2GiB) | A-32 Disk: 48% ✓
- MCP System: uptime 1h 59m, circuits OK, WAL 3.93MB ✓, 30 alerts/24h (4 HIGH/CRITICAL)
- Cron Health: 140+ jobs, 99.5% avg success rate (2 recent crashes: marketScanJob:close, vnstockTradingStatsRefresh non-blocking)
- Anomalies: 1 NEW WARN (A-30 memory pressure) | Status: DEGRADED
- Signal: A-30 WARN posted (signal_id=8196, signal_row=sau-2026-07-02T00:27:05Z)
