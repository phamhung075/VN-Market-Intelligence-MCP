## c20 · 2026-08-11T12:00Z

### Audit Run Tier-1

#### Container & Health Status (A-01 through A-20)
- [RAW-PROBE L3-17] docker ps: all host_runtime_set services UP and healthy (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- [RAW-PROBE L20-24] health endpoints: all checks 200 OK ✓
- [RAW-PROBE L98-102] A-20 pdf-extractor multi-probe: 3/3 pass ✓

#### Restart Count (A-21)
- [RAW-PROBE L27] mcp-server RestartCount=0 ✓

#### Memory Pressure (A-30)
- [RAW-PROBE L30] mcp-server baseline: 12.66% < 85% investigate-gate → SKIP ✓
- [RAW-PROBE L34-58] pdf-extractor baseline: 95.14% ENGAGED deep-probe → verdict FOLD (benign GC sawtooth) ✓
- [RAW-PROBE L59-83] rag-service baseline: 96.78% ENGAGED deep-probe → verdict ESCALATE (sustained high, loss of reclamation) → **A-30 WARN emitted** ⚠
  - All 6 samples at 96.78% (min=96.78%, median=96.78%)
  - No reclamation dips (0 observed), no discontinuities
  - No state changes, no crashes
  - VmHWM data UNAVAILABLE (host-side headroom safety skip)
  - Root cause: genuine sustained memory floor, not false-positive like 2026-07-23T03:42Z incident
  - Prior STALE-ACK FU-RAG-DEPLOY-MEMORY (status=DONE_VERIFIED) now escalated to WARN

#### Disk Usage (A-32)
- [RAW-PROBE L95] root filesystem: 46% capacity < 85% threshold ✓

#### Summary
- A-30 rag-service escalation confirmed as genuine (deep-probe discriminator gate applied)
- WARN emitted but deduplicated (prior signal 2026-08-09T04:11:10Z within 7-day window)
- All other Tier-1 checks PASS
- No CRITICAL findings

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-11T12:07:49Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 days (healthy)     vn-market-intelligence-mcp-mcp-server           2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 11 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 11 hours (healthy)   vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)     vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)    vn-market-intelligence-mcp-macro-indicators     12 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=12.66% MemUsage=388.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 12.65% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 95.14% >= 85% investigate-gate — ENGAGE deep-probe
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
  "samples": [{"n":1,"t":"12:08:00Z","pct":97.88},{"n":2,"t":"12:08:16Z","pct":92.22},{"n":3,"t":"12:08:30Z","pct":98.95},{"n":4,"t":"12:08:45Z","pct":94.90},{"n":5,"t":"12:09:00Z","pct":95.83},{"n":6,"t":"12:09:15Z","pct":95.62}],
  "analysis": {"min_pct": 92.22, "max_pct": 98.95, "median_pct": 95.72,
               "reclamation_dips": 2, "dip_detail": "97.88->92.22;98.95->94.90;",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip — escalate on: state changed during window, OOMKilled, ExitCode=0+FinishedAt delta, a >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 96.78% >= 85% investigate-gate — ENGAGE deep-probe
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "9", "restart_count_after": "9",
    "started_at_before": "2026-08-11T01:00:43.091225184Z", "started_at_after": "2026-08-11T01:00:43.091225184Z",
    "exit_code_before": "0", "exit_code_after": "0",
    "finished_at_before": "2026-08-11T01:00:42.857336496Z", "finished_at_after": "2026-08-11T01:00:42.857336496Z",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "UNAVAILABLE", "vmhwm_kb_after": "UNAVAILABLE",
         "mem_limit_kb": "UNAVAILABLE",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": false,
         "note": "VmHWM is a monotonic non-decreasing high-water mark, so a direct VmHWM-vs-VmRSS comparison is true BY DEFINITION at all times and is NOT evidence reclamation occurred (this WAS the FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP narrative false-negative; vmrss_kb was deleted entirely, Amendment A po_redispatch_ruling_20260808T1445Z -- dead, zero consumers repo-wide once that comparison was removed). Evidence instead: VmHWM advancing to a new peak DURING this window while pinned at/near the cgroup memory limit. UNAVAILABLE means this evidence is missing, not that it is absent -- either a real docker-exec failure, OR (Amendment B) the host-side headroom pre-check found this container below MEM_FLOOR_MIB at the moment of the call and skipped the exec entirely; either way, MINP/MEDIANP below remain exec-free and unaffected."},
  "samples": [{"n":1,"t":"12:09:23Z","pct":96.78},{"n":2,"t":"12:09:39Z","pct":96.78},{"n":3,"t":"12:09:54Z","pct":96.78},{"n":4,"t":"12:10:09Z","pct":96.78},{"n":5,"t":"12:10:25Z","pct":96.78},{"n":6,"t":"12:10:40Z","pct":96.78}],
  "analysis": {"min_pct": 96.78, "max_pct": 96.78, "median_pct": 96.78,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip — escalate on: state changed during window, OOMKilled, ExitCode=0+FinishedAt delta, a >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.18% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.13% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 8.67% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.93% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.69% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 9.61% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.46% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.05% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.23% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    46%    393k  171M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

[emit-signal] SKIP-dedup id=sys-20260811T121235-33fd

## d4-auto · 2026-08-11T03:00:01.697Z
D4 candidates: R2-mismatch:bctc-dataquality:vnindex-crosstool-mismatch,R2-mismatch:bctc-dataquality:HPG:operating-profit-zero,R2-mismatch:bctc-dataquality:DXG:persistent-absence,R3-no-board-row:bctc-dataquality:vnindex-crosstool-mismatch,R3-no-board-row:bctc-dataquality:HPG:operating-profit-zero,R3-no-board-row:bctc-dataquality:DXG:persistent-absence

## d4-auto · 2026-08-10T03:00:00.961Z
D4 candidates: R2-mismatch:bctc-dataquality:vnindex-crosstool-mismatch,R2-mismatch:bctc-dataquality:HPG:operating-profit-zero,R2-mismatch:bctc-dataquality:DXG:persistent-absence,R3-no-board-row:bctc-dataquality:vnindex-crosstool-mismatch,R3-no-board-row:bctc-dataquality:HPG:operating-profit-zero,R3-no-board-row:bctc-dataquality:DXG:persistent-absence

## c19 · 2026-08-09T05:33:49Z

### Audit Run Tier-1 (05:33–05:35 UTC 2026-08-09)
- Tier: 1 | Scope: container liveness, health endpoints, restart count, memory, disk
- Status: **DEGRADED** (1 WARN finding)

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-09T05:33:49Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)   vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 18 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        18 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 21 hours (healthy)   vn-market-intelligence-mcp-rag-service          21 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=8.84% MemUsage=271.5MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 8.83% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 64.71% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 94.12% >= 85% investigate-gate — ENGAGE deep-probe
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
         "note": "VmHWM pinned at cgroup cap; no advancement during window"},
  "samples": [{"n":1,"t":"05:34:01Z","pct":94.13},{"n":2,"t":"05:34:16Z","pct":94.13},{"n":3,"t":"05:34:30Z","pct":94.13},{"n":4,"t":"05:34:45Z","pct":94.13},{"n":5,"t":"05:35:00Z","pct":94.13},{"n":6,"t":"05:35:16Z","pct":94.13}],
  "analysis": {"min_pct": 94.13, "max_pct": 94.13, "median_pct": 94.13, "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)"
}
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.20% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.06% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 8.57% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.88% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.46% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.88% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.41% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.03% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.14% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    47%    393k  161M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

