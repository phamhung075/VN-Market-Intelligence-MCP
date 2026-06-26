# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c428 · 2026-06-26T11:42:57Z
### Audit Run Tier-1 (11:42–11:43 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (11:42:01Z): all 12 host_runtime_set UP; mcp-server rebuilt 23m ago (11:18Z, rebuild cleared prior memory leak)
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE: 3/3 HTTP 200 (pdf-extractor event-loop healthy)
- A-21 RestartCount: 0 PASS | A-30 Memory: 9.76% PASS (vs 82.73% pre-rebuild) | A-32 Disk: 24% PASS
- Cron health: 100+ jobs all success | Circuits: 16/16 OK | WAL 3.93MB
- Anomalies: 0 NEW (all A-xx PASS; prior A-30 WARN resolved by rebuild) | Status: HEALTHY

## c427 · 2026-06-26T11:12:28Z
### Audit Run Tier-1 (11:12–11:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (11:12:01Z):
  - docker ps: 12/12 host_runtime_set UP [all "Up 14 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=0 PASS | A-32 Disk: 24% PASS
- **A-30 WARN**: mcp-server memory 82.73% of 2GiB (1.655GiB), climbing from 67.11% in 30min. Pending rebuild expected to resolve.
- Anomalies: 1 NEW (W warn: A-30 memory pressure) | Status: DEGRADED-MINOR

## c426 · 2026-06-26T10:41:32Z
### Audit Run Tier-1 (10:41–10:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (10:41:32Z):
  - docker ps: 12/12 host_runtime_set UP [all "Up 13 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 67.11% PASS | A-32 Disk: 24% PASS
- MCP System: uptime 13h 2m 54s, cron 100+ jobs (100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c425 · 2026-06-26T10:33:35Z
### Audit Run Tier-2 (10:33 UTC 2026-06-26) — Freshness Sweep
- Tier: 2 | Sources: 28 checked | Cron gaps: 0 | VPS routes: 4/4 OK (bctc tracked false-positive)
- A-29 Cron Fire: all 100+ jobs firing on schedule ✓ | B-01–B-07 Freshness SLA: 27/28 PASS (post-market)
- B-12 Rate Limits: all 0% wait ✓ | B-13 Stale BCTC: 0 rows >72h ✓ | C-06,C-07: 2 market_messages, 148 agent_signals ✓
- B-05 BCTC Healthy-Idle Gate applied (queue=0, host UP, push-age 239h << 1752h threshold) → healthy idle
- **1 NEW anomaly found**: sbv_fx post-market freshness breach (31min age vs 30min SLA; 1min overage; WARN severity)
- Anomalies: 1 NEW (W warn) | 1 dedup-skipped (vn-bctc-fetch HTTP false-positive) | Status: DEGRADED-MINOR
