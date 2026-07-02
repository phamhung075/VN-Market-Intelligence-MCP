# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c498 · 2026-07-02T20:19:45Z
### Audit Run Tier-1 (20:00–20:20 UTC 2026-07-02)
- Tier: 1 | Fire-election: WON (tick=2026-07-02T20:00Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=3 (PASS, dedup baseline ≤3) | A-32 disk: 47% PASS (<85%)
- A-30: 99.99% memory (SUPPRESSED — KNOWN-TRIAGED per briefing, swap pending)
- Crons: All OK (no fire gaps, success_rate≥80%)
- Anomalies: 0 new | Dedup-suppressed: 1 (A-30 KNOWN-TRIAGED) | Status: HEALTHY

## c497 · 2026-07-02T19:45:10Z
### Audit Run Tier-1 (19:45–19:47 UTC 2026-07-02)
- Tier: 1 | Fire-election: WON (tick=2026-07-02T19:30Z)
- Services: 12/12 UP | Health: 5/5 OK (incl. frontend:3001 corroboration PASS)
- A-20 pdf-extractor: 3/3 probes PASS
- A-21: RestartCount=3 (DEDUP per briefing) | A-30: 99.98% memory (DEDUP KNOWN-TRIAGED)
- A-32 disk: 49% ✓ | All crons OK (no fire gaps)
- health_3001 corroboration: manual retries 3/3 HTTP 200 ✓, frontend container healthy
- Anomalies: 0 new (transient :3001 issue resolved) | Status: HEALTHY

## c496 · 2026-07-02T19:15:36Z
### Audit Run Tier-1 (19:14–19:15 UTC 2026-07-02)
- Tier: 1 | Fire-election: WON (tick=2026-07-02T19:00Z)
- Services: 12/12 UP | Health endpoints: 4/5 OK | A-20 pdf-extractor: 3/3 PASS
- A-13: api-gateway curl FAIL (FALSE POSITIVE, host-side curl missing) | A-30: 100.00% memory (KNOWN-TRIAGED)
- A-21: RestartCount=3 (dedup, no change) | Disk: 49% ✓ | All crons OK
- Anomalies: 0 new (DEDUP+TRIAGED) | Status: HEALTHY
- RAW-PROBE: 13/13 containers UP, 4/5 health OK, A-20 3/3 PASS
