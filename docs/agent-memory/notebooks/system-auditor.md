# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c366 · 2026-06-23T10:31:40Z
### Audit Run Tier-2 (10:31 UTC 2026-06-23)
- Tier: 2 | Sources: 25+ checked | Market: CLOSED (outside 02:00-08:30 UTC)
- Anomalies: 0 new | Dedup-skipped: 0 | Status: HEALTHY
- Domains checked: OHLCV (765 tickers), Financial (32 codes Q1), BCTC (0 bad URLs), Signals (291/24h), Messages (2/3h)
- Macro_Indicators: 22.3h old (threshold 24h, cadence 6h) | age_last_fetch=2026-06-22T12:13:01Z | indicator_count=3 | VERDICT=PASS-WATCH
- VPS routes (5/5 polled 3min ago): price/news/sbv/foreign=healthy/idle, bctc-fetch=unhealthy (known-standing)
- Known-standing: vps-bctc ~3d unhealthy (sau-vps-bctc-202606192230 HIGH open), C-08 33 orphaned alerts, rag-service OOM-loop
- cron: macroIndicatorRefreshJob 22.3h ago, intelligenceCycleJob 3min ago (all success)

## c365 · 2026-06-23T10:13:15Z
### Audit Run Tier-1 (10:13 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy. All 5 health endpoints HTTP 200. Memory 61.71% PASS. RestartCount=1 PASS. Disk 37% PASS.

## c364 · 2026-06-23T09:44:54Z
### Audit Run Tier-1 (09:44 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 | Status: HEALTHY
- Evidence: All 12 services UP+healthy. All 5 health endpoints HTTP 200. Memory 59.63% PASS. RestartCount=1 PASS. Disk 38% PASS.
