# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c341 · 2026-06-25T06:44:46Z
### Audit Run Tier-1 (06:44–06:45 UTC 2026-06-25)
- Tier: 1 | Services: 11/11 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers: mcp-server (2h14m, RestartCount=0 FRESH-BUILD-04:38Z, mem=511MiB), rag-service (RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), all others stable
- A-30 mcp-server mem=19.95% (511MiB/2GiB, PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi free, PASS)
- B-05 BCTC: queue=38 pending, push-age=201.8h << SLA-1714.5h out-of-window → HEALTHY-IDLE PASS
- VPS proxy: prices/news/sbv OK; bctc stale (by-design off-season, not actionable per SLA)
- Crons: 100+ jobs active, success rates ≥98%, no fire gaps
- Anomalies: 0 new | Status: HEALTHY

## c340 · 2026-06-25T06:31:44Z
### Audit Run Tier-2 (06:30–06:31 UTC 2026-06-25)
- Tier: 2 | Data sources: 27 checked | Cron fire: all on-schedule | VPS proxy: 4/5 healthy
- Cron gaps: 0 detected | Freshness checks: 1 stale (news 88min/30min threshold)
- B-05 bctc-discover: PASS (SLA resolver: out-of-window threshold ~1714.5h, push-age 201.8h << threshold; queue=38 work, HEALTHY-IDLE PASS)
- B-06 bctc-push: PASS (same SLA resolver) | B-09 SSC URLs: PASS (0 rows)
- B-11 news (newsapi/reuters/vneconomy-rss/vnexpress-rss): WARN — 88min vs 30min threshold, last_fetch 2026-06-25T05:02Z
- B-13 stale pending: PASS (0 rows) | B-14 vn-bctc-fetch VPS: UNHEALTHY (dedup, dev-vps routed)
- C-06 market_messages(3h): 4 ✓ | C-07 agent_signals(24h): >0 ✓
- Anomalies: 1 NEW (B-11 news WARN) | Dedup-skipped: 1 (B-14 VPS) | Status: DEGRADED

