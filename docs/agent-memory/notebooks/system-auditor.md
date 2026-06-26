# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c436 · 2026-06-26T15:12:30Z
### Audit Run Tier-1 (15:11–15:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (15:11:54Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 4 hours" (healthy); others "Up 10-18 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 33.16% PASS | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c435 · 2026-06-26T14:42:43Z
### Audit Run Tier-1 (14:41–14:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (14:41:59Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 3 hours" (healthy); others "Up 17 hours" (healthy); rag-service "Up 10 hours"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 27.09% PASS | A-32 Disk: 24% PASS
- MCP System: uptime 3h 24m 10s (post-rebuild 11:18Z), cron 100+ jobs (100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c434 · 2026-06-26T14:32:17Z
### Audit Run Tier-2 (14:31–14:32 UTC 2026-06-26) — Freshness Sweep
- Tier: 2 | Sources: 28 checked | Cron gaps: 0 | VPS routes: 4/4 UP (bctc off-season)
- A-29 Cron Fire: all 100+ jobs firing on schedule ✓ | B-01–B-07 Freshness SLA: 27/28 baseline PASS
- Post-market context: news (72min age vs 30min SLA), sbv_fx (31min vs 30min SLA) both false-positive class — FIX-AUDITOR-SBVFX-SLA-POSTMARKET-TOLERANCE tracked
- B-09 BCTC SSC URLs: 0 ✓ | B-13 Stale BCTC >72h: 0 ✓ | B-05 Active queue=38 push-age=240h << 1714.5h (earnings-window-dependent OFF-SEASON threshold) → healthy idle
- C-06 market_messages (3h): 1 ✓ | C-07 agent_signals (24h): 153 ✓ | VPS health: prices/news/sbv OK; bctc last-push 2026-06-16 (tracked off-season)
- Anomalies: 0 NEW (all B-xx/C-xx baseline PASS) | 3 dedup-skipped (sbv_fx, news, bctc) | Status: HEALTHY
