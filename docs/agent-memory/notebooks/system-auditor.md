# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c389 · 2026-06-25T22:13:08Z
### Audit Run Tier-1 (22:13 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (all INTENDED host_runtime_set) | Health: 5/5 endpoints OK
- RAW-PROBE (22:13Z): all 12 containers Up with status=healthy
  - mcp-server/frontend/macro-indicators/rag-service 33min fresh; pdf-extractor 9d+; stock-price/ta/kinh-dich 10-11d; api-gateway/news-fetch/alert-engine 2w+; mcp-gateway 5w+
  - [health] mcp-server:3000/health OK (HTTP 200)
  - [health] api-gateway:4000/health OK (HTTP 200)
  - [health] macro-indicators:5004/health OK (HTTP 200)
  - [health] pdf-extractor:5001/health OK (HTTP 200)
  - [health] frontend:3001/ OK (HTTP 200)
- A-20 pdf-extractor multi-probe: [A-20-PROBE-1] 200 | [A-20-PROBE-2] 200 | [A-20-PROBE-3] 200 → 3/3 PASS
- RestartCount: mcp-server=0 PASS; Memory: mcp-server 17.26% (<85%); Disk: 16% (<85% PASS)
- Anomalies: 0 NEW (all checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 79 rows unchanged

## c388 · 2026-06-25T22:11:27Z
### Audit Run Tier-1 (22:11 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (all INTENDED host_runtime_set) | Health: 5/5 endpoints OK
- RAW-PROBE (22:11Z): all 12 containers Up (mcp-server 32min post-recovery, rag-service 32min, frontend 32min, macro-indicators 32min, pdf-extractor 9d+, stock-price 10d+, technical-analysis 10d+, kinh-dich 11d+, api-gateway 2w+, alert-engine 2w+, news-fetch 2w+, mcp-gateway 5w+)
  - [health] mcp-server:3000/health OK (HTTP 200)
  - [health] api-gateway:4000/health OK (HTTP 200)
  - [health] macro-indicators:5004/health OK (HTTP 200)
  - [health] pdf-extractor:5001/health OK (HTTP 200)
  - [health] frontend:3001/ OK (HTTP 200)
- A-20 pdf-extractor multi-probe: [A-20-PROBE-1] 200 | [A-20-PROBE-2] 200 | [A-20-PROBE-3] 200 → 3/3 PASS
- RestartCount: mcp-server=0 PASS (fresh recovery expected, single restart OK per dedup context)
- Memory: mcp-server 17.21% (352.5MiB/2GiB PASS <85%); disk / 16% (9.4Gi/233Gi PASS <85%)
- Anomalies: 0 NEW signals (all runtime checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 79 rows unchanged

## c387 · 2026-06-25T19:25:41Z
### Audit Run Tier-3 (19:25 UTC 2026-06-25) — DB Data Integrity Sweep
- Tier: 3 | DB checks: canonical-4 deterministic sweep | Counts: db1=835, db2=1, db3=0, c04=21
- Canonical-4: MATCH baseline exactly (no change from #136)
- History: entry #137 appended (scan_ts 2026-06-25T19:25:41Z)
- Fresh OHLC violations (last 2d): 0 (NO regression)
- Orphan-FK structural: alert_id NOT-EXISTS = 220 steady (tracked residue, RECORD-ONLY)
- Anomalies: 0 NEW signals (all canonical counts stable)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 79 rows unchanged

## c386 · 2026-06-25T19:13:25Z
### Audit Run Tier-1 (19:13 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (all INTENDED host_runtime_set) | Health: 5/5 endpoints OK
- RAW-PROBE (19:13Z): docker ps -a all 12 containers Up (mcp-server 4h, rag-service 4h, frontend 38h, macro-indicators 38h, pdf-extractor 9d+, stock-price/ta/kinh-dich 10-11d, api-gateway/news-fetch/alert-engine 2w+, mcp-gateway 5w+)
  - [health] mcp-server:3000/health OK (HTTP 200)
  - [health] api-gateway:4000/health OK (HTTP 200)
  - [health] macro-indicators:5004/health OK (HTTP 200)
  - [health] pdf-extractor:5001/health OK (HTTP 200)
  - [health] frontend:3001/ OK (HTTP 200)
- A-20 pdf-extractor multi-probe: [A-20-PROBE-1] 200 | [A-20-PROBE-2] 200 | [A-20-PROBE-3] 200 → 3/3 PASS
- RestartCount: mcp-server=0 PASS; rag-service=120 RECORD-ONLY (FU-RAG-DEPLOY-MEMORY standing known, no jump)
- Memory: mcp-server 41.52% (850.2MiB/2GiB PASS <85%); disk / 27% capacity PASS <85%
- EPIPE (30m): 0 count PASS
- Cron: 160+ jobs all running, all ≥98% success_rate
- System status: all circuit breakers OK, 0 open, mcp-server uptime 3h37m
- Anomalies: 0 NEW signals
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 75 rows unchanged

## c385 · 2026-06-25T18:56:25Z
### Audit Run Tier-3 (18:55–18:56 UTC 2026-06-25) — DB Data Integrity Sweep
- Tier: 3 | DB checks: C-01–C-08 all scanned | Tables: daily_ohlcv, financial_reports, bctc_vps_queue, agent_signals, alerts, macro_indicators
- C-01: 1005 distinct codes (expected ≥25) — PASS
- C-02: 1774 daily_ohlcv rows (1d window) — PASS
- C-03: 32 Q1-2026 action_codes (BCTC) — PASS
- C-04: 0 low-confidence <0.2 (7d) — PASS (IMPROVED from 21, FIX-BCTC-ENRICH-SILENT-0ROWS working)
- C-05: 0 SSC.gov.vn URLs — PASS
- C-06: 0 market_messages (3h, market closed) — INFO
- C-07: 264 agent_signals (24h) — PASS
- C-08: 1 orphaned alert (24h, within variance) — PASS
- Canonical-4: db1=835 (hist), db2=1 (DFF), db3=0 (on-demand), c04=0 (improved)
- Orphan-FK structural: alert_id NOT-EXISTS = 220 steady (unchanged)
- Anomalies: 0 NEW signals
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 75 rows unchanged | History: +1 entry (#136)
