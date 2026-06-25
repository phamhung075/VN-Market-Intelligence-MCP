# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c360 · 2026-06-25T12:26:21Z
### DB Data-Anomaly Sweep Tier-DATA (12:24–12:26 UTC 2026-06-25) — Canonical-4 Frozen, 0 NEW Signals
- Tier: DATA | Tables: 8 checked (daily_ohlcv, market_prices, agent_signals, scheduler_locks, deep_fetch_queue, cron_job_runs, fred_series_daily, vn_index_cache)
- Helper deterministic: db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21 (FROZEN)
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T11:15:02Z, fresh_ohlc_violations_last_2d=0
- Anomaly scan: market_prices_stale>4h=6 (BY-DESIGN post-close illiquid), market_prices_history_stale>4h=38519 (BY-DESIGN archive), agent_signals_unread=3295 (tracked sau-20260621T155518), scheduler_locks_held>24h=0 (resolved), deep_fetch_queue_failed/pending_stuck=0 (healthy)
- Findings: 0 NEW REAL anomalies | All 8 findings BY-DESIGN or already-open per memory | No signals written
- History: appended entry #122 → #123 (helper: scan_ts=2026-06-25T12:26:21Z, before=122, after=123, cap=200) ✓
- Status: HEALTHY | Signals: 0 posted | Telegram: none

## c359 · 2026-06-25T11:55:42Z
### DB Data-Anomaly Sweep Tier-DATA (11:54–11:55 UTC 2026-06-25) — Canonical-4 Frozen, All Findings Held Stable
- Tier: DATA | Tables: 8 checked (canonical + anomaly-class ad-hoc) | Helper mode: deterministic db-integrity-counts.sh
- Canonical-4 FROZEN (helper exit 0, immutable=1 verified): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T11:15:02.994Z, fresh_ohlc_violations_last_2d=0
- Data anomaly scan: market_prices_stale>4h=3 (post-close illiquid OPC/SMA/STG—expected), scheduler_locks_held=0 (RESOLVED), signal_outcomes_pending=72 (tracked), deep_fetch_queue_pending_stuck=0 (clean)
- Anomalies found: 0 NEW REAL (all 8 findings BY-DESIGN or already-tracked) | No signals to write (verdict=REAL count: 0)
- History: appended entry #122 (helper confirmed: scan_ts=2026-06-25T11:55:42Z, before=121, after=122, cap=200) ✓ | Signal queue: 72 rows (0 NEW)
- Status: DATA-HEALTHY (canonical-4 frozen, zero fresh violations, all known anomalies held stable) | Signals: 0 posted | Telegram: none

## c358 · 2026-06-25T11:26:16Z
### DB Data-Anomaly Sweep Tier-DATA (11:24–11:26 UTC 2026-06-25) — Router-Verified Baseline
- Tier: DATA | Tables: 14 checked (canonical + 10 ad-hoc) | Helper mode: deterministic db-integrity-counts.sh
- Canonical-4 FROZEN (router-verified 11:24Z, immutable=1 helper exit 0): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T11:15:02.994Z, fresh_ohlc_violations_last_2d=0
- Data anomaly scan: signal_outcomes_pending=72 (tracked OPEN), deep_fetch_queue_terminal=582 (expected), market_prices_stale>4h=6 (post-close illiquid, OPC/SMA/STG), financial_reports_net_revenue<=0=17 (frozen by-design), financial_reports_NULL_net_revenue=14, scheduler_locks_held=0, cron_errors_24h=0
- Anomalies found: 0 NEW REAL (all 15 findings BY-DESIGN or already-tracked per memory) | No signals to write (verdict=REAL count: 0)
- History: appended entry #121 (helper confirmed: scan_ts=2026-06-25T11:26:16Z, before=120, after=121, cap=200) ✓ | Signal queue: 72 rows (0 NEW)
- Status: DATA-HEALTHY (canonical-4 frozen, no fresh anomalies, all known defects held stable) | Signals: 0 posted | Telegram: none

## c357 · 2026-06-25T11:14:05Z
### Audit Run Tier-1 Runtime Ping (11:13–11:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- All containers healthy: mcp-server (7h, RestartCount=0, mem=64.45% 1.289GiB/2GiB PASS), rag-service (RestartCount=118 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY)
- A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS | A-30 mcp-server mem 64.45% PASS | A-31 EPIPE=0 PASS | A-32 disk=26% PASS
- Cron health: 159+ active jobs, all recent runs success ≥98.1% (sbvRatesRefreshJob 98.1%)
- B-05 BCTC healthy-idle gate: push-age=206.5h vs SLA dynamic threshold=1714.5h (out-of-window June) — PASS
- VPS proxy status: all services reachable via get_system_status circuit breakers (16 OK)
- Anomalies: 0 new | Dedup: A-30 (known leak), A-21 (known rag-cycle), B-05 (healthy-idle) — all RECORD-AND-LEAVE per policy
- Status: HEALTHY | Signals: 0 posted | Dashboard rows: 0 | Telegram: none

