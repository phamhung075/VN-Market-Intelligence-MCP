# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c365 · 2026-06-25T14:26:59Z
### DB Data-Anomaly Sweep Tier-DATA (14:24–14:26 UTC 2026-06-25) — 1 NEW Signal (orphaned signals regression)
- Tier: DATA | Tables: 14 checked (daily_ohlcv, market_prices, market_prices_history, vn_index_cache, alerts, price_alerts, alert_engine_records, agent_signals, signal_outcomes, financial_reports, macro_indicators, sbv_rates, fred_series_daily, deep_fetch_queue, cron_job_runs, scheduler_locks)
- Helper deterministic (immutable=1 verified, exit 0): db1_ohlc_violations=835 FROZEN, db2_scale_gt100x=1 FROZEN, db3_vnindex_cache_rows=0 FROZEN, c04_low_confidence_reports=21 FROZEN (all ≡ baseline since #53)
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T13:45:02Z (post-close live), fresh_ohlc_violations_last_2d=0
- KEY FINDING: agent_signals 220 orphaned alert_id FK violations (date-range 2026-06-22..2026-06-25). Prior signal 2026-06-24 tracked 124; growth +96 MATERIAL. Fresh corruption: 29 created TODAY (2026-06-25T08:45:01Z newest), 67 yesterday (2026-06-24) = ONGOING REGRESSION. Root: non-atomic alert↔signal creation or missing FK cascade. Verdict: REAL (HIGH severity)
- History: appended entry #127 via helper (scan_ts=2026-06-25T14:26:59Z, before=126, after=127, cap=200) ✓
- Signals: 1 NEW posted | id=sau-20260625T1426-orphan-signals-regress | zone_owner=dev-alert-engine | Status: NEW | Queue: 72→73 rows | Assertion PASS (row in .signal_queue.rows[-1])
- Status: 1 REAL anomaly (orphaned signals escalation) NEW signaled; all other findings BY-DESIGN or already-tracked | Telegram: dev-team routed via queue

## c364 · 2026-06-25T13:55:14Z
### DB Data-Anomaly Sweep Tier-DATA (13:54–13:55 UTC 2026-06-25) — Canonical-4 FROZEN, 0 NEW Signals
- Tier: DATA | Tables: 14 checked (daily_ohlcv, market_prices, market_prices_history, vn_index_cache, alerts, price_alerts, alert_engine_records, agent_signals, signal_outcomes, financial_reports, macro_indicators, sbv_rates, fred_series_daily, deep_fetch_queue, cron_job_runs, scheduler_locks, alerts schema)
- Helper deterministic (immutable=1 verified, exit 0): db1_ohlc_violations=835 FROZEN, db2_scale_gt100x=1 FROZEN, db3_vnindex_cache_rows=0 FROZEN, c04_low_confidence_reports=21 FROZEN (all ≡ since #53, identical to baseline)
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T13:45:02Z (live), fresh_ohlc_violations_last_2d=0
- Anomaly scan results: (1) db1=835 pre-2026-06-20 OHLCV violations (FIX-OHLCV-WRITER-INTEGRITY in_progress); (2) db2=1 DFF 1000x scale artifact; (3) db3=0 vnindex on-demand cache (expected); (4) c04=21 low-confidence PDF scans (FIX-BCTC-ENRICH-SILENT-0ROWS in_progress); (5) market_prices_stale>4h=119 tickers (illiquid OPC/SMA/STG post-close, BY-DESIGN); (6) no (code,date) duplicates in daily_ohlcv (CLEAN); (7) scheduler_locks held=0 (resolved); (8) deep_fetch_queue status='expired'=587 (terminal state expected); (9) alerts fingerprint dedup enforced (CLEAN)
- Dedup check: all 9 findings verified against history + orch-state signal_queue | All 9 BY-DESIGN or already board-tracked | Verdict: 0 NEW REAL anomalies
- History: appended via deterministic helper (scripts/db-integrity-history-append.sh): entry #126 (before=125, after=126, cap=200) ✓ | Helper exit 0 (ok:true), counts embedded
- Status: HEALTHY | Signals: 0 posted (all findings held as existing board tasks or natural state) | Queue: 72 rows unchanged | Telegram: none
