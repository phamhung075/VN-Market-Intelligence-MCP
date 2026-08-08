

## c54 · 2026-08-08T15:30Z

### Audit Run Tier-1 (15:11–15:14 UTC 2026-08-08)
- Tier: 1 | Services: 7 checked | Containers: All UP (healthy)
- Anomalies: 0 new | Status: HEALTHY
- A-30 deep-probe mcp-server-1: FOLD (benign GC), no escalation
  - Baseline: 86.74% (consistent with 86.45% trigger report)
  - 6-sample window: 86.80%–91.16%, median 89.83%
  - VmHWM pinned at cap (96%) but NOT advancing in window
  - No OOMKilled, no state changes, no discontinuities
  - Distinct from rag-service-1 (81.73%, below gate)
- A-20 pdf-extractor multi-probe: 3/3 PASS
- All health endpoints: OK
- Disk: 65% (PASS)
- Result: ALL_GREEN, no findings

## c53 · 2026-08-08T14:34Z
### Audit Run Tier-1 (14:33–14:34 UTC 2026-08-08)
- Tier: 1 | Services: 13 checked | Health checks: 5 + A-20/A-21/A-30 | Disk: checked
- Anomalies: 0 new (C 0, W 0, I 0) | M 0 dedup-skipped
- Status: HEALTHY

#### RAW-PROBE: 2026-08-08T14:33:16Z
• All 13 services UP and healthy
• All 5 health endpoints 200 OK
• A-20 (pdf-extractor) 3/3 probes pass
• A-21 (crashes) windowed=0 pass
• A-30 (mcp-server) 84.75% MemPerc < 85% gate → SKIP deep-probe PASS
• Disk / 65% capacity PASS
• A-33 Hook enforcement: all checks PASS

#### Findings
No findings — all checks PASS

## c52 · 2026-08-08T14:21Z
### Audit Run Tier-2 (14:20–14:21 UTC 2026-08-08)
- Tier: 2 | Services: 5 checked | Sources: 28 checked | DB checks: N/A
- Anomalies: 2 new (C 0, W 2, I 0) | M 0 dedup-skipped  
- Status: DEGRADED

#### Findings
- [emit-signal] OK dedup_key=vps_proxy_stale:bctc-discover:B-06 id=sys-20260808T142113-654c
- [emit-dashboard] OK id=sys-20260808T142113-654c check_id=B-06
- [emit-signal] OK dedup_key=cron_fire_gap:bctcReparseJob:A-29 id=sys-20260808T142115-1b11
- [emit-dashboard] OK id=sys-20260808T142115-1b11 check_id=A-29

#### Details
B-06: bctc VPS proxy stale — last push 2026-08-04T08:34:40Z (age ~101h30m)
  - Impact: BCTC earnings report pipeline delayed
  - Corroboration: confirmed via get_vps_proxy_health output

A-29: bctcReparseJob cron degradation — 57.1% success rate (3/7 failures)
  - Impact: Slow BCTC PDF reparse enrichment
  - Corroboration: confirmed via get_cron_health output

## c51 · 2026-08-08T14:07Z

### Audit Run Tier-1
- Tier: 1 | Services: 13 checked | Health checks: 5 + A-20/A-21/A-30 | Disk: checked
- Anomalies: 2 new CRITICAL | 1 dedup-skipped
- Status: DEGRADED

#### RAW-PROBE: 2026-08-08T14:04:04Z
• All 13 services UP
• All health endpoints 200 OK
• A-20 (pdf-extractor) 3/3 probes pass
• A-21 (crashes) windowed=0 pass
• A-30 (mcp-server) ESCALATE: VmHWM advancing pinned at cap (89.69% mem, 2834528kB HWM)
• rag-service 96.91% BELOW-FLOOR (7MiB free, floor 40MiB)
• Disk / 65% capacity PASS

#### Findings
[A-30] mcp-server CRITICAL: mem creep, VmHWM advancing pinned at cap
[emit-signal] OK dedup_key=microservice_degraded:mcp-server:A-30 id=sys-20260808T140623-62a6
[emit-dashboard] OK id=sys-20260808T140623-62a6 check_id=A-30
[A-30] rag-service CRITICAL: 96.91% mem BELOW-FLOOR
[emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 id=sys-20260808T140625-7343
[emit-dashboard] OK id=sys-20260808T140625-7343 check_id=A-30


## c50 · 2026-08-08T13:30Z

### Audit Run Tier-1

**Fire-election:** CLAIMED — cron:auditor-t1:2026-08-08T13:30Z

#### RAW-PROBE (2026-08-08T13:34:32Z)
```
=== AUDITOR PROBE 2026-08-08T13:34:32Z ===

--- docker ps -a ---
All 13 services UP (healthy status)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=77.04% MemUsage=2.311GiB / 3GiB
## c50 · 2026-08-08T13:30Z

### Audit Run Tier-1

**Fire-election:** CLAIMED — cron:auditor-t1:2026-08-08T13:30Z

#### RAW-PROBE (2026-08-08T13:34:32Z)
```
=== AUDITOR PROBE 2026-08-08T13:34:32Z ===

--- docker ps -a ---
All 13 services UP (healthy status)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=77.04% MemUsage=2.311GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 77.04% < 85% investigate-gate

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

--- disk df -h / ---
Capacity: 64% < 85% — PASS
```

#### Container Status (A-01 through A-11)
[RAW-PROBE] All host_runtime_set services UP and healthy.

#### Health Endpoints (A-12 through A-20)
[RAW-PROBE] All checked services responding HTTP 200 — PASS.

##### A-20 Multi-Probe (pdf-extractor event-loop)
[RAW-PROBE] 3 in-container probes: pass_count=3/3 — PASS.

#### Restart Count (A-21)
[RAW-PROBE L6] mcp-server RestartCount=3. Windowed crash-only query: crashRestarts=0 — PASS.
