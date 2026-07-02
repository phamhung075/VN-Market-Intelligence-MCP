# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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
- health_3001 corroboration: manual retries 3/3 HTTP 200 ✓, frontend container healthy (Running, no OOMKilled)
- Anomalies: 0 new (transient :3001 issue resolved) | Status: HEALTHY
- RAW-PROBE: 12/12 services UP (healthy), 5/5 health OK, A-20 3/3 PASS, disk 49%

## c496 · 2026-07-02T19:15:36Z
### Audit Run Tier-1 (19:14–19:15 UTC 2026-07-02)
- Tier: 1 | Fire-election: WON (tick=2026-07-02T19:00Z)
- Services: 12/12 UP | Health endpoints: 4/5 OK | A-20 pdf-extractor: 3/3 PASS
- A-13: api-gateway curl FAIL (FALSE POSITIVE, host-side curl missing) | A-30: 100.00% memory (KNOWN-TRIAGED)
- A-21: RestartCount=3 (dedup, no change) | Disk: 49% ✓ | All crons OK
- Anomalies: 0 new (DEDUP+TRIAGED) | Status: HEALTHY
- RAW-PROBE: 13/13 containers UP, 4/5 health OK, A-20 3/3 PASS

## c495 · 2026-07-02T18:48:38Z
### Audit Run Tier-1 (18:48–18:50 UTC 2026-07-02)
- Tier: 1 | Fire-election: WON (tick=2026-07-02T18:30Z)
- Services: 12/12 UP | Health endpoints: 5/5 OK | A-20 pdf-extractor: 3/3 PASS
- A-21: RestartCount=3 (WARN, DEDUP c493) | A-30: 99.98% memory (WARN, KNOWN-TRIAGED)
- Disk: 49% ✓ | Cron: all OK, no fire gaps
- Anomalies: 0 new (DEDUP+TRIAGED) | Status: HEALTHY
- RAW-PROBE: All 12 services UP, 5/5 health endpoints OK, A-20 multi-probe 3/3 PASS

## c494 · 2026-07-02T18:32:02Z
### Audit Run Tier-2 (18:32–18:35 UTC 2026-07-02)
- Tier: 2 | Fire-election: WON (tick=2026-07-02T16:00Z)
- Cron check: ALL ✓ (no fire gaps detected, success_rate≥80%)
- Freshness sweep: 2 CRITICAL, 3 OK
  - B-05 CRITICAL: bctc-discover stale 381.85h (last fetch 2026-06-16T18:02:24Z, queue=38 pending)
  - B-06 CRITICAL: sbv-vps stale 47min vs 30min SLA threshold
  - B-01 ssc-iboard OK | B-04 foreign-flow OK | B-12 news OK
  - Rate-limits: all sources OK (none at 100%)
- DB spot checks (Tier-2 subset): C-06: 0 messages <3h (market closed 08:59Z, expected FP) | C-07: 177 signals <24h (PASS) | B-09: 0 SSC URLs (PASS) | B-13: 0 stale pending (PASS)
- Anomalies: 2 NEW (B-05, B-06 CRITICAL) | Signals: 2 posted + 2 orch-state rows written | Status: CRITICAL

## c493 · 2026-07-02T18:16:09Z
### Audit Run Tier-1 (18:16–18:17 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 4/5 OK | A-20: 3/3 PASS
- WARN NEW: api-gateway health endpoint failed (HTTP CURL_ERR) [RAW-PROBE L4]
- A-30: 99.96% memory KNOWN-TRIAGED (sawtooth 60→99%→GC, FIX-MCP-MEMORY-CODE-LEAK in-flight)
- Restart count: 3 (dedup skip) | Disk: 49% ✓
- Anomalies: 1 new (api-gateway A-13) | Dedup: 1 skipped (A-21, A-30 TRIAGED)
- Status: DEGRADED | Signals: 1 emitted (signal_id=8320)
