# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c363 · 2026-06-25T13:55:14Z
### DB Data-Anomaly Sweep Tier-DATA (13:54–13:55 UTC 2026-06-25) — Canonical-4 FROZEN, 0 NEW Signals
- Tier: DATA | Tables: 14 checked (daily_ohlcv, market_prices, market_prices_history, vn_index_cache, alerts, price_alerts, alert_engine_records, agent_signals, signal_outcomes, financial_reports, macro_indicators, sbv_rates, fred_series_daily, deep_fetch_queue, cron_job_runs, scheduler_locks, alerts schema)
- Helper deterministic (immutable=1 verified, exit 0): db1_ohlc_violations=835 FROZEN, db2_scale_gt100x=1 FROZEN, db3_vnindex_cache_rows=0 FROZEN, c04_low_confidence_reports=21 FROZEN (all ≡ since #53, identical to baseline)
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T13:45:02Z (live), fresh_ohlc_violations_last_2d=0
- Anomaly scan results: (1) db1=835 pre-2026-06-20 OHLCV violations (FIX-OHLCV-WRITER-INTEGRITY in_progress); (2) db2=1 DFF 1000x scale artifact; (3) db3=0 vnindex on-demand cache (expected); (4) c04=21 low-confidence PDF scans (FIX-BCTC-ENRICH-SILENT-0ROWS in_progress); (5) market_prices_stale>4h=119 tickers (illiquid OPC/SMA/STG post-close, BY-DESIGN); (6) no (code,date) duplicates in daily_ohlcv (CLEAN); (7) scheduler_locks held=0 (resolved); (8) deep_fetch_queue status='expired'=587 (terminal state expected); (9) alerts fingerprint dedup enforced (CLEAN)
- Dedup check: all 9 findings verified against history + orch-state signal_queue | All 9 BY-DESIGN or already board-tracked | Verdict: 0 NEW REAL anomalies
- History: appended via deterministic helper (scripts/db-integrity-history-append.sh): entry #126 (before=125, after=126, cap=200) ✓ | Helper exit 0 (ok:true), counts embedded
- Status: HEALTHY | Signals: 0 posted (all findings held as existing board tasks or natural state) | Queue: 72 rows unchanged | Telegram: none

## c362 · 2026-06-25T13:28:39Z
### DB Data-Anomaly Sweep Tier-DATA (13:26–13:28 UTC 2026-06-25) — Canonical-4 FROZEN, 0 NEW Signals
- Tier: DATA | Tables: 17 checked (daily_ohlcv, market_prices, market_prices_history, vn_index_cache, alerts, price_alerts, alert_engine_records, agent_signals, signal_outcomes, financial_reports, macro_indicators, sbv_rates, fred_series_daily, deep_fetch_queue, cron_job_runs, scheduler_locks, schema check)
- Helper deterministic (immutable=1 verified): db1_ohlc_violations=835 FROZEN, db2_scale_gt100x=1 FROZEN, db3_vnindex_cache_rows=0 FROZEN, c04_low_confidence_reports=21 FROZEN (all ≡ since #53, identical to baseline)
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T12:30:02Z (live), fresh_ohlc_violations_last_2d=0
- Anomaly scan results: (1) db1=835 pre-2026-06-20 OHLCV violations (FIX-OHLCV-WRITER-INTEGRITY in_progress); (2) db2=1 DFF scale artifact; (3) db3=0 vnindex on-demand cache (expected); (4) c04=21 low-confidence PDF scans (FIX-BCTC-ENRICH-SILENT-0ROWS in_progress); (5) market_prices_stale>4h=116/118 post-close (3 expected illiquid: OPC/SMA/STG); (6) no (code,date) duplicates in daily_ohlcv (CLEAN); (7) scheduler_locks held=0 (resolved); (8) cron_job_runs: 142 crashed (pre-2026-06-20), 0 stuck; (9) vn_index_cache empty (on-demand); (10) signal_outcomes_pending=72 (already-tracked).
- Dedup check: all 10 findings verified against history + orch-state signal_queue | All 10 BY-DESIGN or already board-tracked | Verdict: 0 NEW REAL anomalies
- History: appended via deterministic helper (script/db-integrity-history-append.sh): entry #125 (before=124, after=125, cap=200) ✓ | Helper exit 0, counts embedded
- Status: HEALTHY | Signals: 0 posted (all findings held as existing board tasks or natural state) | Queue: 72 rows unchanged | Telegram: none

## c361 · 2026-06-25T12:54:42Z
### DB Data-Anomaly Sweep Tier-DATA (12:54 UTC 2026-06-25) — Canonical-4 Frozen, 0 NEW Signals
- Tier: DATA | Tables: 14 checked (daily_ohlcv, market_prices, market_prices_history, vn_index_cache, alerts, agent_signals, financial_reports, scheduler_locks, cron_job_runs, and ad-hoc scans)
- Helper deterministic (immutable=1): db1_ohlc_violations=835 FROZEN, db2_scale_gt100x=1 FROZEN, db3_vnindex_cache_rows=0 FROZEN, c04_low_confidence_reports=21 FROZEN (all identical since #53)
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T12:30:02Z (feed alive), fresh_ohlc_violations_last_2d=0
- Anomaly scan: db1=835 pre-2026-06-20 residue (FIX-OHLCV-WRITER-INTEGRITY in_progress), db2=1 DFF unit conversion artifact (same fix), db3=0 vnindex on-demand cache (expected), c04=21 low-confidence PDF scans (by-design flagged), market_prices_stale>4h=3 illiquid OPC/SMA/STG (post-close expected), scheduler_locks_held=0 (resolved)
- Findings: 7 total anomalies found | 0 NEW REAL | All 7 BY-DESIGN or already-tracked | No signals written | Dedup verified vs prior open rows
- History: appended entry #124 (helper confirmed: scan_ts=2026-06-25T12:54:42Z, before=123, after=124, cap=200) ✓
- Status: HEALTHY | Signals: 0 posted | Queue: 72 rows unchanged | Telegram: none

## c360 · 2026-06-25T12:26:21Z
### DB Data-Anomaly Sweep Tier-DATA (12:24–12:26 UTC 2026-06-25) — Canonical-4 Frozen, 0 NEW Signals
- Tier: DATA | Tables: 8 checked (daily_ohlcv, market_prices, agent_signals, scheduler_locks, deep_fetch_queue, cron_job_runs, fred_series_daily, vn_index_cache)
- Helper deterministic: db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21 (FROZEN)
- Context: daily_ohlcv_total=18251, newest_date=2026-06-25, market_prices_freshness=2026-06-25T11:15:02Z, fresh_ohlc_violations_last_2d=0
- Anomaly scan: market_prices_stale>4h=6 (BY-DESIGN post-close illiquid), market_prices_history_stale>4h=38519 (BY-DESIGN archive), agent_signals_unread=3295 (tracked sau-20260621T155518), scheduler_locks_held>24h=0 (resolved), deep_fetch_queue_failed/pending_stuck=0 (healthy)
- Findings: 0 NEW REAL anomalies | All 8 findings BY-DESIGN or already-open per memory | No signals written
- History: appended entry #122 → #123 (helper: scan_ts=2026-06-25T12:26:21Z, before=122, after=123, cap=200) ✓
- Status: HEALTHY | Signals: 0 posted | Telegram: none
