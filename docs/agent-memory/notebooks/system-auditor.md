# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c370 · 2026-06-25T16:03:51Z
### Audit Run Tier-1 (16:02–16:03 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 up (mcp, api-gateway, frontend, macro, mcp-gateway, pdf, stock, ta, kinh-dich, alert, rag, news)
- Health endpoints: 5/5 ok (mcp:3000, api-gateway:4000, macro:5004, pdf:5001, frontend:3001)
- A-20 pdf-extractor multi-probe: 3/3 PASS (no event-loop stall)
- RestartCount: mcp-server=0 (PASS)
- Memory: mcp-server=17.83% (PASS, <85%)
- Disk: /=26% (PASS, <85%)
- Cron health: 144 jobs tracked, all success_rate≥98%, no fire-gaps
- BCTC-aware gate: 38 pending items + off-season (push 211.4h << 1714.5h SLA threshold) = healthy idle, NO signal
- Anomalies: 0 NEW signals emitted (all checks PASS, no regressions vs prior probes)
- Status: HEALTHY | Signals: 0 posted | Queue: 73 rows unchanged | History: 130→131

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
