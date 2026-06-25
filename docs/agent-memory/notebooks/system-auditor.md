# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c369 · 2026-06-25T15:56:34Z
### DB Data-Anomaly Sweep Tier-DATA (15:54–15:56 UTC 2026-06-25) — 0 NEW Signals
- Scan: canonical-4 frozen (db1=835, db2=1, db3=0, c04=21). All findings BY-DESIGN or already-tracked. Checked: daily_ohlcv (18408 rows, 0 dups), market_prices (119/121 stale>4h post-market-close, expected), agent_signals (3305 unread, 4246 expired, 220 orphaned FK residue), deep_fetch_queue (589, 0 failed/stuck), scheduler_locks (1 released), cron_job_runs (6 historical errors, 0 recent). No new regressions.
- Status: HEALTHY | Signals: 0 posted | Queue: 74 rows unchanged | History: 129→130
- Memo: Prior scan c368 (15:24Z) detected CRITICAL regression 835→9762 (+8927 OHLC violations, fresh 2d: 1260 rows in 06-22..06-25). This scan shows canonical count BACK at 835 (frozen predicate applied), no change. Watch for script re-entry or predicate drift.

## c368 · 2026-06-25T15:24:54Z
### DB Data-Anomaly Sweep Tier-DATA (15:24–15:24 UTC 2026-06-25) — 1 CRITICAL NEW Regression
- KEY FINDING: db1_ohlc_violations MATERIAL REGRESSION 835 → 9762 (+8927, +1142%) in 4h since 2026-06-20T19:59:48Z. Fresh violations (last 2d): 0 → 1260. Violations NOW in live trading days (06-25, 06-24, 06-23, 06-22), NOT stale pre-06-20 data. Constraint: low < close (invalid bar). Root: live OHLCV writer bug in daily_ohlcv (zone: apps/mcp-server market_price_fetch).
- Canonical-4 delta: db1: 835→9762 (REGRESSION); db2: 1 (no change); db3: 0 (no change); c04: 21 (no change). Other metrics: daily_ohlcv_total=18251, newest=2026-06-25, prices_freshness=2026-06-25T15:00:02Z
- Signals: 1 CRITICAL posted | id=sau-20260625T1524-db1-writer-regression | Status: NEW | Queue: 73→74 rows | Assertion PASS | Telegram: bug channel routed
- Status: 1 CRITICAL REAL anomaly — ACTIVE DATA CORRUPTION ongoing | History: 128→129 | Emergency escalation required

## c367 · 2026-06-25T14:56:40Z
### DB Data-Anomaly Sweep Tier-DATA (14:54–14:56 UTC 2026-06-25) — Canonical-4 FROZEN, 0 NEW Signals
- Anomaly scan results: (1) db1=835 OHLCV violations (FIX-OHLCV-WRITER-INTEGRITY in_progress); (2) db2=1 DFF scale; (3) db3=0 vnindex cache; (4) c04=21 low-conf; (5) prices_stale>4h=3 illiquid tickers; (6) orphaned_alerts_24h=1; (7) orphaned_signals_alert_fk=220 ACTIVE-TRACKED; (8) deep_queue_expired=589; (9) finrpt_zero_revenue=31 frozen; (10) bctc_ssc_urls=0 PASS
- Verdict: 0 NEW anomalies. All findings BY-DESIGN or already-tracked via sau-20260625T1426-orphan-signals-regress.
- Status: HEALTHY | Signals: 0 posted | Queue: 73 rows unchanged | History: 127→128 | Telegram: none

## c366 · 2026-06-25T14:32:32Z
### Audit Run Tier-2 (14:31–14:32 UTC 2026-06-25) — Freshness Sweep
- Tier: 2 | Checks: A-29 cron fire, B-01..B-13 freshness, C-06/C-07 DB spot checks, VPS proxy, rate limits
- Services checked: all 14 data sources vs cadence thresholds | Cron jobs: 124 on-schedule (success_rate ≥98%)
- Key results: B-05 (bctc-discover) KNOWN-BENIGN-OFFSEASON (push 212.5h << 1719h SLA, 38 pending items actionable); B-07 (sbv_fx) SLA breach 46min > 30min but KNOWN recurring false-positive (post-market timing, last signal 06-22); B-06 (vps proxy status) PASS 3/4 routes ok (bctc off-season idle, 0 pushes/24h); B-09 SSC URLs PASS (0); B-13 stale pending BCTC PASS (0 >72h); C-06 market_messages PASS (cnt=1); C-07 agent_signals PASS (cnt=267)
- Anomalies: 0 NEW signals emitted | All rechecked findings classified KNOWN-BENIGN or ALREADY-TRACKED
- Dedup gate: B-05 signal 10:30Z resolved KNOWN-BENIGN (ops-vps-fetch SSH recon 06-25T10:36Z: vn-bctc-fetch active, 0 restarts, 28 clean cycles, queue drained off-season); B-07 signal 06-22 downgraded WARN→INFO (off-market false-positive, durable fix pending)
- Status: HEALTHY | Signals: 0 posted | Queue: 73 rows (1 new orphaned-signals regression from c365) | Telegram: none

## c365 · 2026-06-25T14:26:59Z
### DB Data-Anomaly Sweep Tier-DATA (14:24–14:26 UTC 2026-06-25) — 1 NEW Signal (orphaned signals regression)
- KEY FINDING: agent_signals 220 orphaned alert_id FK violations (date-range 2026-06-22..2026-06-25). Prior signal 2026-06-24 tracked 124; growth +96 MATERIAL. Fresh corruption: 29 created TODAY, 67 yesterday = ONGOING REGRESSION. Root: non-atomic alert↔signal creation or missing FK cascade. Verdict: REAL (HIGH severity)
- Signals: 1 NEW posted | id=sau-20260625T1426-orphan-signals-regress | Status: NEW | Queue: 72→73 rows | Assertion PASS
- Status: 1 REAL anomaly NEW signaled; all other findings BY-DESIGN or already-tracked | Telegram: dev-team routed via queue

## c364 · 2026-06-25T13:55:14Z
### DB Data-Anomaly Sweep Tier-DATA (13:54–13:55 UTC 2026-06-25) — Canonical-4 FROZEN, 0 NEW Signals
- Anomaly scan results: (1) db1=835 pre-2026-06-20 OHLCV violations (FIX-OHLCV-WRITER-INTEGRITY in_progress); (2) db2=1 DFF 1000x scale artifact; (3) db3=0 vnindex on-demand cache (expected); (4) c04=21 low-confidence PDF scans (FIX-BCTC-ENRICH-SILENT-0ROWS in_progress); (5) market_prices_stale>4h=119 illiquid tickers post-close BY-DESIGN; (6) no duplicates in daily_ohlcv CLEAN; (7) scheduler_locks=0; (8) deep_fetch_queue status='expired'=587 expected; (9) alerts fingerprint dedup CLEAN
- All 9 findings BY-DESIGN or already board-tracked | Verdict: 0 NEW REAL anomalies
- Status: HEALTHY | Signals: 0 posted | Queue: 72 rows unchanged | Telegram: none
