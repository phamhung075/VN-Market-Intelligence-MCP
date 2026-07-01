# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c455 · 2026-07-01T22:33:58Z
### Audit Run Tier-2 (22:31–22:34 UTC 2026-07-01) — Freshness Sweep
- Tier: 2 | Sources: 27 checked | Cron jobs: 140 monitored | VPS routes: 4
- Anomalies: 1 NEW CRITICAL (B-05 bctc-discover stale 21711min, 38 pending queue, vn-bctc-fetch unhealthy 15d)
- DB Freshness: C-06 pass (1 msg/3h) | C-07 pass (151 signals/24h)
- BCTC Safety: B-09 pass (0 SSC URLs) | B-13 pass (0 stale pending)
- Rate Limits: 11/11 sources OK
- Signal Row: sau-2026-07-01T22:33:43Z written (B-05 CRITICAL)
- Signals Posted: 1 (post_agent_signal id=8188)
- Status: DEGRADED

## c454 · 2026-07-01T22:13:56Z
### Audit Run Tier-1 (22:13–22:14 UTC 2026-07-01)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (22:13:56Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 4 hours" (healthy); rag-service "Up ~1h"; technical-analysis "Up 13 hours"; stock-price "Up 44 hours"; macro-indicators "Up 46 hours"; others "Up 3–6 days" (all healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 57.90% (elevated but normal, 1.158GiB/2GiB) | A-32 Disk: 47% PASS (15Gi avail)
- Anomalies: 0 NEW | Status: HEALTHY

## c453 · 2026-07-01T21:45:14Z
### Audit Run Tier-1 (21:44–21:45 UTC 2026-07-01)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (21:44:19Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 3 hours" (healthy); rag-service "Up 50min"; others "Up 3–45 hours" (all healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK | macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE: 3/3 HTTP 200 PASS
- A-21 RestartCount: mcp-server=0 ✓ | A-30 Memory: 47.50% ✓ | A-32 Disk: 49% ✓
- Anomalies: 0 NEW | Status: HEALTHY

## c452 · 2026-07-01T21:16:44Z
### Audit Run Tier-1 (21:16–21:17 UTC 2026-07-01) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (21:16:14Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 3 hours" (healthy); technical-analysis "Up 12 hours"; stock-price "Up 43 hours"; macro-indicators "Up 45 hours"; others "Up 3–6 days" (all healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 39.03% (within normal range) | A-32 Disk: 49% PASS
- MCP System: uptime 2h 38m, 16 circuits OK, WAL 3.93MB ✓, 30 alerts/24h (4 HIGH/CRITICAL, 0 unnotified)
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c451 · 2026-07-01T20:46:00Z
### Audit Run Tier-1 (20:45–20:46 UTC 2026-07-01) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (20:45:05Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 2 hours" (healthy); frontend "Up 5 hours"; others "Up 3–44 hours" (all healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 33.89% (post-rebuild nominal) | A-32 Disk: 50% PASS
- MCP System: uptime 2h 7m (post-rebuild 18:38Z), 16 circuits OK, WAL 3.96MB ✓, 30 alerts/24h (4 HIGH/CRITICAL, 0 unnotified)
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY
