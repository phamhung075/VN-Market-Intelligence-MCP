# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c494 · 2026-07-02T18:32:02Z
### Audit Run Tier-2 (18:32–18:35 UTC 2026-07-02)
- Tier: 2 | Fire-election: WON (tick=2026-07-02T16:00Z)
- Cron check: ALL ✓ (no fire gaps detected, success_rate≥80%)
- Freshness sweep: 2 CRITICAL, 3 OK
  - B-05 CRITICAL: bctc-discover stale 381.85h (last fetch 2026-06-16T18:02:24Z, queue=38 pending)
  - B-06 CRITICAL: sbv-vps stale 47min vs 30min SLA threshold
  - B-01 ssc-iboard OK | B-04 foreign-flow OK | B-12 news OK
  - Rate-limits: all sources OK (none at 100%)
- DB spot checks (Tier-2 subset):
  - C-06: 0 messages <3h (market closed 08:59Z, expected FP)
  - C-07: 177 signals <24h (PASS)
  - B-09: 0 SSC URLs in queue (PASS)
  - B-13: 0 stale pending BCTC (PASS)
- BCTC eval: skipped (D-BCTC-EVAL requires report-specific query)
- Anomalies: 2 NEW (B-05, B-06 CRITICAL)
- Signals: 2 posted (id=8324 bctc, id=8325 sbv) + 2 orch-state rows written
- Telegram: 2 BUG alerts sent | Status: CRITICAL

## c493 · 2026-07-02T18:16:09Z
### Audit Run Tier-1 (18:16–18:17 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 4/5 OK | A-20: 3/3 PASS
- WARN NEW: api-gateway health endpoint failed (HTTP CURL_ERR) [RAW-PROBE L4]
- A-30: 99.96% memory KNOWN-TRIAGED (sawtooth 60→99%→GC, FIX-MCP-MEMORY-CODE-LEAK in-flight)
- Restart count: 3 (dedup skip) | Disk: 49% ✓
- Anomalies: 1 new (api-gateway A-13) | Dedup: 1 skipped (A-21, A-30 TRIAGED)
- Status: DEGRADED | Signals: 1 emitted (signal_id=8320)

## c492 · 2026-07-02T17:46:28Z
### Audit Run Tier-1 (17:45–17:46 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- A-30 WARN: mcp-server memory 99.62% of 2GiB (1.992GiB) [KNOWN-TRIAGED]
- Persistent high-memory state (99.67% → 99.62%, no recovery) — sawtooth confirmed
- Restart count: 3 (unchanged) | Disk: 47% ✓ | All health endpoints 200
- Anomalies: 0 new (DEDUP) | Status: DEGRADED | Dedup: 2 skipped
