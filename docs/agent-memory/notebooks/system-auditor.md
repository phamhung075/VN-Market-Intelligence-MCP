## h8a2f3c1 · 2026-07-23T18:34:09Z
### Audit Run Tier-2 (18:33–18:34 UTC 2026-07-23)
- Tier: 2 | Sources: 12 | Cron checks: 1 | VPS routes: 4 | BCTC health gates: 3
- A-29 cron fire gaps: PASS (all major jobs executing on schedule, no 2x cadence gaps)
- B-01..B-07 data freshness: PASS (pipeline health healthy, get_pipeline_health generated 2026-07-23T18:31:49, all sources recent)
- B-09 BCTC URL shape: PASS (0 SSC portal URLs in queue)
- B-13 stale pending BCTC: PASS (0 stale items > 72h)
- B-05 BCTC healthy idle gate: PASS (183 actionable queue items, push-age 72h << SLA threshold 195.5h out-of-window)
- C-06 market_messages 3h: 0 (off-market hours 03:00 VN time, expected INFO) | C-07 agent_signals 24h: 308 PASS
- SLA status: sbv_fx 47m/30m threshold breached → signal_queue row appended (dedup-skipped: B-04 last_sent 2026-07-21T18:32:00Z)
- Anomalies: 0 new (1 dedup-skipped sbv_fx)
- Status: HEALTHY
- Corroboration: Fleet healthy apart from known launchd (docker-events, fleet-push already tracked 2026-07-23T10:32). Heartbeat refreshed (tier-2-last-healthy.json).

## g7e1f2a5 · 2026-07-23T17:41:24Z
### Audit Run Tier-1 (17:41 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 22.62% (695 MiB / 3 GiB) — well below threshold
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (4h window) | A-32 Disk: 33% used
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 12 host_runtime_set services UP (healthy). All 5 health endpoints 200 OK. A-20 3/3 in-container probes pass. A-21 zero crash events in 4h window. Memory stable at 22.62%, well below 85%. Disk 33%. No clock skew detected (file mtimes normal). All cron jobs executing. docker-events/fleet-push already tracked as known launchd issues (dedup guard active).

## f3c2d1e4 · 2026-07-23T16:17:07Z
### Audit Run Tier-1 (16:17 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server peak 99.92% → benign GC recovery to 4.34% (FOLD verdict, A-30 already dedup)
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (container uptime 12h, no crash events) | Disk: 32% used
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 12 host_runtime_set services UP. All health endpoints 200 OK. A-30 memory spike benign (VmHWM >> VmRSS proves reclamation). docker-events/fleet-push already tracked in dedup ledger (2026-07-23T10:32).

## e7d9a3b2 · 2026-07-23T14:32:41Z
### Audit Run Tier-2 (14:32 UTC 2026-07-23)
- Tier: 2 | Sources: 6 checked | VPS routes: 4 | Cron checks: 1
- A-29 fire-check: PASS | B-06 VPS health: news ok, prices ok, sbv STALE (35h, dedup-skipped), bctc ok by-design
- C-06/C-07 DB freshness: PASS (2 msgs, 305 signals)
- Anomalies: 0 new (1 dedup-skipped from 2026-07-22)
- Status: HEALTHY

## a1f8b5c9 · 2026-07-23T14:11:19Z
### Audit Run Tier-1 (14:06–14:11 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 73.43% (2.203 GiB / 3 GiB) — stable
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (window: 4h) | Disk: 30% used
- Anomalies: 0 new
- Status: HEALTHY
