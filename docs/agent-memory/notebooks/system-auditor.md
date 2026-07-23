


## c0077263 · 2026-07-23T00:31:44Z
### Audit Run Tier-3 (00:31 UTC 2026-07-23)
- Tier: 3 | Runtime (Tier-1): 12 containers UP, 5 health endpoints 200 OK
- Doc/Memory audit: Steps 1-6 all PASS (CLAUDE.md 62L, task_board 0, WAL 4.1MB)
- DB Integrity (C-01 to C-16): C-02=51 rows, C-03=45 codes, C-07=182 signals, PRAGMA=ok
- Off-hours note: C-01=0 codes, C-06=0 messages (expected before market open 09:00 VN)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-23T00:31:44Z ===

--- docker ps -a ---
All 12 containers UP (healthy status)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=69.08% MemUsage=2.072GiB / 3GiB

--- disk df -h / ---
Filesystem: 233Gi Size, 13Gi Used, 33Gi Avail, 29% Capacity

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c72407e2 · 2026-07-22T22:42:22Z
### Audit Run Tier-1 (22:42 UTC 2026-07-22)
- Tier: 1 | Services checked: 12 | Health endpoints: 5
- Memory: mcp-server 53.62% (1.6 GiB / 3 GiB), Disk: 29% used
- Anomalies: 0 new
- Status: HEALTHY

## c-2026-07-22-T22:33 · 2026-07-22T22:33:17Z
### Audit Run Tier-2 (22:33 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS | Sources checked: 28
- VPS proxy health: 2 healthy, 2 stale | BCTC healthy-idle gate: PASS
- DB spot checks: PASS | Rate limits: All 12 sources ready
- Anomalies: 1 new (C critical × 1: sbv-vps stale) | Status: DEGRADED

## c3c5e1a · 2026-07-22T18:32:45Z
### Audit Run Tier-2 (18:31–18:32 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS | Sources checked: 28
- VPS proxy health: 2 healthy, 2 stale | Rate limits: All ready
- Anomalies: 1 new (W warn × 1: sbv_fx SLA) | Status: DEGRADED