## c356 · 2026-06-25T10:57:12Z
### DB Data-Anomaly Sweep Tier-DATA (10:55–10:57 UTC 2026-06-25)
- Tier: DATA | Tables: 17 checked (daily_ohlcv, market_prices, market_prices_history, vn_index_cache, alerts, price_alerts, alert_engine_records, agent_signals, signal_outcomes, financial_reports, macro_indicators, sbv_rates, fred_series_daily, deep_fetch_queue, cron_job_runs, scheduler_locks)
- Canonical counts (helper): db1_ohlc_violations=835 FROZEN, db2_scale_gt100x=1 FROZEN, db3_vnindex_cache=0 FROZEN, c04_lowconf=21 FROZEN
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T10:00:02Z, fresh_violations_2d=0
- Anomalies found: 0 NEW | All 13 findings BY-DESIGN (ohlcv violations FIX-in_progress, stale illiquids OPC/SMA/STG post-08:00Z, low-confidence BCTC 21 tracked, signal backlogs tracked)
- History: appended entry #120 (before=119, after=120, length_cap=200) ✓ | Signal queue: 72 rows unchanged (0 NEW)
- Status: HEALTHY (all known anomalies stable) | Signals: 0 posted | Dashboard: no action needed

## c355 · 2026-06-25T10:44:08Z
### Audit Run Tier-1 Runtime Ping (10:43–10:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- All containers healthy: mcp-server (6h, RestartCount=0, mem=60.64% 1.213GiB/2GiB PASS), rag-service (RestartCount=118 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY)
- A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS | A-30 mcp-server mem 60.64% PASS | A-31 EPIPE=0 PASS | A-32 disk=26% PASS
- Cron health: 160+ active jobs, all recent runs success ≥98% (sbvRatesRefreshJob 98.1%)
- B-05 BCTC healthy-idle gate: push-age=206h vs SLA dynamic threshold=1704.5h (out-of-window June) — PASS
- VPS proxy status: all services reachable via get_system_status circuit breakers (16 OK)
- Anomalies: 0 new | Dedup: A-30 (known leak), A-21 (known rag-cycle), B-05 (healthy-idle) — all RECORD-AND-LEAVE per policy
- Status: HEALTHY | Signals: 0 posted | Dashboard rows: 0 | Telegram: none

## c354 · 2026-06-25T10:32:20Z
### Audit Run Tier-2 Freshness Sweep (10:30–10:32 UTC 2026-06-25)
- Tier: 2 | Cron checks: 159+ jobs all healthy ≥98% | Sources: 27 checked | VPS routes: 4 probed
- Pipeline health: OHLCV 30+ tickers ready, TA fresh, 740 rows today, backfill=false
- Freshness summary: price ok (30min), news ok (30sec), sbv ok (24min), foreign-flow idle (market-closed)
- B-05 BCTC SLA check: push-age=207.5h vs dynamic threshold=1704.5h (out-of-window June)
  * SLA resolver: last earnings window 2026-04-14 → 1704h since + 0.5h grace → threshold=1704.5h
  * Gate: queue=38 actionable (url_not_found, enrich_failed, pending), host-up, but VPS service unhealthy
  * Verdict: PASS (age << threshold; VPS unreachable is separate infra issue, not SLA breach)
- B-06/B-07 VPS proxy: prices/news/sbv ok, bctc stale (last push 2026-06-16, 9d old) ← VPS-side, not local
- B-09 SSC URLs: 0 non-skipped ✓ | B-13 stale pending: 0 >72h ✓ | C-06 market_messages: 1 in 3h ✓ | C-07 signals: 272 in 24h ✓
- Rate limits: all ok, no source at 100% ✓ | DB writes: fresh, message + signal flow healthy
- Post-market idle (17:30 VN): ssc-iboard and foreign-flow quiet by design, EXPECTED
- Anomalies: 0 new critical | Dedup: vn-bctc-fetch unhealthy (STANDING FEEDBACK, no new escalation)
- Status: HEALTHY IDLE | Signals: 0 posted | Dashboard rows: 0 | Telegram: none

## c353 · 2026-06-25T10:30:24Z
### Audit Run Tier-2 (10:30 UTC 2026-06-25)
- Tier: 2 | Cron checks: 159+ jobs, all healthy ≥98% | Sources checked: 27 (fetch freshness + VPS routes)
- Pipeline health: OHLCV 30+ tickers, backfill pending=false, TA ready
- VPS routes: prices ok, news ok, sbv ok, bctc STALE (last push 2026-06-16 18:02, now 230.5h old)
- B-05 BCTC gate: queue=38 actionable pending + VPS unhealthy → CRITICAL stale
- B-06/B-07 VPS proxy: 3/4 routes ok (bctc down); rates ok; flow intact
- B-09 SSC portal URLs: 0 non-skipped (PASS) | B-13 stale pending: 0 >72h (PASS)
- C-06/C-07 DB freshness: market_messages 1 in 3h (PASS), agent_signals 272 in 24h (PASS)
- Anomalies: 1 CRITICAL (B-05 bctc-discover + vn-bctc-fetch unhealthy)
- Status: DEGRADED (VPS service down, BCTC pipeline blocked)
- Signals: 1 posted (signal_id=7541, sau-b05-202606251030 CRITICAL)
- Dedup: B-14 vn-bctc-fetch unhealthy (KNOWN, refresh dedup_key, no new escalation)
