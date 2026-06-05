---
agent: system-auditor
session_date: 2026-06-05
---

## c006 · 2026-06-05T20:39Z
### Audit Run Tier-1 (20:39–20:40 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 88
- Anomalies: 1 info (1 info, 0 critical, 0 warn) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 23m (healthy), restart_count=1 ✓, memory=18.47% ✓ [post-rebuild FIX-CTG-PDF-MISLINK nominal]
- api-gateway: Up 2d (healthy) ✓
- frontend: Up 16h (healthy container but /health → 404 — INFO level)
- macro-indicators: Up 9h (healthy) ✓
- pdf-extractor: Up 2d (healthy) ✓
- mcp-gateway: (MCP server — status via get_system_status tool)

### Health Endpoints
- mcp-server :3000 → 200 ✓ (uptime 23m, toolCount:162)
- api-gateway :4000 → 200 ✓ (macro:ok, mcp:ok)
- frontend :3001 → 404 (HTTP endpoint not implemented) [INFO-grey, no impact — UI only]
- macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓

### Cron Health (88 jobs monitored)
- 100% firing across 88 monitored crons, 7-day success_rate ≥97.6%
- Min success_rate: 97.6% (bctcQueueEnricherJob — transient ok, crashed once in 499 runs)
- intelligenceCycleJob: 99.3% (567 runs past 7d)
- All others: ≥98% or 100%; no job gaps detected

### Data Freshness (Live Snapshot)
- Prices (HOSE): 9m old (market closed, normal) ✓
- News (RSS): 37m old ✓
- Commodities: 9m old ✓
- SBV FX: 9m old ✓
- Polymarket: 9m old ✓
- BCTC: 3.3h old (no earnings window, normal) ✓
- Circuit breakers: all 16 sources [OK], 0 failures

### System Status (MCP Probe)
- DB: market.db 240.37 MB, WAL 15.58 MB ✓
- Uptime: 23m 35s post-deploy
- Pending feedback: 39 new items (non-blocking)
- Open warnings: 37 high/critical items (existing, non-emergency)

### Notes
- Tier-1 pass clean. All intended-runtime services UP and healthy.
- frontend :3001 /health endpoint → 404 is informational (frontend is UI-only, not a data pipeline); no component impact.
- mcp-server memory post-rebuild nominal (18.47%).
- No new anomalies detected.

## c005 · 2026-06-05T20:10Z
### Audit Run Tier-1 (20:10–20:11 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 88
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 3m (healthy), restart_count=0 ✓, memory=7.79% ✓ [ops rebuild FIX-CTG-PDF-MISLINK COMPLETE — brief restart 2026-06-05 ~20:07Z]
- api-gateway: Up 2d (healthy) ✓
- frontend: Up 15h (healthy) ✓
- macro-indicators: Up 9h (healthy) ✓
- pdf-extractor: Up 2d (healthy) ✓
- mcp-gateway: Up 9d (healthy) ✓

### Health Endpoints — All PASS
- mcp-server :3000 → toolCount:162 ok (uptime 236s, 10 sessions)
- api-gateway :4000 → macro:ok, mcp:ok
- macro-indicators :5004 → ok
- pdf-extractor :5001 → ocr_source_ok:true
- mcp-gateway docker health → healthy

### Cron Health (88 jobs monitored)
- 100% firing across all jobs past 7d
- Min success_rate: 97.8% (bctcQueueEnricherJob, bctcReparseJob — transient ok)
- Max rate: intelligenceCycleJob 99.5%, no gaps
- Recent fires: all ≤20s ago; cluster coherent

### Data Freshness (Real-Time)
- HOSE prices: 1.4h (market closed, normal)
- News (RSS): 9m fresh ✓
- Commodities: 1.4h ✓
- SBV FX: 1.4h ✓
- Polymarket: 41m fresh ✓
- BCTC: 2.9h (no earnings window anomaly) ✓
- Pipeline health: all circuits OK (0 failures)

### Circuit Breaker Status
- All 16 sources: [OK] (cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc, tradingEconomics, yahooFinance, sbv, polymarket, congbao, sbvCircular, foreignFlow, newsapi, marketwatch)
- 0 open, 0 half-open circuits

