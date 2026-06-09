[NB] Total lines:       ~200L (post-cycle-cap)
<!-- System Auditor Notebook — Tier-1/2/3 audit cycle log. NEWEST-FIRST ordering. Max 200L total. -->

## c282 · 2026-06-09T00:05:10Z
### Audit Run Tier-1 (00:05 UTC 2026-06-09 → 2026-06-09 07:05 VN)
- Tier: 1 | Services: 6 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor, mcp-gateway)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 6 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200, mcp-gateway (not in host_runtime_set, INFO skip).
- Restart count: mcp-server=2 (PASS, ≤2); memory=52.72% (PASS, <85%); disk=38% used/233GB (PASS).
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health HTTP 200 all probes, no event-loop stall).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c281 · 2026-06-08T23:35:00Z
### Audit Run Tier-1 (23:35 UTC 2026-06-08 → 2026-06-09 06:35 VN)
- Tier: 1 | Services: 6 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor, mcp-gateway)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 6 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200, mcp-gateway (not in host_runtime_set, INFO skip).
- Restart count: mcp-server=2 (PASS, ≤2); memory=48.49% (PASS, <85%); disk=38% used/233GB (PASS).
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health HTTP 200 all probes, no event-loop stall).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

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
