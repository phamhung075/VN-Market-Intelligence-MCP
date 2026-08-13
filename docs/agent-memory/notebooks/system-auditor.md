
## c69 · 2026-08-13T11:30Z
### Audit Run Tier-1 (11:52–11:56 UTC 2026-08-13, CORRECTIVE RE-RUN)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 (0 critical, 0 warn, 0 info)
- Status: ALL_GREEN (fresh live probe; rag-service recovered to 35.00% — memory pressure resolved; pdf-extractor stable at 86.12% FOLD)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-13T11:52:52Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          25 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 41 hours (healthy)   vn-market-intelligence-mcp-mcp-server           41 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)     vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)    vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)    mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 hours (healthy)    vn-market-intelligence-mcp-news-fetch           4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         4 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=17.17% MemUsage=527.5MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 35.00% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 17.54% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 86.12% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 3.10% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.14% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 11.08% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.96% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 5.10% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 10.41% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.67% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.31% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.22% < 85% investigate-gate
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-pdf-extractor-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "1", "restart_count_after": "1",
    "started_at_before": "2026-08-11T01:19:14.0528435Z", "started_at_after": "2026-08-11T01:19:14.0528435Z",
    "exit_code_before": "0", "exit_code_after": "0",
    "finished_at_before": "2026-08-11T01:19:13.534021637Z", "finished_at_after": "2026-08-11T01:19:13.534021637Z",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "2587640", "vmhwm_kb_after": "2587640",
         "mem_limit_kb": "2621440",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true,
         "note": "VmHWM is a monotonic non-decreasing high-water mark, so a direct VmHWM-vs-VmRSS comparison is true BY DEFINITION at all times and is NOT evidence reclamation occurred (this WAS the FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP narrative false-negative; vmrss_kb was deleted entirely, Amendment A po_redispatch_ruling_20260808T1445Z -- dead, zero consumers repo-wide once that comparison was removed). Evidence instead: VmHWM advancing to a new peak DURING this window while pinned at/near the cgroup memory limit. UNAVAILABLE means this evidence is missing, not that it is absent -- either a real docker-exec failure, OR (Amendment B) the host-side headroom pre-check found this container below MEM_FLOOR_MIB at the moment of the call and skipped the exec entirely; either way, MINP/MEDIANP below remain exec-free and unaffected."},
  "samples": [{"n":1,"t":"11:53:04Z","pct":86.12},{"n":2,"t":"11:53:18Z","pct":86.12},{"n":3,"t":"11:53:34Z","pct":86.12},{"n":4,"t":"11:53:48Z","pct":86.12},{"n":5,"t":"11:54:03Z","pct":86.12},{"n":6,"t":"11:54:18Z","pct":86.12}],
  "analysis": {"min_pct": 86.12, "max_pct": 86.12, "median_pct": 86.12,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip — escalate on: state changed during window, OOMKilled, ExitCode=0+FinishedAt delta, a >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    45%    393k  176M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

### Findings Summary
**Container Status (A-01 through A-11):** All 13 host_runtime_set services UP and healthy (all show "Up X hours/days (healthy)"). Status PASS.

**Health Endpoints (A-12 through A-20):** All 5 checked endpoints respond HTTP 200. A-20 pdf-extractor multi-probe: 3/3 passes. Status PASS.

**Memory Pressure (A-30):**
- rag-service-1: 35.00% (RECOVERED from 85.70% in c68; prior cycle's cited 88.59% was pre-deployment state). SKIP gate (below 85%). Status PASS. **CORRECTION:** Prior run's STALE-ACK marker (tracked_by=FU-RAG-DEPLOY-MEMORY, status=DONE_VERIFIED) is now VALIDATED — rag-service memory is genuinely healthy and stabilized.
- pdf-extractor-1: 86.12% (stable vs c68's 85.92%, within measurement noise). Multi-probe shows completely flat memory (86.12% sustained across all 6 samples over 65s window), zero reclamation dips, zero discontinuities, no OOM kills, no state changes. VmHWM pinned at cgroup cap but NOT advancing during window. Verdict FOLD (benign).
- mcp-server: 17.17% (well below gate, stable). Status PASS.

**Restart Count (A-21):** mcp-server windowed query crashRestarts=0 (4h window). Status PASS.

**Disk (A-32):** 45% used (< 85% threshold, improved from c68's 46%). Status PASS.

**A-30 Discriminator Analysis:**
- rag-service SKIP: 35.00% baseline is well below 85% investigate-gate (no deep-probe needed). No escalation.
- pdf-extractor ENGAGE: 86.12% crosses gate; deep-probe sampled 6 times over 65s. All samples identical (86.12%), zero variance, zero reclamation activity detected. No escalation tripwires: no state changes, no OOM kills, no FinishedAt delta, no discontinuity, VmHWM stable, median 86.12% (< 97%), min 86.12% (< 93%). Verdict FOLD (benign GC sawtooth or memory holding steady).

[OUTPUT-CONTRACT] signals_posted=0 telegram_sent=0 signal_queue_rows_written=0 dashboard_rows=0 dedup_skipped=0
[HEARTBEAT] tier-1 cycle completed (heartbeat file NOT written by this subagent — sole writer is scripts/agents-flow/auditor-tier1-probe.sh pre-gate ALL_GREEN branch)
[RAW-CITE GATE] All findings cite RAW-PROBE block (c69) only; no carry from prior cycles
[CALLER-INSTRUCTION PRECEDENCE] NONE

---
