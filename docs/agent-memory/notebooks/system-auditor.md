[NB] Total lines:       ~168
<!-- System Auditor Notebook — Tier-1/2/3 audit cycle log. NEWEST-FIRST ordering. Max 200L total. -->

## c280 · 2026-06-08T23:05:54Z
### Audit Run Tier-1 (23:05 UTC 2026-06-08)
- Tier: 1 | Services: 5 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 5 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200.
- Restart count: mcp-server=2 (PASS, ≤2); memory=51.04% (PASS, <85%); disk=39% used/233GB (PASS).
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health HTTP 200 all probes, no event-loop stall).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c279 · 2026-06-08T22:35:56Z
### Audit Run Tier-1 (22:35 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor, api-gateway)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 6 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200, mcp-gateway INFO-skip (not in host_runtime_set).
- Restart count: mcp-server=2 (PASS, ≤threshold); memory=50.24% (PASS, <85%); disk=38% used/233GB (PASS).
- A-33 vnstockFundamentalsRefresh: crashed at 2026-06-08T01:00Z (0% success, 1 run) — dedup-skip BUG (c121/c120 window active, emitted 2026-06-08T19:05).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c278 · 2026-06-08T22:31:10Z
### Audit Run Tier-2 (22:31 UTC 2026-06-08)
- Tier: 2 | Sources: 28 checked | VPS routes: 4 checked | DB spot checks: 4
- Anomalies: 0 new | 1 dedup-skipped (B-13, from c112 15:23)
- Status: HEALTHY
- A-29 Cron fire gaps: all nominal (intelligenceCycleJob 98.9%, bctcPdfPullJob 97.9%, all last_run recent)
- B-01–B-07, B-11–B-12: all sources fresh within SLA (price 1min, bctc 335min <360, news 191min <482, sbv_fx 1min, foreign_flow 451min <842)
- C-06 market_messages (3h): 1 ✓ | C-07 agent_signals (24h): 117 ✓ | B-09 BCTC URLs: 0 bad ✓ | B-13 stale BCTC: 26 >72h (dedup-skip, c112 active)
- VPS proxy: prices/news OK; sbv last push 2026-06-07T04:59Z (41.5h, stale), bctc 2026-06-08T00:30Z (22h, borderline)
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c277 · 2026-06-08T22:06:44Z
### Audit Run Tier-1 (22:06 UTC 2026-06-08 → 2026-06-09 07:06 VN)
- Tier: 1 | Services: 6 checked (mcp-server, api-gateway, frontend, macro-indicators, mcp-gateway, pdf-extractor)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 6 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200, mcp-gateway (not in host_runtime_set, INFO skip).
- Restart count: mcp-server=2 (PASS, ≤threshold); memory=49.78% (PASS, <85%); disk=5.6% used/233GB (PASS).
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health HTTP 200 all probes).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c276 · 2026-06-08T21:35:38Z
### Audit Run Tier-1 (21:35 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor, mcp-gateway)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 6 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200, mcp-gateway 4040→200.
- Restart count: mcp-server=2 (PASS, ≤threshold); memory=45.12% (PASS, <85%); disk=36% used/25GB avail (PASS).
- No A-20 multi-probe this cycle (deferred to Tier-3).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c275 · 2026-06-08T21:14:35Z
### Audit Run Tier-1 (21:14 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor, mcp-gateway)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 6 services UP (docker ps healthy); health endpoints: mcp-server 3000→200, api-gateway 4000→200, frontend 3001→404 (static React, expected), macro-indicators 5004→200, pdf-extractor 5001→200, mcp-gateway 4040→200.
- Restart count: mcp-server=2 (PASS, known recurrence from prior audit), others=0.
- Memory: 33.68% | Disk: 40% (PASS).
- A-20 pdf-extractor tooling checks deferred to Tier-3.
- Cron health: vnstockFundamentalsRefresh crash dedup-skip (recurring, c121/c120 7d window active).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

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

## c121 · 2026-06-08T19:05:17Z
### Audit Run Tier-1 (19:05 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 new CRITICAL | Status: DEGRADED
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK (mcp-server 3000, api-gateway 4000, macro-indicators 5004, pdf-extractor 5001, frontend 3001); restart=2; memory=27.46%; disk=38%.
- A-33 CRON-CRASH: vnstockFundamentalsRefresh crashed at 2026-06-08T01:00:00Z (0% success, 1 run) — CRITICAL, signal row emitted, BUG Telegram sent.
- Contract: signals_posted=0 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=0
