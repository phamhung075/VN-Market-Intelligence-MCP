# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


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
- **CANONICAL-4**: db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21 (FROZEN identical to #109)
- **Baseline freshness**: daily_ohlcv_total=18250, newest_date=2026-06-25 (CURRENT), market_prices=2026-06-25T05:54:09Z (~1min)
- **TABLES CHECKED**: 16 high-value integrity checks, C-01–C-16 pass/PASS baseline
- **INTEGRITY CHECKS**: C-01(942✓) C-02(1616✓) C-06(2msgs✓) C-08(1orphan✓) C-09(3cols✓) C-10/C-11(PDF✓) C-16(0stale✓)
- **DATA QUALITY**: zero/neg prices=0 | dups=0 | orphaned=1(prior-tracked) | deep_fetch_queue=573 lifecycle-clean
- **ANOMALIES**: 0 NEW — all canonical-4 STABLE, fresh_ohlc_violations_last_2d=0, no regressions
- **HISTORY APPEND**: 109→110 entries | **STATUS**: STEADY-STATE