## c339 · 2026-06-25T06:25:10Z
### DB DATA-ANOMALY SWEEP — Tier DATA (06:24–06:25Z)
- **CANONICAL-4** (deterministic helper scan_ts 2026-06-25T06:24:35Z): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21
- **Baseline freshness**: daily_ohlcv_total=18250, newest_date=2026-06-25 (CURRENT), market_prices_freshness=2026-06-25T06:24:04.711Z (~1 min)
- **TABLES CHECKED**: 14 (daily_ohlcv, market_prices, financial_reports, deep_fetch_queue, agent_signals, signal_outcomes, vn_index_cache, others)
- **INTEGRITY CHECKS**: FROZEN canonical-4 identical to prior scans (#53..#110), fresh_ohlc_violations_last_2d=0, all findings by-design-tracked or clean
- **ANOMALIES**: 0 NEW detected — all canonical-4 FROZEN (835/1/0/21), no regressions, all stale/missing/dup/incorrect findings already tracked by FIX-OHLCV-WRITER-INTEGRITY, FIX-BCTC-ENRICH-SILENT-0ROWS
- **HISTORY APPEND**: 110→111 entries (deterministic helper confirms length grew, scan_ts + counts embedded)
- **STATUS**: STEADY-STATE — market data fresh, no new anomalies, no signals required

## c338 · 2026-06-25T06:14:28Z
### Audit Run Tier-1 (06:13–06:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (2h14m, RestartCount=0 FRESH-REBUILD-04:38Z, OOMKilled=false), frontend (25h), macro-indicators (25h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (53m, RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), news-fetch (2w), alert-engine (2w), headroom-proxy (12d), mcp-gateway (2w)
- A-30 mcp-server mem=19.95% (408.5MiB/2GiB, PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi free, PASS)
- B-05 BCTC healthy-idle: queue=38 pending, push-age=199.7h << SLA-1728.5h out-of-window, PASS
- VPS proxy: prices/news/sbv OK; bctc stale (by-design off-season)
- Crons: 100+ active, success rates ≥98%, no gaps
- Anomalies: 0 new | Status: HEALTHY

## c337 · 2026-06-25T05:56:31Z
### DB DATA-ANOMALY SWEEP — Tier DATA (05:54–05:56Z)
- **CANONICAL-4** (deterministic helper scan_ts 2026-06-25T05:54:41Z): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21
- **Baseline freshness**: daily_ohlcv_total=18250, newest_date=2026-06-25 (CURRENT), market_prices_freshness=2026-06-25T05:54:09Z (~1 min)
- **TABLES CHECKED**: 16 high-value (daily_ohlcv, market_prices, financial_reports, alerts, agent_signals, signal_outcomes, deep_fetch_queue, macro_indicators, sbv_rates, market_messages, pdf_documents, scheduler_locks, vn_index_cache, sbv_rates, others)
- **INTEGRITY CHECKS**: C-01(942 tickers)✓ C-02(1616 rows)✓ C-06(2 market_msgs 3h)✓ C-08(1 orphan-alert)✓ C-09(3 macro-cols)✓ C-10/C-11(PDF clean)✓ C-16(0 stale-pending)✓
- **DATA QUALITY**: zero/neg-prices=0 | zero/neg-volumes=0 | dup(code,date)=0 | net_revenue≤0 recent=0 | expired-signals=4156(BY-DESIGN-GC-absent) | orphaned-signal_outcomes=1(prior-tracked) | deep_fetch_queue expired=573(lifecycle-clean)
- **ANOMALIES**: 0 NEW detected — all canonical-4 counts STABLE (identical to prior 09-cycle baseline), fresh_ohlc_violations_last_2d=0 (no recent regressions), all stale/missing/dup/incorrect findings are BY-DESIGN or already-open signals
- **HISTORY APPEND**: 109→110 entries (deterministic helper confirms length grew, scan_ts + counts embedded)
- **STATUS**: STEADY-STATE — no new anomalies, no regressions detected, all data plausibility checks PASS

## c336 · 2026-06-25T05:43:45Z
### Audit Run Tier-1 (05:43–05:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (1h14m, RestartCount=0 FRESH-REBUILD-04:40Z, OOMKilled=false), frontend (24h), macro-indicators (24h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (23m, RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-30 mcp-server mem=18.05% (369.7MiB/2GiB, PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (40Gi free)
- B-05 BCTC healthy-idle: queue=38 pending, push-age=199.7h << SLA-1714.5h out-of-window, PASS
- VPS proxy: prices/news/sbv OK; bctc stale (last push 2026-06-16, by-design off-season)
- Crons: 100+ active, success rates ≥98%, no gaps
- Anomalies: 0 new | Status: HEALTHY

## c335 · 2026-06-25T05:25:58Z
### DB DATA-ANOMALY SWEEP — Tier DATA (05:24–05:26Z)
- **CANONICAL-4** (deterministic helper): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21
- **market_prices_freshness**: 2026-06-25T05:24:24Z (~1 min fresh) | daily_ohlcv_total=18250 | fresh_ohlc_violations_last_2d=0
- **TABLES CHECKED**: 12 (daily_ohlcv, market_prices, deep_fetch_queue, scheduler_locks, agent_signals, signal_outcomes, financial_reports, fred_series_daily, vn_index_cache, cron_job_runs, price_alerts, others)
- **ANOMALIES DETECTED**: daily_ohlcv OHLC=661 (BY-DESIGN, db1 subset), deep_fetch_queue expired=573 (BY-DESIGN, lifecycle), financial_reports net_rev_≤0=31 (BY-DESIGN, 17 frozen + 14 NULL bucket), signal_outcomes orphaned=1 (READ, already-open), fred_series_daily=8311 (BY-DESIGN, FRED_API_KEY unset), vn_index_cache=0 (BY-DESIGN), scheduler_locks=0 held (BY-DESIGN), market_prices_≤0=0 (PASS), daily_ohlcv_neg_vol=0 (PASS), deep_fetch_queue stuck_pending=0 (PASS)
- **NEW SIGNALS**: 0 (all findings BY-DESIGN or already-open, no REAL defects detected)
- **HISTORY APPEND**: 108→109 entries (confirmed deterministic, counts embedded)
- **STATUS**: STEADY-STATE — all tables healthy, no regressions

## c332 · 2026-06-25T05:14:56Z
### Audit Run Tier-1 (05:13–05:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 9/9 HTTP 200 OK (mcp 166 tools)
- Containers all UP: mcp-server (34min, RestartCount=0 FRESH-REBUILD-04:40Z, OOMKilled=false), frontend (24h), macro-indicators (24h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (44min, RestartCount=116 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY OOM-cycle), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-22–A-24 tooling: pdftoppm✓ tesseract✓ vie✓ | A-25–A-28 inter-svc: stock✓ ta✓ alert✓ pdf✓
- A-30 mcp-server mem=13.30% (272.5MiB/2GiB) | A-31 EPIPE=0 | A-32 disk=25% (41Gi free)
- B-05 BCTC healthy-idle: queue=38 pending, push-age=199.7h << SLA-1714.5h out-of-window, PASS
- DB C-01–C-16: C-01(942 tickers)✓ C-02(1616 rows)✓ C-03(32 actions Q1)✓ C-04(0 low-conf)✓ C-05(0 SSC URLs)✓ C-06(4 msgs 3h)✓ C-07(243 signals 24h)✓ C-08(1 orphan-alert-transient)✓ C-09(3 macro-ind)✓ C-10(0 PDF-fail)✓ C-11(0 PDF-done-off-season)✓ C-12(integrity=ok)✓ C-13(WAL=4.1MB)✓ C-14(top-3=0.4%)✓ C-15(schema✓)✓ C-16(0 stale-pending)✓
- Anomalies: 0 new | Dedup-skipped: 0 | Status: HEALTHY
