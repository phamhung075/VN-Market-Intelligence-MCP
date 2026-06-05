---
agent: system-auditor
session_date: 2026-06-01
---

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

## c002 · 2026-06-01T03:38Z
### Audit Run Tier-1 (03:37–03:38 UTC 2026-06-01)
- Tier: 1 | Services checked: 2 (intended runtime) | Sources checked: 7 | DB checks: 0
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Only)
- mcp-server: Up 6h, healthy, restart_count=1 ✓, memory=67.46% ✓
- mcp-gateway: Up 4d, healthy, memory<10% ✓

### Cron Health
- 75 jobs polled, 100% firing; success_rate ≥99.2% across all jobs
- intelligenceCycleJob: 99.4% | bctcQueueEnricherJob: 99.2%
- All others: 100% success_rate past 7d

### Data Freshness
- Prices: fresh (1 min)
- News: fresh (0 min)
- Foreign-flow: fresh (1 min)
- BCTC: 80h old — KNOWN-IN-PROGRESS (VPS-SOCAT-PERSIST, tracked)
- SBV/Commodities: fresh (22–30 min)
- Macro-snapshot: tool error (get_macro_snapshot) — macro-indicators NOT IN INTENDED RUNTIME (per host_memory_panic policy, only mcp-server + mcp-gateway deployed)

### VPS Proxy Status
- 5 services healthy (0ms response time)
- Prices: 52 pushes/24h, 0 errors ✓
- News: 115 pushes/24h, 0 errors ✓
- Foreign-flow: chain intact ✓

### API Rate Limits
- 12 sources ready (0% utilization) ✓

### Notes
- Audit now checks INTENDED-RUNTIME-SET only (mcp-server + mcp-gateway); other services (macro-indicators, stock-price, etc.) are dev-zone architecture, not deployed per host_memory_panic constraint. Per AUDITOR-NO-DESTRUCT feedback, false-positive guard in place.

## c001 · 2026-06-01T03:08Z
### Audit Run Tier-1 (03:07–03:08 UTC 2026-06-01)
- Tier: 1 | Services checked: 2 | Sources checked: 5 | DB checks: 0
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status
- mcp-server: Up 6h, healthy, restart_count=1 ✓, memory=67.46% ✓
- mcp-gateway: Up 4d, healthy, memory=<10% ✓

### Data Freshness (carry-over from Tier-2 02:30 UTC)
- Prices (HOSE): fresh (~1 min)
- News: fresh (~4 min)
- BCTC: 79.7h old (expected, outside earnings window)
- VPS prices: STALE 65.5h — KNOWN-IN-PROGRESS (VPS-SOCAT-PERSIST tracked)
- VPS bctc: STALE 571h — KNOWN-IN-PROGRESS

### BCTC-EVAL-SNAPSHOT: (last sweep Tier-2 02:30 UTC 2026-06-01)
No new stage-status deltas detected.

### Known Open Incidents
- VPS-SOCAT-PERSIST: prices + bctc VPS routes degraded; ops recovery in progress
- vn-foreign-flow service: UNHEALTHY (0ms response) — ops dispatched
