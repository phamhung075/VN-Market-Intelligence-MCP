# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c424 · 2026-06-26T10:11:39Z
### Audit Run Tier-1 (10:11–10:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (10:11:39Z):
  - docker ps: 12/12 host_runtime_set UP [all "Up 13 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 65.13% PASS | A-32 Disk: 24% PASS
- MCP System: uptime 12h 32m 53s, cron 100+ jobs (100% success), 16 circuits OK, WAL 1.82MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c423 · 2026-06-26T09:41:34Z
### Audit Run Tier-1 (09:41–09:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (09:41:34Z):
  - docker ps: 12/12 host_runtime_set UP [all "Up 12 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 59.87% PASS | A-32 Disk: 24% PASS
- MCP System: uptime 12h 2m 56s, cron health 100+ jobs all success, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c422 · 2026-06-26T09:12:15Z
### Audit Run Tier-1 (09:11–09:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (09:11:28Z):
  - docker ps: 12/12 host_runtime_set UP [12x "Up 12 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 59.28% PASS | A-32 Disk: 24% PASS
- MCP System: uptime 12h, cron health 100+, WAL healthy ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

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
