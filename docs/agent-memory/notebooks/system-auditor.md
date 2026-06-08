[NB] Total lines:       ~110
<!-- System Auditor Notebook — Tier-1/2/3 audit cycle log. NEWEST-FIRST ordering. Max 200L total. -->

## c123 · 2026-06-08T20:35:29Z
### Audit Run Tier-1 (20:35 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=2; memory=33.68%; disk=40%.
- A-20 pdf-extractor multi-probe: not re-probed this cycle (A-22–A-28 reserved for Tier-3).
- Cron health: vnstockFundamentalsRefresh still crashed (0% success, last_run 2026-06-08T01:00Z) — dedup-skip BUG (already emitted c121/c120 within 7d).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c122 · 2026-06-08T20:02:45Z
### Audit Run Tier-1 (20:02 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=2 (PASS); memory=32.04% (PASS); disk=38%.
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health probes all HTTP 200, no event-loop stall detected).
- Cron health: vnstockFundamentalsRefresh still crashed (recurring from c120/c121, triaged as transient 2026-06-08T19:xx, no new action this cycle).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c122 · 2026-06-08T20:06:33Z
### Audit Run Tier-1 (20:06 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=2; memory=31.53%; disk=40%.
- A-20 pdf-extractor multi-probe: 3/3 PASS (all in-container health probes HTTP 200).
- vnstockFundamentalsRefresh crash persists (from c121 01:00 UTC) — dedup-skip BUG (recurrence, already emitted in c121).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c121 · 2026-06-08T19:05:17Z
### Audit Run Tier-1 (19:05 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 new CRITICAL | Status: DEGRADED
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=2; memory=27.46%; disk=38%.
- A-33 CRON-CRASH: vnstockFundamentalsRefresh crashed at 2026-06-08T01:00:00Z (0% success, 1 run) — CRITICAL, signal row emitted, BUG Telegram sent.
- Contract: signals_posted=0 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=0

## c120 · 2026-06-08T18:36:27Z
### Audit Run Tier-1 (18:36 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 new CRITICAL | Status: DEGRADED
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=2; memory=22.37%; disk=39%.
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health probes all HTTP 200).
- A-33 CRON-CRASH: vnstockFundamentalsRefresh crashed (0% success, 1 run) — CRITICAL, signal row emitted, BUG Telegram sent.
- Contract: signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=0

## c119 · 2026-06-08T18:35:01Z
### Audit Run Tier-2 (18:35 UTC 2026-06-08)
- Tier: 2 | Sources: 27 checked | VPS routes: 4 checked | DB spot checks: 2
- Anomalies: 2 recurring (1 CRITICAL, 1 WARN) | 2 dedup-skipped for BUG
- Status: DEGRADED
- A-29 Cron fire gaps: all nominal (intelligenceCycleJob success 99.1%, bctcPdfPullJob 97.9%, all last_run recent)
- B-12 SBV_FX stale 65min (>30min SLA, CRITICAL) — vn-sbv-fetch unhealthy (1h7m uptime); dedup-skip BUG (sau-c109-b12 from c112)
- B-13 stale pending BCTC: 26 rows >72h (WARN); dedup-skip BUG (from c112 15:23)
- B-01 BCTC: last fetch 2026-06-06T01:55Z, 41h elapsed (<168h out-of-window, PASS)
- C-06/C-07 DB freshness: market_messages 2/3h, agent_signals 115/24h (both PASS)
- B-09 BCTC URL shape: 0 bad SSC URLs (PASS) | VPS proxy: sbv/bctc stale (push log: sbv 2026-06-07T04:59Z, bctc 2026-06-08T00:30Z)

## c118 · 2026-06-08T18:07:47Z
### Audit Run Tier-1 (18:07 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 new CRITICAL | Status: DEGRADED
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=2; memory=12.18%; disk=37%.
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health probes all HTTP 200).
- CRON-VNSTOCK-CRASH: vnstockFundamentalsRefresh crashed (0% success, 1 run) — CRITICAL, signal row emitted, BUG Telegram sent.
- Contract: signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=0
