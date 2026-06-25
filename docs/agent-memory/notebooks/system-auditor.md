# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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
