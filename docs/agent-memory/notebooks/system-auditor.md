# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c441 · 2026-06-26T17:41:29Z
### Audit Run Tier-1 (17:41–17:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (17:41:29Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 6 hours" (healthy); others "Up 13-20 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 45.13% (vs 39.99%@17:11, +5.14pt rise in 30min; leak ~7pt/h FIX-MCP-MEMORY-CODE-LEAK tracked) | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS; dedup baseline applies) | Status: HEALTHY

## c440 · 2026-06-26T17:11:42Z
### Audit Run Tier-1 (17:11–17:13 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (17:11:42Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 6 hours" (healthy); others "Up 20 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 39.99% PASS (vs 42.89%@16:41, -2.9pt decline; leak ~7pt/h FIX-MCP-MEMORY-CODE-LEAK tracked) | A-32 Disk: 24% PASS
- MCP System: uptime ~6h (post-rebuild 11:18Z), cron 100+ jobs (100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS; dedup baseline applies) | Status: HEALTHY

## c439 · 2026-06-26T16:42:10Z
### Audit Run Tier-1 (16:41–16:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (16:41:43Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 5 hours" (healthy); others "Up 19 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 42.89% PASS (vs 38.77%@16:11, +4.12pt rise tracked FIX-MCP-MEMORY-CODE-LEAK; ~6pt/h leak normal, rebuild threshold ~70%) | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS; all known issues dedup-skipped per 7-day window) | Status: HEALTHY

## c438 · 2026-06-26T16:11:43Z
### Audit Run Tier-1 (16:11–16:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (16:11:43Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 5 hours" (healthy); others "Up 19 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 38.77% PASS (vs 36%@15:41, +2.8pt rise tracked FIX-MCP-MEMORY-CODE-LEAK) | A-32 Disk: 24% PASS
- MCP System: uptime 4h 54m 6s (post-rebuild 11:18Z), cron 100+ jobs (100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c437 · 2026-06-26T15:42:39Z
### Audit Run Tier-1 (15:41–15:42 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (15:41:44Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 4 hours" (healthy); others "Up 10-18 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 36.02% PASS (vs 33%@15:11, +3pt rise tracked) | A-32 Disk: 24% PASS
- MCP System: uptime 4h 23m 52s (post-rebuild 11:18Z), cron 100+ jobs (100% success), 16 circuits OK, WAL 3.93MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

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
