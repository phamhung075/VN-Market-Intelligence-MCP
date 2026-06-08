[NB] Total lines:       89
<!-- System Auditor Notebook — Tier-1/2/3 audit cycle log. NEWEST-FIRST ordering. Max 200L total. -->

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
- Signals posted: 0 | Telegram sent: 0 | Signal_queue rows: 2 (NEW) | Dashboard rows: 2
- Contract: [OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=2 | dashboard_rows=2

## c118 · 2026-06-08T18:07:47Z
### Audit Run Tier-1 (18:07 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 new CRITICAL | Status: DEGRADED
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=2; memory=12.18%; disk=37%.
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health probes all HTTP 200).
- CRON-VNSTOCK-CRASH: vnstockFundamentalsRefresh crashed (0% success, 1 run) — CRITICAL, signal row emitted, BUG Telegram sent.
- Contract: signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=0

## c117 · 2026-06-08T17:35:25Z
### Audit Run Tier-1 (17:35 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 | Status: HEALTHY
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=2; memory=11.96%; disk=36%.
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health probes all HTTP 200).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c116 · 2026-06-08T17:05:05Z
### Audit Run Tier-1 (17:05 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 | Status: HEALTHY
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=1; memory=11.55%; disk=35%.
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health probes all HTTP 200).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c115 · 2026-06-08T16:35:56Z
### Audit Run Tier-1 (16:35 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 | Status: HEALTHY
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=0; memory=4.43%; disk=32%.
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health probes all HTTP 200).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c114 · 2026-06-08T16:05:42Z
### Audit Run Tier-1 (16:05 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 | Status: HEALTHY
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=0; memory=23.65%; disk=32%.
- All services in host_runtime_set operational: mcp-server ~1h, api-gateway 21h, frontend 21h, macro-indicators 16h, mcp-gateway 21h, pdf-extractor 8h uptime.
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c113 · 2026-06-08T15:35:32Z
### Audit Run Tier-1 (15:35 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 | Status: HEALTHY
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=0; memory=21.21%; disk=32%.
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health probes all HTTP 200).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c112 · 2026-06-08T15:23:39Z
### Audit Run Tier-2 (15:23–15:35 UTC 2026-06-08)
- Tier: 2 | Sources: 27 checked | VPS routes: 4 checked | DB spot checks: 3
- Anomalies: 3 new (2 CRITICAL, 1 WARN) | 1 dedup-skipped
- Status: DEGRADED
- Cron: vnstockFundamentalsRefresh crashed (0% success, isolated); 100+ other crons nominal
- B-01 BCTC stale 38.5h (>360min SLA, CRITICAL) — last fetch 2026-06-06T01:55Z
- B-12 SBV_FX stale 53min (>30min SLA, CRITICAL) — vn-sbv-fetch unhealthy (49m uptime)
- B-13 stale pending BCTC: 26 rows >72h (WARN); non-actionable deferred_infra/blocked_pdf_extractor excluded
- C-06/C-07 DB freshness: market_messages 1/3h OK, agent_signals 113/24h OK
- B-09 BCTC URL shape: 0 bad SSC URLs (PASS)
- VPS proxy: sbv/bctc marked stale in push log; vn-sbv-fetch unhealthy
- Dedup: sau-c109-b12 (SBV check, 7d window active) — BUG Telegram skipped, DASHBOARD row appended
- Signals posted: 3 | Telegram sent: 2 | Signal_queue rows: 3 | Dashboard rows: 3
- Contract: [OUTPUT-CONTRACT] signals_posted=3 | telegram_sent=2 | signal_queue_rows_written=3 | dashboard_rows=3
