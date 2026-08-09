## c10 · 2026-08-09T01:33Z

### Audit Run Tier-1 (01:33–01:34 UTC 2026-08-09)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed | A-20 multiprobe: 3/3 PASS
- Anomalies: 0 emits (1 A-30 rag-service FOLD: 89.55% stable → benign reclamation) | Status: ALL_GREEN
- **rag-service A-30 Memory Pressure Monitoring (CONDITION STABLE):**
  - Baseline: 89.54% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: all 89.55% (min: 89.55%, median: 89.55%, max: 89.55%)
  - **STABLE CONDITION:** Memory remains consistently at 89.55%, a slight decrease from prior c9 91.82% reading
  - State: OOMKilled=false, restarts=0, state_changed=false, started_at=2026-08-08T08:11:45Z (same container uptime as prior cycles)
  - VM: VmHWM pinned at cgroup cap (1568064 KB / 1048576 KB limit) but NOT advancing to new peak; no discontinuities (0 dips, 0 discontinuities)
  - **A-30 Verdict: FOLD** "benign GC sawtooth or below tripwire" — all 6 samples locked at 89.55%, zero reclamation dips, zero discontinuities
  - **DISPOSITION:** Steady-state benign behavior. rag-service memory sustained above 85% gate but shows no crash-cliff indicators (no state change, no OOMKilled, no restart, stable VmHWM not advancing, no discontinuities >40pp). Matches prior STALE-ACK (FIX-RAG-DEPLOY-MEMORY, status=DONE_VERIFIED). Applied fresh A-30 discriminator per AUD-CP-1 (documented spec, not prior cycle's verdict) — measured tripwires (state_changed, OOMKilled, FinishedAt delta, discontinuity, VmHWM advancing, >93% sustained, median >97%) all PASS. No emit (verdict=FOLD → no signal). Memory remains watchful but benign.
- **mcp-server A-30:** Baseline 10.63% < 85% gate → SKIP (healthy)
- **pdf-extractor A-30:** Baseline 64.67% < 85% gate → SKIP (healthy)
- **All other services (11 total):** Healthy (stock-price 2.19%, macro-indicators 1.99%, frontend 8.73%, api-gateway 2.77%, flaresolverr 3.39%, news-fetch 8.45%, technical-analysis 3.40%, alert-engine 2.04%, kinh-dich-service 3.11%)
- A-20 pdf-extractor: 3/3 in-container probes PASS | A-21 mcp-server crashes: 0 PASS | Disk: 47% PASS | A-33 hooks: OK
- CONTRACT-CONTRADICTION: NONE

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-09T01:33:22Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)    vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 14 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        14 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 17 hours (healthy)   vn-market-intelligence-mcp-rag-service          17 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)     vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 10 days (healthy)    vn-market-intelligence-mcp-macro-indicators     10 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=10.47% MemUsage=321.7MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 10.63% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 64.67% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 89.54% >= 85% investigate-gate — ENGAGE deep-probe
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "0", "restart_count_after": "0",
    "started_at_before": "2026-08-08T08:11:45.741666434Z", "started_at_after": "2026-08-08T08:11:45.741666434Z",
    "exit_code_before": "0", "exit_code_after": "0",
    "finished_at_before": "0001-01-01T00:00:00Z", "finished_at_after": "0001-01-01T00:00:00Z",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "1568064", "vmhwm_kb_after": "1568064",
         "mem_limit_kb": "1048576",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true,
         "note": "VmHWM is a monotonic non-decreasing high-water mark, so a direct VmHWM-vs-VmRSS comparison is true BY DEFINITION at all times and is NOT evidence reclamation occurred (this WAS the FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP narrative false-negative; vmrss_kb was deleted entirely, Amendment A po_redispatch_ruling_20260808T1445Z -- dead, zero consumers repo-wide once that comparison was removed). Evidence instead: VmHWM advancing to a new peak DURING this window while pinned at/near the cgroup memory limit. UNAVAILABLE means this evidence is missing, not that it is absent -- either a real docker-exec failure, OR (Amendment B) the host-side headroom pre-check found this container below MEM_FLOOR_MIB at the moment of the call and skipped the exec entirely; either way, MINP/MEDIANP below remain exec-free and unaffected."},
  "samples": [{"n":1,"t":"01:33:34Z","pct":89.55},{"n":2,"t":"01:33:48Z","pct":89.55},{"n":3,"t":"01:34:03Z","pct":89.55},{"n":4,"t":"01:34:18Z","pct":89.55},{"n":5,"t":"01:34:34Z","pct":89.55},{"n":6,"t":"01:34:48Z","pct":89.55}],
  "analysis": {"min_pct": 89.55, "max_pct": 89.55, "median_pct": 89.55,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip — escalate on: state changed during window, OOMKilled, ExitCode=0+FinishedAt delta, a >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.19% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 1.99% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 8.73% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.77% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.39% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.45% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.40% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.04% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.11% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    47%    393k  160M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | VERDICT=ALL_GREEN (rag-service memory stable at 89.55%, no crash-cliff indicators, A-30 discriminator FOLD verdict)


## c9 · 2026-08-09T01:07Z

### Audit Run Tier-1 (01:07–01:08 UTC 2026-08-09)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed | A-20 multiprobe: 3/3 PASS
- Anomalies: 0 emits (1 A-30 rag-service FOLD recovery: 91.82% stable → benign) | Status: ALL_GREEN
- **rag-service A-30 Memory Recovery (CONDITION RESOLVED):**
  - Baseline: 91.82% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: all 91.84% (min: 91.84%, median: 91.84%, max: 91.84%)
  - **RECOVERY SIGNAL:** Memory stabilized from prior c8 peak of 99.50% down to 91.82% — a ~7.7pp recovery in 33 minutes
  - State: OOMKilled=false, restarts=0, state_changed=false, started_at=2026-08-08T08:11:45Z
  - VM: VmHWM pinned at cgroup cap (1568064 KB / 1048576 KB limit) but NOT advancing to new peak; no host-side headroom constraint (Amendment B passed)
  - **A-30 Verdict: FOLD** "benign GC sawtooth or below tripwire" — all 6 samples locked at stable 91.84%, zero reclamation dips (0 dips, 0 discontinuities)
  - **DISPOSITION:** Prior ESCALATE verdict (c8 at 99.50%) has resolved to FOLD at this level. Matches STALE-ACK label (FIX-RAG-DEPLOY-MEMORY, status=DONE_VERIFIED): memory optimization fix is working. No emit (verdict=FOLD → no signal). Memory sustained above 85% gate remains watchful condition but is now benign per discriminator.
- **mcp-server A-30:** Baseline 9.25% < 85% gate → SKIP (healthy)
- **pdf-extractor A-30:** Baseline 64.67% < 85% gate → SKIP (healthy)
- **All other services (11 total):** Healthy (stock-price 2.15%, macro-indicators 1.98%, frontend 8.68%, api-gateway 2.77%, flaresolverr 3.38%, news-fetch 8.42%, technical-analysis 3.38%, alert-engine 2.02%, kinh-dich-service 3.08%)
- A-20 pdf-extractor: 3/3 in-container probes PASS | A-21 mcp-server crashes: 0 PASS | Disk: 47% PASS | A-33 hooks: OK
- CONTRACT-CONTRADICTION: NONE

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | VERDICT=ALL_GREEN (rag-service memory condition resolved to benign stable state; no escalation, no new BUG alert)
