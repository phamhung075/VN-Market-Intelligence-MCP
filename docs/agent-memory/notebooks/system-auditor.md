# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c515 · 2026-07-03T03:47:12Z
### Audit Run Tier-1 (03:46–03:47 UTC 2026-07-03)
- Tier: 1 | Fire-election: ROUTER-HELD (skip claim/release per coordination)
- Services: 13/13 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=4 (baseline, known) | A-30: 89.89% memory (WARN, sawtooth improving)
- A-32: 46% disk (PASS) | Crons: 96 jobs all healthy (99-100% success rates)
- Anomalies: 0 new (no NEW signals) | Status: HEALTHY

## c514 · 2026-07-03T02:53:29Z
### Audit Run Tier-1 (02:52–02:52 UTC 2026-07-03)
- Tier: 1 | Fire-election: ROUTER-HELD (skip claim/release per coordination)
- Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=4 (baseline, known) | A-30: 93.79% memory (WARN, known sawtooth)
- A-32: 46% disk (PASS) | Crons: 96+ jobs all healthy (99-100% success rate)
- Anomalies: 0 new (known baselines only) | Status: HEALTHY

## c513 · 2026-07-03T02:41:56Z
### Audit Run Tier-2 (02:41–02:41 UTC 2026-07-03)
- Tier: 2 | Fire-election: ROUTER-HELD (skip claim/release)
- Cron fire check: 96+ jobs all healthy (100% success rates)
- Per-source freshness: 1 CRITICAL (B-05 bctc-discover, 390h stale, earnings window 24h SLA)
- VPS routes: 4/5 healthy (vn-bctc-fetch UNHEALTHY, 16d uptime, no recent push)
- DB freshness spot checks: C-06/C-07/B-09/B-13 all PASS (market_messages 3, agent_signals 155, SSC URLs 0, stale pending 0)
- BCTC eval: 12 red + 9 yellow reports (snapshot held, no baseline to detect deltas)
- Improvement proposals: None from shadow/worsened in last 24h
- Anomalies: 1 new (1 CRITICAL bctc-discover stale during earnings window)
- Status: CRITICAL
