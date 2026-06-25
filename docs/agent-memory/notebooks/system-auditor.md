# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c345 · 2026-06-25T07:44:10Z
### Audit Run Tier-1 (07:43–07:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers UP: mcp-server (3h, RestartCount=0 BUILD-04:38Z, mem=37.12% 760.3MiB/2GiB), rag-service (2h, RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), all others stable 9d–2w
- A-20 pdf-extractor multi-probe: 3/3 PASS (200 200 200) — no event-loop stall
- A-30 mcp-server mem=37.12% (PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi free, PASS)
- B-05 BCTC healthy-idle: queue=38 pending, push-age=203h << SLA-1714.5h out-of-window → PASS
- Circuit breakers: 16/16 OK | Crons: 100+ active, success ≥98% | No gaps
- RAW-PROBE: docker ps all 12 up; health 5/5 200; mem 37.12%; disk 26% capacity
- Anomalies: 0 new | Status: HEALTHY

## c344 · 2026-06-25T07:28:02Z
### DB DATA-ANOMALY SWEEP — Tier DATA (07:26–07:28Z)
- **CANONICAL-4** (deterministic helper scan_ts 2026-06-25T07:26:39Z): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21 — FROZEN identical to scan #112
- **Baseline freshness**: daily_ohlcv_total=18251, newest_date=2026-06-25 (CURRENT), market_prices_freshness=2026-06-25T07:26:48Z (~0 min FRESH)
- **TABLES CHECKED**: 13 high-value (daily_ohlcv, market_prices, alerts, price_alerts, agent_signals, deep_fetch_queue, scheduler_locks, financial_reports, others)
- **INTEGRITY**: market_prices fresh 07:26:48Z, NULL_count=0, negative_volume=0; alerts=1653 normal; agent_signals=4201 (with ~4156 expired by-design); deep_fetch_queue 0 stuck >8h; scheduler_locks released weeklyPortfolioReport (released_at=2026-06-22T01:59:31)
- **ANOMALIES**: 0 NEW detected — all by-design states (db1/db2/db3/c04 frozen, financial_reports net_revenue<=0 or NULL=31, agent_signals expired backlog by-design GC-absent)
- **HISTORY APPEND**: 112→113 entries (scan_ts=2026-06-25T07:28:02Z, counts embedded deterministically, helper-verified grown)
- **STATUS**: STEADY-STATE — no new signals required; market data live and fresh

## c343 · 2026-06-25T07:13:25Z
### Audit Run Tier-1 (07:13–07:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers UP: mcp-server (3h, RestartCount=0 REBUILD-04:38Z, mem=27.04% 553MiB/2GiB), rag-service (2h, RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), all others stable 9d–2w
- A-20 pdf-extractor multi-probe: 3/3 PASS (200 200 200) — no event-loop stall
- A-30 mcp-server mem=27.04% (PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi free, PASS)
- B-05 BCTC healthy-idle: queue=38 pending, push-age=202.5h << SLA-1714.5h out-of-window → PASS
- Circuit breakers: 16/16 OK | Crons: 100+ active, success ≥98% | No gaps
- RAW-PROBE L4–L50: docker ps all up; health 5/5 200; mem 27.04%; disk 26%
- Anomalies: 0 new | Status: HEALTHY

## c342 · 2026-06-25T06:56:11Z
### DB DATA-ANOMALY SWEEP — Tier DATA (06:54–06:56Z)
- **CANONICAL-4** (deterministic helper scan_ts 2026-06-25T06:55:03Z): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21 — FROZEN identical to scan #111 (no change)
- **Baseline freshness**: daily_ohlcv_total=18250, newest_date=2026-06-25 (CURRENT), market_prices_freshness=2026-06-25T06:54:15Z (~1 min FRESH)
- **TABLES CHECKED**: 14 high-value (daily_ohlcv, market_prices, cron_job_runs, deep_fetch_queue, scheduler_locks, sbv_rates, macro_indicators, agent_signals, alerts, others)
- **INTEGRITY**: cron_job_runs 19 recent jobs all success; deep_fetch_queue 573 expired (by-design); 0 held scheduler locks; 0 stuck pending >4h; market_prices 121 rows, no negative/zero; sbv_rates fresh ~10min old
- **ANOMALIES**: 0 NEW detected — macro_indicators stale 18h (cadence unknown, likely daily/weekly by-design, no CRITICAL flag); all canonical-4 FROZEN; findings by-design-tracked
- **HISTORY APPEND**: 111→112 entries (scan_ts=2026-06-25T06:56:11Z, counts embedded deterministically, helper-verified grown)
- **STATUS**: STEADY-STATE — no new signals required; market data live and fresh

## c341 · 2026-06-25T06:44:46Z
### Audit Run Tier-1 (06:44–06:45 UTC 2026-06-25)
- Tier: 1 | Services: 11/11 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers: mcp-server (2h14m, RestartCount=0 FRESH-BUILD-04:38Z, mem=511MiB), rag-service (RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), all others stable
- A-30 mcp-server mem=19.95% (511MiB/2GiB, PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi free, PASS)
- B-05 BCTC: queue=38 pending, push-age=201.8h << SLA-1714.5h out-of-window → HEALTHY-IDLE PASS
- VPS proxy: prices/news/sbv OK; bctc stale (by-design off-season, not actionable per SLA)
- Crons: 100+ jobs active, success rates ≥98%, no fire gaps
- Anomalies: 0 new | Status: HEALTHY
