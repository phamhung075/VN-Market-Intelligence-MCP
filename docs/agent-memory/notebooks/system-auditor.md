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

### A-30 Deep-Probe Analysis

**pdf-extractor (86.75% baseline):**
- Verdict: FOLD (benign GC sawtooth)
- Samples: 86.75%/86.75%/86.75%/86.75%/86.75%/86.75% (stable, flat)
- State: no OOMKilled, no state changes, no restarts
- VM: VmHWM pinned at 2587640KB (98.7% of cap), NOT advancing
- Reclamation: 0 dips, 0 discontinuities
- Result: PASS, no emit

**rag-service (99.68% baseline) — WORST READING YET:**
- Verdict: ESCALATE (sustained high >93%)
- Samples: 99.68%/99.68%/99.68%/99.68%/99.68%/99.68% (flat plateau, zero variation)
- Container status: BELOW-FLOOR, only 3.3MiB free (floor=40MiB), imminent-OOM risk
- State: no OOMKilled (yet), no state changes, RestartCount=0
- VM: VmHWM UNAVAILABLE (Amendment B: host-side headroom pre-check found container below MEM_FLOOR_MIB at moment of call — skipped exec safely)
- Reclamation: 0 dips, 0 discontinuities, sustained loss of reclamation
- Reason: all samples >93% sustained high — loss of reclamation (no longer vetoed by dip jitter)
- Severity per A-30 clause 4: ESCALATE + "loss of reclamation" → **WARN** (not CRITICAL, no state-change/OOMKilled/death-signature triggers)
- **Root cause CONFIRMED:** LanceDB `vector_search()` brute-force full-column scan on `rag_entries` table without vector index — measured ~65-80x embedder tensor footprint per query (architecture-brief 2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md §3b)
- **Fix status:** FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS dispatched to **dev-rag-service** (ready status, P0), spec: build IvfPq vector index on rag_entries.vector column
- Result: **EMIT A-30 WARN** (signal sys-20260812T040810-6125, dedup SKIP due to prior emit 2026-08-09T04:11:10Z, but signal still queued and DASHBOARD row emitted)

### Check Summary

| Check | Service/Item | Result | Notes |
|-------|--------|--------|-------|
| A-01–A-11 | Container status | PASS | All 8 host_runtime_set services UP |
| A-12–A-19 | Health endpoints | PASS | All 5 monitored endpoints HTTP 200 |
| A-20 | pdf-extractor multi-probe | PASS | 3/3 in-container probes OK |
| A-21 | Restart count (A-21) | PASS | mcp-server: RestartCount=0, no crash history |
| A-30 | Memory (pdf-extractor) | PASS | FOLD verdict, no escalation |
| A-30 | Memory (rag-service) | **WARN** | **ESCALATE verdict, 99.68% sustained, BELOW-FLOOR imminent-OOM** |
| A-32 | Disk capacity | PASS | 45% < 85% threshold |

### Audit Summary
- fire-election: CLAIMED (tick 2026-08-12T04:05Z)
- signals_posted: 1 (A-30 rag-service WARN, dedup SKIP)
- dashboard_rows: 1 (A-30 rag-service WARN)
- status: DEGRADED (A-30 WARN, no BUG telegram due to dedup, but escalation pathway active)
- fix_dispatch: FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS → dev-rag-service (ready)

---

## c47 · 2026-08-12T03:37:36Z

### Audit Run Tier-1 (03:37–03:39 UTC 2026-08-12) — MEMORY STABILIZATION CHECK

- Tier: 1 | Services: 8 checked (host_runtime_set), all UP and healthy
- Anomalies: 0 reported
- Status: HEALTHY — pdf-extractor and rag-service memory stable

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T03:37:36Z ===

--- docker ps -a (summary) ---
All 8 host_runtime_set services: UP (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=11.66% MemUsage=358.2MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 86.75% ENGAGED, 6-sample deep-probe
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 91.75% ENGAGED, 6-sample deep-probe
```

### A-30 Deep-Probe Analysis

**pdf-extractor (86.75% baseline):**
- Verdict: FOLD (benign GC sawtooth)
- Samples: 86.75%/86.75%/86.75%/86.75%/86.75%/86.75% (stable, no variation)
- State: no OOMKilled, no restarts, no state change during 65s window
- VM: VmHWM pinned at 2587640KB (98.7% of 2621440KB cap) but NOT advancing
- Reclamation: 0 dips, 0 discontinuities
- Tripwire: below escalation thresholds
- Result: PASS, no emit

**rag-service (91.75% baseline):**
- Verdict: FOLD (benign GC sawtooth)
- Samples: 91.81%/91.81%/91.81%/91.81%/91.81%/91.81% (stable, no variation)
- State: no OOMKilled, restart_count=0, no state change during 65s window
- VM: VmHWM pinned at cap but NOT advancing in window
- Reclamation: 0 dips, 0 discontinuities
- Tripwire: below escalation thresholds (median 91.81% < 93% sustained floor)
- Result: PASS, no emit

### Check Summary

| Check | Service/Item | Result | Notes |
|-------|--------|--------|-------|
| A-01–A-11 | Container status | PASS | All 8 host_runtime_set services UP |
| A-12–A-19 | Health endpoints | PASS | All 5 monitored endpoints HTTP 200 |
| A-20 | pdf-extractor multi-probe | PASS | 3/3 in-container probes OK |
| A-21 | Restart count (A-21) | PASS | mcp-server: RestartCount=0, no crash history |
| A-30 | Memory (pdf-extractor) | PASS | FOLD verdict, no escalation |
| A-30 | Memory (rag-service) | PASS | FOLD verdict, no escalation |
| A-32 | Disk capacity | PASS | 45% < 85% threshold |

### Audit Summary
- fire-election: CLAIMED (tick 2026-08-12T03:30Z)
- signals_posted: 0 (all checks PASS)
- dashboard_rows: 0
- status: ALL_GREEN
- dedup: 0 skipped

---
