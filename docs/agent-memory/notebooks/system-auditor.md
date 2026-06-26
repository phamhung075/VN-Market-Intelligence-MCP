# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c421 · 2026-06-26T08:43:08Z
### Audit Run Tier-1 (08:42–08:43 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (08:42:14Z):
  - docker ps: 12/12 host_runtime_set UP [12x "Up 11 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 55.92% PASS | A-32 Disk: 24% PASS
- MCP System: 16 circuits OK, uptime 11h 3m, cron health 100% (105+ jobs), WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c420 · 2026-06-26T08:11:55Z
### Audit Run Tier-1 (08:11–08:11 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | Restarts: 0
- RAW-PROBE (08:11:44Z):
  - docker ps: 12/12 host_runtime_set UP [12x "Up 11 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 48.40% PASS | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c419 · 2026-06-26T07:41:41Z
### Audit Run Tier-1 (07:41–07:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (07:41:41Z):
  - docker ps: 12/12 host_runtime_set + headroom-proxy + mcp-gateway UP [12x "Up 10 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 46.29% PASS | A-32 Disk: 24% PASS
- MCP System: 16 circuits OK, uptime 10h 2m, cron health 100%, WAL 4.05MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c418 · 2026-06-26T07:13:18Z
### Audit Run Tier-1 (07:12–07:13 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (07:12:10Z):
  - docker ps: 12/12 host_runtime_set + headroom-proxy + mcp-gateway UP [12x "Up 10 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 45.94% PASS | A-32 Disk: 24% PASS
- MCP System: 16 circuits OK, uptime 9h 33m, cron health 100%, WAL 3.94MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c417 · 2026-06-26T06:42:23Z
### Audit Run Tier-1 (06:41–06:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (06:41:36Z):
  - docker ps: 12/12 host_runtime_set + headroom-proxy + mcp-gateway UP [12x "Up 9 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 41.06% PASS | A-32 Disk: 24% PASS
- MCP System: 16 circuits OK, uptime 9h 2m, cron health 105/105 (100%), WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c416 · 2026-06-26T06:32:46Z
### Audit Run Tier-2 (06:30–06:32 UTC 2026-06-26) — Freshness Sweep
- Tier: 2 | Cron jobs: 100+ checked (100% healthy) | Sources: 15+ checked | VPS routes: 4/5 ok
- A-29 (Cron Fire): all jobs last_run within 2×cadence, no gaps | Status: PASS
- B-01 to B-12 (Source Freshness): all within SLA thresholds; applied SLA resolver for bctc-discover (off-window: 1714.5h threshold >> 240h age) | PASS
- B-05/B-06 (BCTC): healthy idle gate applied (36 url_not_found + 2 enrich_failed off-season rows ≠ actionable work) | PASS
- B-13 (Stale BCTC pending): 0 rows > 72h | PASS
- C-06/C-07 (DB freshness spot): market_messages 3h=5 rows | agent_signals 24h=123 rows | PASS
- VPS proxy: prices/news/sbv all ok (bctc off-season push 2026-06-16 18:02, known idle) | PASS
- Rate limits: all 14 sources ready (B-12) | PASS
- BCTC URLs: 0 SSC URLs in queue (B-09) | PASS
- Anomalies: 0 NEW (all B-xx/C-spot checks PASS) | Dedup-skipped: 0 | Status: HEALTHY

## c415 · 2026-06-26T06:12:54Z
### Audit Run Tier-1 (06:11 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (06:11:53Z):
  - docker ps: 12/12 host_runtime_set + headroom-proxy UP (healthy) [12x "Up 9 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 57.30% PASS | A-32 Disk: 24% PASS
- MCP System: 16 circuits OK, uptime 8h 33m, cron health 100%, WAL 3.96MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c414 · 2026-06-26T05:42:25Z
### Audit Run Tier-1 (05:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (05:42:25Z):
  - docker ps: all 12 host_runtime_set + headroom-proxy UP (healthy) [12x "Up 8 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 38.68% PASS | A-32 Disk: 24% PASS
- MCP System: 16 circuits OK, uptime 8h 2m, cron health 100%, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c413 · 2026-06-26T05:12:03Z
### Audit Run Tier-1 (05:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (05:12:03Z):
  - docker ps: 12/12 host_runtime_set containers Up (healthy) [12x "Up 8 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 31.77% PASS | A-32 Disk: 24% PASS
- MCP System: all 16 circuits OK, uptime 7h 33m, WAL 4.00MB ✓ | Crons: 100% success
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY
