## d8f2c1a5 · 2026-07-23T10:33:18Z
### Audit Run Tier-2 (10:33 UTC 2026-07-23)
- Tier: 2 | Launchd checks: 3 agents | Signal-queue rows: 3
- Anomalies: 3 new (2 CRITICAL, 1 WARN launchd agents)
- Status: DEGRADED
- Findings:
  - A-LAUNCHD-DOCKER-EVENTS: CRITICAL — com.vn-market.docker-events crash-looping (exit-status:1)
  - A-LAUNCHD-COWORK-FIRER: WARN — com.vn-market.cowork-guaranteed-slot-firer terminated (exit-status:143 SIGTERM)
  - A-LAUNCHD-FLEET-PUSH-CONFIRM: CRITICAL — com.vn-market.fleet-push dead (exit-status:78 EX_CONFIG, attributed to FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD)
- Signals emitted: sys-20260723T103217-1735, sys-20260723T103223-47fd, sys-20260723T103235-5181
- Note: Launchd findings sourced from auditor-tier1-probe.sh --tier=2 fast-gate probe (commit e0d9187cd, 2026-07-23). New check A-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN now asserts exit-status ≠ 0 (was presence-only before).

## c9d4e5f2 · 2026-07-23T09:10:41Z
### Audit Run Tier-1 (09:10 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 51.22% (1.537 GiB / 3 GiB) — stable
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (window: 4h) | Disk: 29% used
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 12 host_runtime_set services healthy, all 5 health endpoints 200 OK. A-20 3/3 probes pass (event loop responsive). A-21 0 crash events in 4h window. Memory at 51.22%, well below 85%. Disk 29% used. Cron jobs executing normally.

## 8a49e127 · 2026-07-23T08:41:24Z
### Audit Run Tier-1 (08:41 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 47.03% (1.411 GiB / 3 GiB) — stable
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (window: 4h) | Disk: 29% used
- Anomalies: 0 new
- Status: HEALTHY

## 7c4d2a9f · 2026-07-23T07:41:56Z
### Audit Run Tier-1 (07:41 UTC 2026-07-23)
- Tier: 1 | Services: 12 checked | Health endpoints: 5
- Memory: mcp-server 40.10% (1.203 GiB / 3 GiB) — stable
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (window: 4h) | Disk: 29% used
- Anomalies: 0 new
- Status: HEALTHY
