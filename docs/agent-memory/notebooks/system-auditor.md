# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c458 · 2026-07-01T23:45:27Z
### Audit Run Tier-1 (23:44–23:46 UTC 2026-07-01) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (23:44:26Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 1h" (healthy); rag-service "Up 7s"; others "Up 3–47h" all healthy]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE: 3/3 HTTP 200 PASS (event-loop healthy)
- A-21 RestartCount: mcp-server=0 ✓ | A-30 Memory: 56.39% ✓ | A-32 Disk: 48% ✓
- MCP System: uptime 1h 17m, circuits OK, WAL 3.94MB ✓, 30 alerts/24h (4 HIGH/CRITICAL)
- Cron Health: 140+ jobs monitored, 99.5% avg success (intelligenceCycle 99.5%, others ≥99%)
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c457 · 2026-07-01T23:15:06Z
### Audit Run Tier-1 (23:15–23:16 UTC 2026-07-01) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (23:15:06Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 47min" rebuild 22:27Z; rag-service "Up 34min" healthy; frontend "Up 8h"; technical-analysis "Up 14h"; stock-price "Up 45h"; macro-indicators "Up 47h"; others "Up 6d" all healthy]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE: 3/3 HTTP 200 PASS (event-loop healthy)
- A-21 RestartCount: mcp-server=0 ✓ | A-30 Memory: 30.86% (632MiB/2GiB) ✓ | A-32 Disk: 46% ✓
- MCP System: uptime 48m 42s (post-rebuild), circuits OK, WAL 3.93MB ✓, 30 alerts/24h (4 HIGH/CRITICAL)
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c456 · 2026-07-01T22:44:16Z
### Audit Run Tier-1 (22:44–22:45 UTC 2026-07-01) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (22:44:16Z):
  - docker ps: 12/12 host_runtime_set UP (mcp-server "Up 17min" rebuild 22:27Z; rag-service "Up 3min" healthy; others "Up 3–46h" all healthy)
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE: 3/3 HTTP 200 PASS
- A-21 RestartCount: mcp-server=0 ✓ | A-30 Memory: 14.87% ✓ | A-32 Disk: 51% ✓
- MCP System: uptime 17m 38s, circuits OK, WAL 3.93MB ✓, 30 alerts/24h (4 HIGH/CRITICAL)
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY
