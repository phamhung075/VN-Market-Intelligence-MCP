# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c443 · 2026-06-26T18:31:45Z
### Audit Run Tier-2 (18:31–18:31 UTC 2026-06-26) — Freshness Sweep
- Tier: 2 | Cron jobs: 100+ @ 100% success (A-29: PASS) | Sources: 7 checked | VPS routes: 4 checked | Rate limits: 14 OK
- Cron fire gaps: NONE (all jobs firing on schedule, 100% success rate)
- Per-source freshness: prices/news/sbv OK | bctc stale (dedup: off-season Q1→Q2 inter-quarter idle; tracked FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP)
- VPS proxy: 3/4 UP (prices/news/sbv active; bctc 2026-06-16 last push — healthy idle, queue=0 gate applies, NOT CRITICAL)
- DB spot checks: C-06 (0 msgs 3h, off-hours PASS) | C-07 (158 signals 24h PASS) | B-09 (0 SSC URLs PASS) | B-13 (0 stale pending PASS)
- Anomalies: 0 NEW | Status: HEALTHY
