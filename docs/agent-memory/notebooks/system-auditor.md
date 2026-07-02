# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c501 · 2026-07-02T21:44:33Z
### Audit Run Tier-1 (21:30–21:44 UTC 2026-07-02)
- Tier: 1 | Fire-election: WON (tick=2026-07-02T21:30Z) | Services: 13/13 UP
- Health endpoints: 5/5 OK | A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21: RestartCount=4 (no new crash evidence — baseline match) | A-30: 22.15% mem (PASS)
- A-32: 45% disk (PASS) | Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: 13/13 UP, 5/5 health OK, A-20 3/3 PASS, restart=4, mem=22.15%, disk=45%

## c500 · 2026-07-02T21:16:12Z
### Audit Run Tier-1 (21:00–21:16 UTC 2026-07-02)
- Tier: 1 | Fire-election: WON (tick=2026-07-02T21:00Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (NEW, baseline was 3) — emit WARN signal
- A-30: 15.89% memory (PASS, improved from 95.28%) | A-32 disk: 46% PASS (<85%)
- Crons: All OK (success_rate≥80%, no fire gaps)
- Anomalies: 1 new (A-21 RestartCount increment) | Status: DEGRADED
- RAW-PROBE: 12/12 UP, 5/5 health OK, A-20 3/3 PASS, restart=4, mem=15.89%, disk=46%

## c499 · 2026-07-02T20:46:34Z
### Audit Run Tier-1 (20:30–20:46 UTC 2026-07-02)
- Tier: 1 | Fire-election: WON (tick=2026-07-02T20:30Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=3 (known baseline pattern) | A-32 disk: 47% PASS (<85%)
- A-30: 95.28% memory (SUPPRESSED — KNOWN-TRIAGED, improving from 99.99%, swap pending)
- Crons: All OK (no fire gaps detected, success_rate≥99%)
- Anomalies: 0 new | Dedup-suppressed: 1 (A-30 KNOWN-TRIAGED) | Status: HEALTHY
