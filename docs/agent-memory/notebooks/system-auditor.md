## c49 · 2026-08-12T04:35:21Z

### Audit Run Tier-1 (04:35–04:36 UTC 2026-08-12) — RAG-SERVICE MEMORY RE-CLIMBING POST-RESTART

- Tier: 1 | Services: 8 checked (host_runtime_set), all UP
- Anomalies: 1 WARN reported (A-30 rag-service 97.23% sustained, loss of reclamation — dedup SKIP from 2026-08-09 prior)
- Status: DEGRADED — rag-service re-climbing memory post-restart (22 min up), known vector indexing pattern

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T04:35:21Z ===

--- docker ps -a (summary) ---
All 8 host_runtime_set services: UP (healthy)
- vn-market-intelligence-mcp-rag-service-1: Up 22 minutes (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=14.46% MemUsage=444.2MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 14.46% < 85% investigate-gate
[A-30] ENGAGE: pdf-extractor baseline 86.75% >= 85% investigate-gate — deep-probe
[A-30] ENGAGE: rag-service baseline 97.23% >= 85% investigate-gate — deep-probe (POST-RESTART RE-CLIMB)

{...pdf-extractor JSON: FOLD verdict...}
{...rag-service JSON: ESCALATE verdict, all samples >93% sustained, loss of reclamation...}
```

### A-30 Deep-Probe Analysis

**pdf-extractor (86.75% baseline):**
- Verdict: FOLD (benign GC sawtooth, stable 86.75%-86.76% samples)
- VmHWM: pinned at 2587640KB (98.7% of cap), NOT advancing
- Reclamation: 0 dips, 0 discontinuities over 65s window
- Result: PASS, no emit

**rag-service (97.23% baseline) — POST-RESTART RE-CLIMB:**
- Verdict: ESCALATE (all samples >93% sustained high)
- Samples: min=97.23%, median=97.24%, max=97.48% (zero variation, flat plateau)
- State: no OOMKilled, no state changes during 65s window, no restarts this cycle
- VmHWM: UNAVAILABLE (Amendment B headroom pre-check skipped — container BELOW-FLOOR state)
- Reclamation: 0 dips, 0 discontinuities
- Reason: "all samples >93% sustained high — loss of reclamation"
- Severity: WARN (sustained high >93%, no death-signature)
- Context: Container restarted 2026-08-12T04:12:36Z (22 min prior). Known unbounded leak: LanceDB vector_search() brute-force without index. Permanent fix (FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS) ready, assigned P0 to dev-rag-service.
- Result: **EMIT A-30 WARN** (signal sys-20260812T043713-660d, dedup SKIP from 2026-08-09T04:11:10Z)

### Check Summary

| Check | Service/Item | Result | Notes |
|-------|--------|--------|-------|
| A-01–A-11 | Container status | PASS | All 8 host_runtime_set services UP |
| A-12–A-19 | Health endpoints | PASS | All 5 monitored endpoints HTTP 200 |
| A-20 | pdf-extractor multi-probe | PASS | 3/3 in-container probes HTTP 200 |
| A-21 | Restart count | PASS | mcp-server: RestartCount=0 |
| A-30 | Memory (pdf-extractor) | PASS | FOLD verdict, stable |
| A-30 | Memory (rag-service) | **WARN** | **ESCALATE: 97.23% sustained, loss of reclamation, post-restart re-climb** |
| A-32 | Disk capacity | PASS | 47% < 85% threshold |

### Markers & Signals

[emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 last_sent=2026-08-09T04:11:10Z id=sys-20260812T043713-660d
[emit-dashboard] OK id=sys-20260812T043713-660d check_id=A-30

### Audit Summary
- fire-election: CLAIMED (tick 2026-08-12T04:30Z)
- signals_posted: 1 (A-30 rag-service WARN, dedup SKIP)
- dashboard_rows: 1 (A-30 rag-service WARN)
- status: DEGRADED (A-30 WARN, known pattern, awaiting fix dispatch)

---

## c48 · 2026-08-12T04:05:52Z

### Audit Run Tier-1 (04:05–04:08 UTC 2026-08-12) — CRITICAL ESCALATION: RAG-SERVICE BELOW-FLOOR OOM IMMINENT

- Tier: 1 | Services: 8 checked (host_runtime_set), all UP
- Anomalies: 1 WARN reported (A-30 rag-service 99.68% BELOW-FLOOR)
- Status: DEGRADED → CRITICAL ESCALATION — rag-service memory plateaued at worst reading yet (99.68%), only 3.3MiB free below 40MiB floor, imminent-OOM risk. Root cause confirmed and fix dispatched.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T04:05:52Z ===

--- docker ps -a (summary) ---
All 8 host_runtime_set services: UP (healthy)
- vn-market-intelligence-mcp-rag-service-1: Up 3 hours, healthy

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=19.28% MemUsage=592.3MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP: mcp-server baseline 19.24% < 85% investigate-gate
[A-30] ENGAGE: pdf-extractor baseline 86.75% >= 85% investigate-gate — deep-probe
[A-30] ENGAGE: rag-service baseline 99.68% >= 85% investigate-gate — deep-probe (CRITICAL: 3.3MiB free, BELOW-FLOOR 40MiB)
```

---
