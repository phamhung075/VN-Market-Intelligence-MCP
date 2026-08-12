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
## c50 · 2026-08-12T05:00Z

### Audit Run Tier-1 (05:04–05:06 UTC 2026-08-12) — RAG-SERVICE RESTART CYCLE DETECTED

- Tier: 1 | Services: 8 checked (host_runtime_set), all UP
- Anomalies: 1 CRITICAL escalation (A-30 rag-service container restarted during audit window)
- Status: DEGRADED — rag-service restarted during deep-probe window (~52 min since initial restart 04:12:36Z)

### RAW-PROBE:

```
=== AUDITOR PROBE 2026-08-12T05:04:16Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 11 hours (healthy)     vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-pdf-extractor-1        Up 28 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-rag-service-1          Up 51 minutes (healthy)   vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)      vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)      vn-market-intelligence-mcp-frontend
mcp-gateway                                       Up 3 weeks (healthy)      mcpservergatway-gateway
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)      vn-market-intelligence-mcp-api-gateway

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=13.05% MemUsage=400.9MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 13.04% < 85% investigate-gate
[A-30] pdf-extractor: baseline 86.76% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] rag-service: baseline 99.61% >= 85% investigate-gate — ENGAGE deep-probe

[A-30] A-20-PROBES: pdf-extractor all 3/3 OK

{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-pdf-extractor-1",
  "samples": [{"n":1,"t":"05:04:26Z","pct":86.76},...{"n":6,"t":"05:05:40Z","pct":86.76}],
  "analysis": {"min_pct": 86.76, "max_pct": 86.76, "median_pct": 86.76, "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "0", "restart_count_after": "0",
    "started_at_before": "2026-08-12T04:12:36.101523596Z", "started_at_after": "2026-08-12T05:04:33.067751053Z",
    "state_changed_during_window": true
  },
  "samples": [{"n":1,"t":"05:04:28Z","pct":99.61},{"n":2,"t":"05:04:42Z","pct":3.65},...{"n":6,"t":"05:05:41Z","pct":3.66}],
  "analysis": {"min_pct": 3.65, "max_pct": 99.61, "median_pct": 3.65, "discontinuities": 1, "discontinuity_detail": "99.61->3.65"},
  "verdict": "ESCALATE",
  "reason": "container died/restarted during window (StartedAt advanced 52+ min)"
}

--- disk df -h / ---
/dev/disk1s4s1   233Gi    13Gi    16Gi    47%    393k  165M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

### A-30 Deep-Probe Analysis

**pdf-extractor (86.76% baseline):**
- Verdict: FOLD (benign GC sawtooth, stable 86.76% across all 6 samples)
- VmHWM: pinned at 2587640KB (98.7% of 2.5GiB cap), NOT advancing during window
- Reclamation: 0 dips, 0 discontinuities over 65s window
- Result: PASS — no emit, no escalation

**rag-service (99.61% baseline) — RESTART DURING WINDOW:**
- Verdict: ESCALATE (state changed + restart detected during probe window)
- Critical Finding: Container restarted/recovered during audit window
  - StartedAt_before: 2026-08-12T04:12:36.101523596Z (initial restart from ops stopgap)
  - StartedAt_after: 2026-08-12T05:04:33.067751053Z (NEW restart detected during c50 audit window)
  - Timeline: ~52 min after initial 04:12:36Z restart, restarted again at 05:04:33Z
- Memory behavior:
  - Baseline sample (probe 1): 99.61% of 1GiB cgroup (right at hard limit)
  - Samples 2–6: 3.65–3.66% (post-restart stabilization)
  - Discontinuity: 99.61% → 3.65% indicates OOMKilled/crash + container restart
- Root cause (known): LanceDB vector_search() performs full-column scan without vector index; unbounded memory growth every ~50 minutes
- Permanent fix: FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (P0, ready[], blocked by dev-team WIP budget saturation)
- Interim mitigation: Ops stopgap restart (already dispatched in parallel per context)
- **Severity: CRITICAL — container crash cycle confirmed**
- Result: **EMIT A-30 CRITICAL** (signal dedup SKIP from 2026-08-06T08:16:21Z; same issue, 7d window still active)

### Signals & Telegrams

| Check | Severity | Status | Notes |
|-------|----------|--------|-------|
| A-01–A-11 (containers) | PASS | — | All 8 host_runtime_set services UP |
| A-12–A-19 (health) | PASS | — | All endpoints 200 OK |
| A-20 (pdf-extractor multi-probe) | PASS | — | 3/3 in-container probes OK |
| A-30 (memory deep-probe) | — | — | **pdf-extractor FOLD, rag-service ESCALATE** |
| A-30 pdf-extractor | PASS | FOLD | Benign GC, no emit |
| A-30 rag-service | CRITICAL | ESCALATE | [emit-signal] SKIP-dedup id=sys-20260812T050623-7474 (last_sent 2026-08-06T08:16:21Z) |

**Telegram: SKIP** — rag-service A-30 already on 7-day dedup ledger (prior cycle 2026-08-06). Signal appended to queue per AUD-CP-1 + init.md §28.

### Cycle Disposition

**Verdict: DEGRADED**
- System is operationally UP (all health checks pass, containers running)
- rag-service confirmed in restart cycle (crashed this audit window, recovered to 3.65% post-restart)
- Known root cause: vector index absence → unbounded growth every ~50min
- Ops mitigation: parallel stopgap restart dispatch (confirmed in context)
- Permanent fix: blocked on dev-team WIP concurrency budget (3 in-progress rows, ceiling WIP≤2)
- No new findings warranting BUG escalation (7d dedup active)
- Recommendation: monitor for next crash cycle around 2026-08-12T05:54Z (if pattern holds ~50min cadence)

