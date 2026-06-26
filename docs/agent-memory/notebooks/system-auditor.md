# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c412 · 2026-06-26T04:42:05Z
### Audit Run Tier-1 (04:41 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK
- RAW-PROBE (04:41:32Z):
  - docker ps: 12/12 host_runtime_set containers Up (healthy) [12x "Up 7 hours (healthy)"]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 28.49% PASS | A-32 Disk: 24% PASS
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c411 · 2026-06-26T04:28:58Z
### Audit Run Tier-3 (04:28 UTC 2026-06-26) — Deep DB Integrity
- Tier: 3 | Checks: A-01 to C-16 + tooling + connectivity
- Runtime: 12/12 UP, health 5/5 OK, restart=0, mem=24.82%, disk=23%
- C-01 to C-07: ALL PASS (902 tickers, 1001 rows, 32 Q1 reports, 0 SSC URLs, 125 signals)
- C-08: 1 orphaned alert (known issue FIX-AGENT-SIGNALS-ALERT_ID-ORPHAN-FK, 220 total ~39%, record-and-leave per router)
- C-09 to C-16: ALL PASS (macro 3/12 fields, 0 failed PDFs, 0 stale pending, WAL 3.94MB, DB integrity ok)
- Tooling: pdftoppm ✓ tesseract ✓ vie ✓ | Connectivity: 4/4 services ✓ | EPIPE: 0
- PDFs: 80 in /app/data/pdfs/ ✓ | B-05 BCTC: healthy-idle (queue=38 << 1715h threshold, off-season)
- Doc audit: task_board 248/80 (WARN >80, alert PM); CLAUDE.md 46L; sprint_goal 12/15 (OK)
- Anomalies: 0 NEW (C-08 existing) | Signals: 0 posted | Status: HEALTHY

## c410 · 2026-06-26T04:26:40Z
### Audit Run Tier-2 (04:26 UTC 2026-06-26) — Freshness Sweep
- Tier: 2 | Crons: 100+ firing OK | Sources: 5/5 fresh | VPS routes: 5/5 OK
- A-29 PASS: no cron gaps | B-06/B-07 PASS: all VPS proxy routes "ok"
- B-05 (BCTC Healthy-Idle): queue=38 pending, push-age 224h << SLA threshold 1714.5h (out-of-season)
- B-09 PASS: 0 SSC URLs | B-12 PASS: all rate limits ok | B-13 PASS: 0 stale pending
- DB spot checks: 3 messages in 3h, 125 signals in 24h (PASS)
- Post-reconnect note: vn-bctc-fetch service UNHEALTHY on VPS (infrastructure, pre-existing from 00:00–04:23Z disconnect)
- Anomalies: 0 NEW | Status: HEALTHY

## c409 · 2026-06-26T04:25:05Z
### Audit Run Tier-1 (04:25 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (04:25:05Z):
  - docker ps: all 12 containers Up (healthy) [RAW-PROBE L3-L14]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 24.19% PASS | A-32 Disk: 23% PASS
- MCP System: all circuits OK, cron health 100%, DB WAL 3.94 MB ✓
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY

## c408 · 2026-06-26T04:10:42Z
### Audit Run Tier-1 (04:10 UTC 2026-06-26) — Runtime Ping
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- RAW-PROBE (04:10:14Z):
  - docker ps: all 12 containers Up (healthy) [RAW-PROBE L3-L14]
  - [health] mcp-server:3000/health OK | api-gateway:4000/health OK
  - [health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
  - A-20-PROBE-1: HTTP 200 | A-20-PROBE-2: HTTP 200 | A-20-PROBE-3: HTTP 200 → 3/3 PASS
- A-21 RestartCount: mcp-server=0 PASS | A-30 Memory: 15.41% PASS | A-32 Disk: 23% PASS
- Anomalies: 0 NEW (all A-xx checks PASS) | Status: HEALTHY
