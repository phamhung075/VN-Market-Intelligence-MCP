# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c434 · 2026-06-26T14:32:17Z
### Audit Run Tier-2 (14:31–14:32 UTC 2026-06-26) — Freshness Sweep
- Tier: 2 | Sources: 28 checked | Cron gaps: 0 | VPS routes: 4/4 UP (bctc off-season)
- A-29 Cron Fire: all 100+ jobs firing on schedule ✓ | B-01–B-07 Freshness SLA: 27/28 baseline PASS
- Post-market context: news (72min age vs 30min SLA), sbv_fx (31min vs 30min SLA) both false-positive class — FIX-AUDITOR-SBVFX-SLA-POSTMARKET-TOLERANCE tracked
- B-09 BCTC SSC URLs: 0 ✓ | B-13 Stale BCTC >72h: 0 ✓ | B-05 Active queue=38 push-age=240h << 1714.5h (earnings-window-dependent OFF-SEASON threshold) → healthy idle
- C-06 market_messages (3h): 1 ✓ | C-07 agent_signals (24h): 153 ✓ | VPS health: prices/news/sbv OK; bctc last-push 2026-06-16 (tracked off-season)
- Anomalies: 0 NEW (all B-xx/C-xx baseline PASS) | 3 dedup-skipped (sbv_fx, news, bctc) | Status: HEALTHY

## c433 · 2026-06-26T14:12:18Z
### Audit Run Tier-1 (14:11–14:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (14:11:35Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 3 hours" (healthy); others "Up 17 hours" (healthy); rag-service "Up 9 hours"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 24.77% PASS | A-32 Disk: 24% PASS
- MCP System: uptime 2h 53m 39s (post-rebuild 11:18Z), cron 100+ jobs (100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c432 · 2026-06-26T13:41:26Z
### Audit Run Tier-1 (13:41–13:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (13:41:26Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 2 hours" (healthy); others "Up 16 hours" (healthy); rag-service "Up 9 hours"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 19.55% PASS | A-32 Disk: 24% PASS
- MCP System: uptime 2h 23m 53s (post-rebuild 11:18Z), cron 100+ jobs (100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c431 · 2026-06-26T13:11:51Z
### Audit Run Tier-1 (13:11–13:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK
- RAW-PROBE (13:11:40Z): all 12 host_runtime_set UP (mcp-server "Up 2 hours" healthy; others "Up 16 hours" healthy)
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 19.50% PASS | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c430 · 2026-06-26T12:42:51Z
### Audit Run Tier-1 (12:42–12:43 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (12:41:58Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up About an hour" (healthy); others "Up 15 hours" (healthy); rag-service "Up 8 hours"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 17.79% PASS | A-32 Disk: 24% PASS
- MCP System: uptime 1h 23m 45s (post-rebuild 11:18Z), cron 100+ jobs (100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c429 · 2026-06-26T12:11:56Z
### Audit Run Tier-1 (12:11–12:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (12:11:31Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 53 minutes" (healthy); others "Up 15 hours" (healthy); rag-service "Up 7 hours"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 16.99% PASS | A-32 Disk: 24% PASS
- MCP System: uptime 53m 58s (post-rebuild 11:18Z), cron 100+ jobs (100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY
