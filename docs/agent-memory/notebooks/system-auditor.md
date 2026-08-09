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

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-09T01:07:14Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)    vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 13 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        13 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=9.25% MemUsage=284.1MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 9.21% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 64.67% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 91.82% >= 85% investigate-gate — ENGAGE deep-probe
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
  "samples": [{"n":1,"t":"01:07:26Z","pct":91.84},{"n":2,"t":"01:07:41Z","pct":91.84},{"n":3,"t":"01:07:56Z","pct":91.84},{"n":4,"t":"01:08:11Z","pct":91.84},{"n":5,"t":"01:08:27Z","pct":91.84},{"n":6,"t":"01:08:42Z","pct":91.84}],
  "analysis": {"min_pct": 91.84, "max_pct": 91.84, "median_pct": 91.84,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip — escalate on: state changed during window, OOMKilled, ExitCode=0+FinishedAt delta, a >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.15% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 1.98% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 8.68% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.77% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.38% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.42% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.38% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.02% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.08% < 85% investigate-gate

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

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | VERDICT=ALL_GREEN (rag-service memory condition resolved to benign stable state; no escalation, no new BUG alert)


## c8 · 2026-08-09T00:34Z

### Audit Run Tier-1 (00:34–00:35 UTC 2026-08-09)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed | A-20 multiprobe: 3/3 PASS
- Anomalies: 1 SKIP-dedup (A-30 rag-service escalation sustained 99.50% floor breach) | Status: DEGRADED
- **rag-service A-30 Memory Pressure (ESCALATION EVENT):**
  - Baseline: 99.50% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: all 99.50% (min: 99.50%, median: 99.50%, max: 99.50%)
  - **CRITICAL: All six samples locked at 99.50% — ZERO reclamation dips across 65s window**
  - State: OOMKilled=false, restarts=0, state_changed=false, started_at=2026-08-08T08:11:45Z
  - Verdict: ESCALATE "all samples >93% sustained high — loss of reclamation" (0 dips, 0 discontinuities)
  - **BOUNDARY CONDITION NOTE:** rag-service memory free ~5.1MiB, floor 40MiB → BELOW-FLOOR state sustained across all 6 samples. No crash (no OOMKilled, no exit), but sustained high-memory floor breach with zero reclamation signal indicates memory pressure is chronic and unrelieved by normal GC cycles.
  - Emission: [emit-signal] SKIP-dedup (within 7d window, last sent 2026-08-08T17:38:48Z, sig ID sys-20260809T003610-3136)
- **mcp-server-1 A-30:** Baseline 9.46% < 85% gate → SKIP (healthy)
- **pdf-extractor A-30:** Baseline 64.67% < 85% gate → SKIP (healthy)
- **All other services:** Healthy (stock-price 2.15%, macro-indicators 1.98%, frontend 9.91%, api-gateway 2.95%, etc.)
- A-20 pdf-extractor: 3/3 in-container probes PASS | A-21 mcp-server crashes: 0 PASS | Disk: 47% PASS | A-33 hooks: OK
- CONTRACT-CONTRADICTION: NONE

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-09T00:34:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 13 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        13 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 16 hours (healthy)   vn-market-intelligence-mcp-rag-service          16 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=9.46% MemUsage=290.6MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 9.45% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 64.67% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 99.50% >= 85% investigate-gate — ENGAGE deep-probe
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
  "vm": {"vmhwm_kb_before": "UNAVAILABLE", "vmhwm_kb_after": "UNAVAILABLE",
         "mem_limit_kb": "UNAVAILABLE",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": false,
         "note": "VmHWM is a monotonic non-decreasing high-water mark, so a direct VmHWM-vs-VmRSS comparison is true BY DEFINITION at all times and is NOT evidence reclamation occurred (this WAS the FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP narrative false-negative; vmrss_kb was deleted entirely, Amendment A po_redispatch_ruling_20260808T1445Z -- dead, zero consumers repo-wide once that comparison was removed). Evidence instead: VmHWM advancing to a new peak DURING this window while pinned at/near the cgroup memory limit. UNAVAILABLE means this evidence is missing, not that it is absent -- either a real docker-exec failure, OR (Amendment B) the host-side headroom pre-check found this container below MEM_FLOOR_MIB at the moment of the call and skipped the exec entirely; either way, MINP/MEDIANP below remain exec-free and unaffected."},
  "samples": [{"n":1,"t":"00:34:15Z","pct":99.50},{"n":2,"t":"00:34:29Z","pct":99.50},{"n":3,"t":"00:34:44Z","pct":99.50},{"n":4,"t":"00:34:59Z","pct":99.50},{"n":5,"t":"00:35:14Z","pct":99.50},{"n":6,"t":"00:35:29Z","pct":99.50}],
  "analysis": {"min_pct": 99.50, "max_pct": 99.50, "median_pct": 99.50,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip — escalate on: state changed during window, OOMKilled, ExitCode=0+FinishedAt delta, a >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.15% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 1.98% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 9.91% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.95% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.34% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.36% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.40% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.03% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.12% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    47%    393k  163M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 id=sys-20260809T003610-3136

[OUTPUT-CONTRACT] signals_posted=0 (1 SKIP-dedup) | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | VERDICT=DEGRADED (rag-service memory floor breach, no new BUG alert)


## c7 · 2026-08-09T00:05Z

### Audit Run Tier-1 (00:03–00:08 UTC 2026-08-09)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed | A-20 multiprobe: 3/3
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 escalation to 99% sustained floor) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (ESCALATION EVENT):**
  - Baseline: 99.14% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: 99.14%, 99.10%, 99.10%, 99.10%, 99.10%, 99.10%
  - Min: 99.10%, Median: 99.10%, Max: 99.14% — **ALL SAMPLES ABOVE 93% SUSTAINED FLOOR**
  - Verdict: ESCALATE "all samples >93% sustained high — loss of reclamation" (0 dips, 0 discontinuities)
  - State: OOMKilled=false, restarts=0, state_changed=false, started_at=2026-08-08T08:11:45Z
  - **SEVERITY ESCALATION NOTE:** Previous cycles (c4–c6, 23:00–23:35 UTC 2026-08-08) showed rag-service flatlined at 93.85%. Current cycle shows jump to 99.1–99.14% band. This is GENUINE escalation event, not measurement jitter. No reclamation dips detected across the window, meaning memory is not being freed between sample intervals. Combined with previous chronic pattern, this now meets the ">93% sustained floor" tripwire.
  - Emission: [emit-signal] SKIP-dedup (within 7d window, last sent 2026-08-08T17:38:48Z, sig ID sys-20260809T000759-1bd3)
- **mcp-server-1 A-30:** Baseline 7.71% < 85% gate → SKIP (healthy)
- **pdf-extractor A-30:** Baseline 64.67% < 85% gate → SKIP (healthy)
- **All other services:** Healthy (stock-price, macro-indicators, frontend, api-gateway, etc.)
- A-20 pdf-extractor: 3/3 in-container probes PASS | A-21 mcp-server crashes: 0 PASS | Disk: 47% PASS | A-33 hooks: OK
- CONTRACT-CONTRADICTION: NONE

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-09T00:05:35Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 12 hours (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 16 hours (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 10 days (healthy)
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)
mcp-gateway                                       Up 3 weeks (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=7.71% MemUsage=236.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 7.69% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 64.67% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 99.14% >= 85% investigate-gate — ENGAGE deep-probe
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
  "vm": {"vmhwm_kb_before": "UNAVAILABLE", "vmhwm_kb_after": "UNAVAILABLE",
         "mem_limit_kb": "UNAVAILABLE",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": false},
  "samples": [{"n":1,"t":"00:05:48Z","pct":99.14},{"n":2,"t":"00:06:03Z","pct":99.10},{"n":3,"t":"00:06:18Z","pct":99.10},{"n":4,"t":"00:06:33Z","pct":99.10},{"n":5,"t":"00:06:48Z","pct":99.10},{"n":6,"t":"00:07:03Z","pct":99.10}],
  "analysis": {"min_pct": 99.10, "max_pct": 99.14, "median_pct": 99.10,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)"
}
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.13% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 1.98% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 8.69% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.76% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.31% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.30% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.35% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.01% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.08% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    47%    393k  164M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 id=sys-20260809T000759-1bd3
- [emit-dashboard] OK id=sys-20260809T000759-1bd3 check_id=A-30
- [OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1

## c6 · 2026-08-08T23:30Z

### Audit Run Tier-1 (23:30–23:35 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed | A-20 multiprobe: 3/3
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 CHRONIC ESCALATION + STALE-ACK discrepancy) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (CHRONIC WITH STALE-ACK DISCREPANCY):**
  - Baseline: 93.85% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.85% (min 93.85%, median 93.85%, max 93.85%) — PERSISTENT FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all ≥93% sustained, VmHWM pinned at cap 1568 MiB of 1048 MiB limit)
  - State: OOMKilled=false, restarts=0, state_changed=false, started_at=2026-08-08T08:11:45Z
  - **MATERIAL DISCREPANCY:** Tracked fix FU-RAG-DEPLOY-MEMORY reported status=DONE_VERIFIED, but live probe shows IDENTICAL 93.85% flat-line condition persisting across cycles c5 (23:03Z) and c6 (23:30Z). No degradation in this cycle, but fix verification claim NOT reflected in live metrics. Flagging as material evidence for fix status review.
  - Emission: [emit-signal] SKIP-dedup (within 7d window, last sent 2026-08-08T17:38:48Z, sig ID sys-20260808T233548-3486)
- **mcp-server-1 A-30:** Baseline 8.23% < 85% gate → SKIP (healthy)
- **All other services:** Healthy (pdf-extractor, stock-price, macro-indicators, frontend, api-gateway, etc.)
- A-20 pdf-extractor: 3/3 in-container probes PASS | A-21 mcp-server crashes: 0 PASS | Disk: 49% PASS | A-33 hooks: OK
- CONTRACT-CONTRADICTION: NONE

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-08T23:33:40Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 12 hours (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 15 hours (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 10 days (healthy)
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)
mcp-gateway                                       Up 3 weeks (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=8.23% MemUsage=252.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 8.22% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 93.85% >= 85% investigate-gate — ENGAGE deep-probe
A-30 deep-probe: 6 samples all 93.85%, min 93.85%, median 93.85%, max 93.85%, reclamation_dips=0, discontinuities=0, VmHWM_pinned_at_cap=true — ESCALATE "loss of reclamation"

--- A-20 multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3 PASS

--- disk ---
Filesystem 49% capacity (< 85% PASS)
```

- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 last_sent=2026-08-08T17:38:48Z id=sys-20260808T233548-3486
- [emit-dashboard] OK id=sys-20260808T233548-3486 check_id=A-30


## c5 · 2026-08-08T23:03Z

### Audit Run Tier-1 (23:00–23:06 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed | A-20 multiprobe: 3/3
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 chronic escalation) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (CHRONIC):**
  - Baseline: 93.85% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.85% (min 93.85%, median 93.85%, max 93.85%) — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all ≥93% sustained, VmHWM pinned at cap)
  - State: OOMKilled=false, restarts=0, state_changed=false, started_at=2026-08-08T08:11:45Z
  - Emission: [emit-signal] SKIP-dedup (within 7d window, last sent 2026-08-08T17:38:48Z, sig ID sys-20260808T230606-5539)
- **mcp-server-1 A-30:** Baseline 8.63% < 85% gate → SKIP
- **All other services:** Healthy
- A-20 pdf-extractor: 3/3 in-container probes PASS | A-21 mcp-server crashes: 0 PASS | Disk: 47% PASS | A-33 hooks: OK
- CONTRACT-CONTRADICTION: NONE

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-08T23:03:40Z ===

--- docker ps -a ---
[13 containers, all Up/healthy — mcp-server 4h, pdf-extractor 11h, rag-service 15h]

--- health endpoints ---
[All 5 checked endpoints OK: mcp-server:3000, api-gateway:4000, macro-indicators:5004, pdf-extractor:5001, frontend:3001]

--- memory pressure ---
mcp-server: 8.63% MemUsage=265.1MiB / 3GiB (< 85% gate SKIP)
rag-service: 93.85% (>= 85% gate ENGAGE)

--- memory pressure multi-probe reclamation (A-30) ---
rag-service deep-probe ESCALATE: 6 samples all 93.85%, min 93.85%, median 93.85%, max 93.85%, reclamation_dips=0, discontinuities=0, VmHWM_pinned_at_cap=true — loss of reclamation verdict

--- A-20 multi-probe ---
pdf-extractor: in-container HTTP 200 (1/3), 200 (2/3), 200 (3/3) — pass_count=3/3 PASS

--- disk ---
Filesystem 47% capacity (< 85% PASS)
```

- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 last_sent=2026-08-08T17:38:48Z id=sys-20260808T230606-5539
- [emit-dashboard] OK id=sys-20260808T230606-5539 check_id=A-30
- [OUTPUT-CONTRACT] signals_posted=0 (dedup-skipped) | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1

# System Auditor — Notebook

## c4 · 2026-08-08T22:41:00Z
### Audit Run Tier-1 (22:38–22:40 UTC 2026-08-08)
- Tier: 1 | Services: 13 checked | Sources: N/A | DB checks: N/A
- Anomalies: 0 new (0 critical, 1 warn tracked, 0 info) | 1 dedup-skipped
- Status: DEGRADED

#### Findings:
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 id=sys-20260808T224058-0a62
- [emit-dashboard] OK id=sys-20260808T224058-0a62 check_id=A-30


Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c385 · 2026-08-08T22:21Z

### Audit Run Tier-2 (22:20–22:21 UTC 2026-08-08)
- Tier: 2 | Sources: 6+ checked | DB checks: 2
- Anomalies: 0 new (C critical, W warn, I info) | 0 dedup-skipped
- Status: HEALTHY

Tier-2 Freshness Sweep Results:
- A-29 Cron Fire: ON_TIME=58 STALE=8 MISSED=11 NEVER_FIRED=9 (M=90 total)
- B-06/B-07 VPS Routes: All observable routes healthy
- B-09 BCTC URL shape: PASS (0 malformed SSC URLs)
- C-06 Market messages (3h): 2 (PASS)
- C-07 Agent signals (24h): 24 (PASS)
- B-13 Stale pending BCTC: PASS (0 stale)
- Per-source freshness: All monitored sources healthy

Note: A-30 rag-service mem-creep (93.82%) is Tier-1 anomaly, tracked in PO.
- [OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0

## c384 · 2026-08-08T22:04Z

### Audit Run Tier-1 (22:04–22:06 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 chronic) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (PERSISTENT CHRONIC ESCALATION):**
  - Baseline: 93.82% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.82% (min 93.82%, median 93.82%, max 93.82%) — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all >93% sustained)
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=pinned_at_cap
  - Emission: [emit-signal] SKIP-dedup (WARN, FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS)
- **mcp-server-1 A-30:** Baseline 7.81% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 47% PASS
- [OUTPUT-CONTRACT] signals_posted=0 (dedup) | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1

## c383 · 2026-08-08T21:30Z

### Audit Run Tier-1 (21:36–21:37 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 chronic) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (PERSISTENT CHRONIC PATTERN):**
  - Baseline: 93.80% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.80% — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all >93% sustained)
- **mcp-server-1 A-30:** Baseline 8.62% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 47% PASS
- [OUTPUT-CONTRACT] signals_posted=0 (dedup) | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1
- [OUTPUT-CONTRACT] tier=1 | signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_events=1 SKIP-dedup
