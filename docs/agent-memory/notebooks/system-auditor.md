# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c448 · 2026-06-26T20:41:52Z
### Audit Run Tier-1 (20:41–20:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK
- RAW-PROBE (20:41:52Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 26 minutes" (healthy, rebuilt); others "Up 23 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 12.70% (fresh post-rebuild baseline, FIX-MCP-MEMORY-CODE-LEAK tracked) | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS; dedup baseline applies) | Status: HEALTHY

## c447 · 2026-06-26T20:12:19Z
### Audit Run Tier-1 (20:11–20:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK
- RAW-PROBE (20:11:50Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 9 hours" healthy; api-gateway "Up 23 hours"; others "Up 23 hours"; pdf-extractor "Up 23 hours"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 62.75% (within healthy range) | A-32 Disk: 24% PASS
- MCP System: uptime ~8h 53m, 109 cron jobs (98-100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS; dedup baseline applies) | Status: HEALTHY

## c446 · 2026-06-26T19:41:38Z
### Audit Run Tier-1 (19:41–19:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK
- RAW-PROBE (19:41:38Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 8 hours" (healthy); others "Up 22 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 51.85% (vs 52.36%@19:11, -0.51pt; leak tracked ~6pt/h, rebuild threshold ~70%) | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS; baseline dedup applies) | Status: HEALTHY

## c445 · 2026-06-26T19:11:34Z
### Audit Run Tier-1 (19:11–19:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (19:11:34Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 8 hours" (healthy); others "Up 22 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 52.36% (vs 53.11%@18:42, -0.75pt decline; FIX-MCP-MEMORY-CODE-LEAK tracked, rebuild threshold ~70%) | A-32 Disk: 24% PASS
- MCP System: uptime ~7h 53m (post-rebuild 11:18Z), cron 100+ jobs (100% success), 16 circuits OK, WAL 3.91MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS; dedup baseline applies) | Status: HEALTHY

## c444 · 2026-06-26T18:42:20Z
### Audit Run Tier-1 (18:42–18:43 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (18:42:20Z):
  - docker ps: 12/12 host_runtime_set UP (all healthy; mcp-server "Up 7 hours"; others "Up 21 hours")
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 53.11% (vs 51.23%@18:11, +1.88pt; ~6pt/h leak FIX-MCP-MEMORY-CODE-LEAK tracked, rebuild threshold ~70%) | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS; dedup baseline applies) | Status: HEALTHY
