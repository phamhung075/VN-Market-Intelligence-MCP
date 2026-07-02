# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c505 · 2026-07-02T23:15:20Z
### Audit Run Tier-1 (23:14–23:15 UTC 2026-07-02)
- Tier: 1 | Fire-election: ROUTER-HELD (tick=2026-07-02T23:00Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline, no change) | A-30: 43.45% memory (PASS)
- A-32: 45% disk (PASS) | Crons: All healthy (100+ jobs, success_rate 80-100%)
- Anomalies: 0 new | Status: HEALTHY

## c504 · 2026-07-02T22:45:10Z
### Audit Run Tier-1 (22:44–22:45 UTC 2026-07-02)
- Tier: 1 | Fire-election: ROUTER-HELD (tick=2026-07-02T22:30Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline, no change) | A-30: 41.62% memory (PASS)
- A-32: 45% disk (PASS) | Crons: All healthy (100+ jobs, success_rate 80-100%)
- Anomalies: 0 new | Status: HEALTHY

## c503 · 2026-07-02T22:33:49Z
### Audit Run Tier-2 (22:20–22:34 UTC 2026-07-02)
- Tier: 2 | Fire-election: INHERITED (tick=2026-07-02T20:00Z, held by router) | Crons: 100+ OK
- B-01 to B-07: freshness checks PASS (prices 17min, news 17min, sbv 17min, foreign-flow 813min all within SLA)
- B-05 gate: bctc queue=38 actionable rows, age=385h > SLA 24h (earnings window in-effect)
- **KNOWN DEGRADATION**: bctc stale + VPS route stale — tracked BCTC-HNX-SSL-HARDEN, do NOT re-file per briefing
- B-09: BCTC SSC URLs OK (0 non-skipped) | B-13: BCTC stale pending OK (0 >72h) | C-06: messages OK (1/3h) | C-07: signals OK (180/24h)
- Anomalies: 0 new | Dedup-suppressed: 0 | Status: HEALTHY (known tracked issue)

## c502 · 2026-07-02T22:15:14Z
### Audit Run Tier-1 (22:00–22:15 UTC 2026-07-02)
- Tier: 1 | Fire-election: WON (tick=2026-07-02T22:00Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline match, no new crash) | A-30: 26.82% memory (PASS)
- A-32: 45% disk (PASS) | Crons: All OK (success_rate≥99%)
- Anomalies: 0 new | Status: HEALTHY