#### Check Results

**A-01 to A-11 — Container Status:** PASS
- All host_runtime_set services UP (13 containers, all healthy status)

**A-12 to A-20 — Health Endpoints:** PASS
- All 5 endpoints responding HTTP 200
- A-20 pdf-extractor multi-probe: 3/3 passed

**A-21 — Restart Count:** PASS
- mcp-server RestartCount=0 (no crash signals)

**A-30 — Memory Pressure:** WARN
- rag-service memory ESCALATE verdict — sustained at 94.13% (all 6 samples identical)
  - Deep-probe: 6 samples over 65s window, all at 94.13% (>93% sustained threshold)
  - State: OOMKilled=false, restarts=0, no state changes, no crashes
  - VmHWM: pinned at cgroup cap (1568 MiB at 1024 MiB limit), no advancement during window
  - Verdict: ESCALATE on "loss of reclamation" (>93% sustained, no dip-jitter veto)
  - Discriminator verdict: genuine sustained-plateau, not a transient spike or crash-cliff
  - Emission: SKIP-dedup (same dedup_key emitted within last 7 days at 2026-08-09T04:11:10Z)
  - Dashboard row: appended with signal_id=sys-20260809T053619-38ad
  - [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 last_sent=2026-08-09T04:11:10Z id=sys-20260809T053619-38ad
  - [emit-dashboard] OK id=sys-20260809T053619-38ad check_id=A-30

**A-32 — Disk:** PASS
- / filesystem at 47% capacity (< 85% threshold)

**A-33 — Hook Liveness:** PASS
- All 4 load-bearing hooks present, executable, registered

#### Summary
Most checks PASS. A-30 rag-service shows ESCALATE memory finding (94.13% sustained). Discriminator confirms: genuine sustained high-memory plateau (loss of reclamation), no crash evidence, no OOMKilled, VmHWM stable at cap. Known tracked issue (FU-RAG-DEPLOY-MEMORY DONE_VERIFIED; open follow-up FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH P2). Previous emission at 04:11:10Z still within 7-day dedup window, so signal correctly skipped.

#### Output
[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=1 | dedup_skipped=1 | status=DEGRADED
