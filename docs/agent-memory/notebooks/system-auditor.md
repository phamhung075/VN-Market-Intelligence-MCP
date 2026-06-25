# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c352 · 2026-06-25T10:26:05Z
### DB Data-Anomaly Sweep (10:24–10:26 UTC 2026-06-25)
- Tier: DATA | Tables: 8 checked (daily_ohlcv, market_prices, alerts, agent_signals, vn_index_cache, financial_reports)
- Canonical counts: db1_ohlc_violations=835 (frozen ≤600L), db2_scale_gt100x=1, db3_vnindex_cache=0, c04_lowconf=21
- Anomalies found: 1 REAL (orphaned alert FK broken), 2 BY-DESIGN (vn_index_cache empty, market_prices stale illiquid)
- NEW signals: 0 (orphaned-alert already tracked sau-c08-202606180038 TRIAGED+DEPLOYED b3ea96fa, recorded-leave)
- Status: STEADY-STATE | History: 119 entries (appended 118→119)

## c351 · 2026-06-25T10:14:01Z
### Audit Run Tier-1 (10:13–10:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK | mcp-gateway UP
- All containers healthy: mcp-server (6h, RestartCount=0, mem=57.95% 1.159GiB/2GiB PASS), rag-service (RestartCount=118 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY)
- A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS | A-30 mem 57.95% PASS | A-31 EPIPE=0 PASS | A-32 disk=26% PASS
- Cron health: 160+ active jobs, all recent runs success ≥98% (intelligenceCycleJob avg 27.8s)
- B-05 BCTC healthy-idle gate PASS (queue-dependent, off-season idle by design)
- Anomalies: 0 new | Dedup: A-30 (known leak), A-21 (known rag-cycle), B-05 (healthy-idle), B-11 (post-market slot) — all RECORD-AND-LEAVE per policy
- Status: HEALTHY | Signals: 0 | Telegram: none

## c350 · 2026-06-25T09:43:44Z
### Audit Run Tier-1 (09:43–09:44 UTC 2026-06-25)
- Tier: 1 | Services: 13/13 (12 host_runtime_set + mcp-gateway all UP)
- Health endpoints: 5/5 HTTP 200 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- mcp-server: RestartCount=0, MemPerc=58.00% (1.15GiB/2GiB), stable
- rag-service: RestartCount=118 (KNOWN STANDING FU-RAG-DEPLOY-MEMORY, last cycle +1 at 08:43)
- A-30 mcp-server mem 58% PASS (normal baseline post-build 04:40Z) | A-31 EPIPE=0 | A-32 disk=26%
- B-05 BCTC healthy-idle (SLA gate applied, queue-dependent) PASS
- Anomalies: 0 new | Dedup: none escalated | Status: HEALTHY | Signals: 0
