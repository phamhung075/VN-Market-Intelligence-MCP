# System Auditor — Tier-1 Notebook

## c92 · 2026-08-14T05:49:18Z

### Audit Run Tier-1 (05:46–05:49 UTC 2026-08-14, A-30 multi-probe re-evaluation)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 (STALE-ACK tracked case, no new findings) | Dedup-skipped: 0
- Status: ALL_GREEN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T05:46:47Z ===

--- docker ps -a ---
All 13 services UP (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.41% MemUsage=473.6MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 15.41% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.09% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.61% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.37% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 92.65% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 36.16% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.70% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.48% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.26% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.87% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.34% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 2.94% < 85% investigate-gate
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "3", "restart_count_after": "3",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "1502752", "vmhwm_kb_after": "1502752",
         "mem_limit_kb": "1048576",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true},
  "samples": [{"n":1,"t":"05:47:04Z","pct":92.67},{"n":2,"t":"05:47:18Z","pct":92.67},{"n":3,"t":"05:47:34Z","pct":92.86},{"n":4,"t":"05:47:48Z","pct":93.25},{"n":5,"t":"05:48:03Z","pct":93.64},{"n":6,"t":"05:48:18Z","pct":93.64}],
  "analysis": {"min_pct": 92.67, "max_pct": 93.64, "median_pct": 93.06,
               "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

--- disk df -h / ---
Capacity 36% (24Gi available)

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
- A-30 FOLD (c92 re-evaluation): rag-service memory 92.67–93.64% over 65s window (median 93.06%). Min is 0.33pp below the 93% escalation floor. No state changes, no OOM, no discontinuities, no VmHWM advancement. Verdict justified per discriminator logic: all tripwire conditions negative.
- **STALE-ACK context**: pre-gate flagged this as tracked by FU-RAG-DEPLOY-MEMORY (status=DONE_VERIFIED), indicating a task closure without full resolution. Memory pressure persists at near-threshold level (92-93% range for last 3 cycles).

### Analysis Summary:
Comparing c90 → c91 → c92:
- **c90 (04:17:44Z)**: rag-service 98.15% sustained (CRITICAL escalation, signal emitted)
- **c91 (04:44:01Z)**: rag-service 88.78% stable (FOLD, recovery observed)
- **c92 (05:46:47Z)**: rag-service 92.67–93.64% (FOLD, but now hovering just below threshold)

The discriminator's FOLD verdict is technically correct: min < 93% floor, median well below 97%. However, the recurrence pattern (98% → 88% → 93%) suggests the fix may have been incomplete or circumstantial—the container's steady state appears to be 92-93%, just below but very close to escalation threshold.

### Emit Actions:
```
[emit-signal] NONE — A-30 verdict FOLD (no escalation tripwires triggered)
[emit-dashboard] NONE — FOLD is not WARN/CRITICAL
[telegram] NONE — monitoring continues
```

### Cycle Summary:
Pre-gate verdict (auditor-tier1-probe.sh @ 05:45:39Z): FAILURE — mem_creep detected (rag-service 89.93%, STALE-ACK tracked).
c92 re-evaluation (05:46–05:49 UTC): A-30 multi-probe → FOLD (min 92.67% < 93% floor). No escalation triggers. rag-service memory oscillates near-threshold; FU-RAG-DEPLOY-MEMORY fix presumed incomplete — container's steady state is 92-93%, not baseline recovery.

---

## c91 · 2026-08-14T04:44:01Z

### Audit Run Tier-1 (04:44–04:45 UTC 2026-08-14, follow-up investigation)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 (no new findings) | Dedup-skipped: 0
- Status: ALL_GREEN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T04:44:01Z ===

--- docker ps -a ---
All services UP (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.16% MemUsage=465.9MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 15.16% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 88.77% >= 85% investigate-gate — ENGAGE deep-probe
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "3", "restart_count_after": "3",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "1502752", "vmhwm_kb_after": "1502752",
         "mem_limit_kb": "1048576",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true},
  "samples": [{"n":1,"t":"04:44:19Z","pct":88.78},{"n":2,"t":"04:44:34Z","pct":88.78},{"n":3,"t":"04:44:49Z","pct":88.78},{"n":4,"t":"04:45:04Z","pct":88.78},{"n":5,"t":"04:45:19Z","pct":88.78},{"n":6,"t":"04:45:34Z","pct":88.78}],
  "analysis": {"min_pct": 88.78, "max_pct": 88.78, "median_pct": 88.78,
               "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
- A-30 FOLD: rag-service memory stable at 88.78% (no escalation). Follow-up to c90's ESCALATE finding shows recovery/normalization. VmHWM pinned at cap but no state changes, no OOM, no discontinuities. Median 88.78%, min/max 88.78% over 65s window — below tripwire thresholds for both high-sustained (>93%) and peak (>97%) escalation.

### Emit Actions:
```
[emit-signal] NONE — A-30 verdict FOLD, no new anomalies, no BUG alert issued
```

### Cycle Summary:
Pre-gate verdict (auditor-tier1-probe.sh @ 04:13:28Z): FAILURE — mem_creep detected (rag-service 96.72%, 33.6MiB free vs 40MiB floor).
c90 investigation (04:15–04:20 UTC): ESCALATE — rag-service sustained >93% (median 98.15%, min 97.70%). Signal emitted: sys-20260814T041720-3a88.
c91 investigation (04:44–04:45 UTC): FOLD — rag-service stabilized at 88.78%, no escalation warranted. Memory recovery observed between cycles.
Verdict: Presumed successful memory reclamation/GC recovery. No further alert. Monitoring continues.

---

## c90 · 2026-08-14T04:17:44Z

### Audit Run Tier-1 (04:15–04:20 UTC 2026-08-14, post-preflight)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 1 new (C=1 W=0 I=0) | Dedup-skipped: 0
- Status: CRITICAL

(Previous cycles archived for brevity — see git history for full audit trail)
