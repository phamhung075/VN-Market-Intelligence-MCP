<!-- System Auditor Notebook — Tier-1/2/3 audit cycle log. NEWEST-FIRST ordering. Max 200L total. -->

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

## c111 · 2026-06-08T14:58:28Z
### Audit Run Tier-1 (14:58 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 dedup-skipped (A-20 within 7-day window, prev c106/c105) | Status: DEGRADED (recurring)
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK except pdf-extractor A-20 timeout (curl 3s max-time fails); restart=0; memory=12.76%; disk=27%.
- Findings: pdf-extractor A-20 health timeout recurring (container UP in docker ps, /health probe curl fails). Signal row: sau-c111-a20 (WARN). Dedup active (no BUG).
- Contract: signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0

## c110 · 2026-06-08T07:54:33Z
### Audit Run Tier-2 (07:54 UTC 2026-06-08)
- Tier: 2 | Crons: 63 checked | Sources: 28 checked | VPS routes: 4 OK
- Anomalies: 1 CRITICAL-dedup (B-12 SBV stale) | Status: DEGRADED
- A-29 crons: 63 nominal, vnstockFundamentalsRefresh crashed (isolated).
- B-01..B-07 pipeline: prices/BCTC/foreign-flow/news fresh; SBV stale 26.9h (>24h threshold) CRITICAL.
- B-06/B-07 VPS health: 4 routes OK (prices/news/sbv/bctc). SBV last push 2026-06-07 04:59:57Z.
- B-09 BCTC URLs: 0 bad SSC URLs (PASS). B-13 stale BCTC: 0 pending >72h (PASS).
- C-06/C-07 DB freshness: market_messages 2/3h OK, agent_signals 87/24h OK.
- Signals: 1 emitted (B-12 continuation). BUG Telegram: skipped (dedup active from c107).
- Signal Queue: 1 row appended (sau-c109-b12-continuation, CRITICAL).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0

## c109 · 2026-06-08T07:54:37Z
### Audit Run Tier-2 (07:54 UTC 2026-06-08)
- Tier: 2 | Status: HEALTHY
- No anomalies detected in freshness or cron health. A-29 all crons nominal.

## c108 · 2026-06-08T06:31:33Z
### Audit Run Tier-1 (06:31 UTC 2026-06-08)
- Tier: 1 | Status: HEALTHY
- All services UP/healthy. A-20 pdf-extractor health endpoint OK.

## c107 · 2026-06-08T02:01:54Z
### Audit Run Tier-2 (02:01 UTC 2026-06-08)
- Tier: 2 | Crons: 63 checked | Sources: 28 checked | VPS routes: 4 OK
- Anomalies: 1 CRITICAL (B-12 SBV stale) | Status: DEGRADED
- A-29 crons: All 63 firing normally, no gaps. intelligenceCycleJob 99.1% success (562 runs).
- B-01..B-07 pipeline: Prices/BCTC/foreign-flow fresh, news 10min <30min OK, SBV 21h+ stale.
- B-06/B-07 VPS health: All 4 routes OK, push logs show sbv/news stale vs expected cadence.
- B-12 SLA CRITICAL: sbv_fx 47min breach (30min threshold). sbvRatesRefreshJob ran 2026-06-08 00:00Z success, but market.db fetch timestamp stale. Clock skew or silent fetch fail suspected.
- Signals: 1 emitted (CRITICAL sau-c107-b12). BUG Telegram: B-12 sbv-stale (new, no dedup).
- Contract: signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1
