# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c443 · 2026-06-26T18:31:45Z
### Audit Run Tier-2 (18:31–18:31 UTC 2026-06-26) — Freshness Sweep
- Tier: 2 | Cron jobs: 100+ @ 100% success (A-29: PASS) | Sources: 7 checked | VPS routes: 4 checked | Rate limits: 14 OK
- Cron fire gaps: NONE (all jobs firing on schedule, 100% success rate)
- Per-source freshness: prices/news/sbv OK | bctc stale (dedup: off-season Q1→Q2 inter-quarter idle; tracked FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP)
- VPS proxy: 3/4 UP (prices/news/sbv active; bctc 2026-06-16 last push — healthy idle, queue=0 gate applies, NOT CRITICAL)
- DB spot checks: C-06 (0 msgs 3h, off-hours PASS) | C-07 (158 signals 24h PASS) | B-09 (0 SSC URLs PASS) | B-13 (0 stale pending PASS)
- Anomalies: 0 NEW | Status: HEALTHY

## c442 · 2026-06-26T18:11:34Z
### Audit Run Tier-1 (18:11–18:12 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (18:11:34Z):
  - docker ps: 12/12 host_runtime_set UP [mcp-server "Up 7 hours" (healthy); others "Up 21 hours" (healthy)]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 51.23% (vs 45.13%@17:41, +6.1pt rise in 30min; leak ~6pt/h FIX-MCP-MEMORY-CODE-LEAK tracked) | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS; dedup baseline applies) | Status: HEALTHY

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