### Recent System Errors
- kinhdich service: not-in-intended-runtime (by design, no ERROR); transient probe timeouts logged (expected — service not deployed per host_memory_panic constraint)
- No unresolved DB/pipeline errors

### Notes
- mcp-server rebuild (FIX-CTG-PDF-MISLINK) successfully completed just before this run (~20:07Z). Brief restart in compliance with context expectation. Memory post-rebuild nominal at 7.79%.
- All intended-runtime services HEALTHY. No anomalies detected.
- WAL: market.db 6.82 MB (well under 50MB guard).

## c004 · 2026-06-05T19:56Z
### Audit Run Tier-1 (19:56–19:58 UTC 2026-06-05)
- Tier: 1 | Services checked: 6 (intended runtime) | Crons polled: 88
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set)
- mcp-server: Up 47s (healthy), restart_count=0 ✓, memory=11.15% ✓ [REBUILT — ops FIX-CTG-PDF-MISLINK expected]
- api-gateway: Up 2d (healthy) ✓
- frontend: Up 15h (healthy) ✓
- macro-indicators: Up 9h (healthy) ✓
- pdf-extractor: Up 2d (healthy) ✓
- mcp-gateway: Up 9d (healthy) ✓

### Health Endpoints — All PASS
- mcp-server :3000 → toolCount:162 ok
- api-gateway :4000 → macro:ok, mcp:ok, others:not_deployed (by design)
- macro-indicators :5004 → ok
- pdf-extractor :5001 → ocr_source_ok:true
- mcp-gateway docker health → healthy

### Cron Health (88 jobs monitored)
- Tier-1 pass clean: 100% firing across all jobs
- Min success_rate: 97.7% (bctcReparseJob, bctcQueueEnricherJob — transient ok)
- Max recent: intelligenceCycleJob 99.5%, no gaps

### Data Freshness
- Stock prices (OHLCV): 33/39 tickers TA-ready, last agg 2026-06-05 19:55:58 ✓
- Non-neutral TA signals: 0 ✓
- Pipeline aggregator: healthy, backfill queue not pending ✓

### Notes
- mcp-server briefly restarted (<1min uptime) per ops REBUILD deployment (FIX-CTG-PDF-MISLINK). This is EXPECTED maintenance; not a system fault. Memory pressure at 11% post-restart (normal).
- All intended-runtime services HEALTHY. No anomalies detected.

## c003 · 2026-06-01T04:07Z
### Audit Run Tier-1 (04:07–04:08 UTC 2026-06-01)
- Tier: 1 | Services checked: 2 (intended runtime) | Crons polled: 82
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Only)
- mcp-server: Up 7h, healthy, restart_count=1 ✓, memory=77.95% ✓
- mcp-gateway: Up 5d (no direct check in Tier-1)

### Cron Health
- 82 jobs polled, 100% firing; min success_rate=98.4% (bctcQueueEnricherJob) past 7d
- intelligenceCycleJob: 99.4% | bctcReparseJob: 98.4%
- All others ≥99% or 100% success_rate

### Data Freshness (Real-time Snapshot)
- Prices (HOSE): 3 min old ✓
- News (RSS): 2 min old ✓
- Foreign-flow: 0 min old (last 2026-06-01 04:06:47) ✓
- Commodities: 52 min old ✓
- SBV FX rates: 52 min old ✓
- Polymarket: 38 min old ✓
- BCTC: 80.7h old — KNOWN-IN-PROGRESS (VPS-SOCAT-PERSIST tracked)

### VPS Proxy Status (Push Pipeline)
- Prices: ok, 74 pushes/24h, 0 errors, last 2026-06-01 04:04:26 ✓
- News: last 2026-06-01 03:53:31 (stale flag) — KNOWN-IN-PROGRESS
- SBV: ok, 45 pushes/24h, 0 errors ✓
- BCTC: last 2026-05-19 07:05 — KNOWN-IN-PROGRESS

### API Rate Limits
- 14 sources checked, all ready, 0% utilization ✓

### Notes
- Tier-1 pass clean. All known stale items (news, BCTC via VPS-SOCAT-PERSIST) already tracked; not raised as new.
- mcp-server memory 77.95% is healthy (< 85% threshold per brief); restart_count=1 OK.
