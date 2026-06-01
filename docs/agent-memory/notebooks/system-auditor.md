---
agent: system-auditor
session_date: 2026-06-01
---

## c002 · 2026-06-01T03:38Z
### Audit Run Tier-1 (03:37–03:38 UTC 2026-06-01)
- Tier: 1 | Services checked: 9 | Sources checked: 7 | DB checks: 0
- Anomalies: 2 new (1 critical, 1 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED

### Container Status
- mcp-server: Up 6h, healthy, restart_count=1 ✓, memory=67.46% ✓
- mcp-gateway: Up 4d, healthy, memory<10% ✓
- macro-indicators: WARN — get_macro_snapshot unavailable (A-20)

### Cron Health
- 75 jobs polled, 100% firing; success_rate ≥99.2% all jobs
- intelligenceCycleJob: 99.4% | bctcQueueEnricherJob: 99.2%
- All others: 100% past 7d

### Data Freshness
- Prices: fresh (1 min)
- News: fresh (0 min)
- Foreign-flow: fresh (1 min) — tool validation error in caller, not source
- BCTC: 80h old — CRITICAL SLA BREACH (VPS-SOCAT-PERSIST)
- SBV/Commodities: fresh (22–30 min)

### VPS Proxy Status
- 5 services healthy (0ms response time)
- Prices: 52 pushes/24h, 0 errors ✓
- News: 115 pushes/24h, 0 errors ✓
- Foreign-flow: fallback chain triggered due to macro-indicators down

### API Rate Limits
- 12 sources ready (0% utilization) ✓

### Known Open Incidents
- macro-indicators DOWN: get_macro_snapshot error (A-20, WARN)
- BCTC stale 80h: VPS-SOCAT-PERSIST in progress
- Foreign-flow validation: requires code param; macro-indicators dep down

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
