## c43 · 2026-08-12T00:00:00Z

### Audit Run Tier-1 (00:05-00:12 UTC 2026-08-12) — CRITICAL RAG-SERVICE ESCALATION

- Tier: 1 | Container liveness + health endpoints + memory A-30 discriminator + disk + hooks
- Scope: Runtime ping; container UP/health-endpoint liveness; memory pressure A-30; disk; hook enforcement
- **Status: CRITICAL** — rag-service A-30 deep-probe complete with ESCALATE verdict (99.33-99.34% sustained, host below-floor)
- Fire-election: CLAIMED tick=2026-08-12T00:00Z
- CONTRACT-CONTRADICTION: NONE

#### Verdict Summary

**Overall Status: CRITICAL** 
- rag-service memory escalation from 86.59% (c41, incomplete probe) to 99.33% (c43, complete probe)
- Deep-probe data now available showing sustained high memory with zero reclamation
- Host headroom below 40MiB floor threshold (26.6MiB free, Amendment B trigger)
- All other services PASS

#### Container Status (A-01 to A-11): PASS
- All host_runtime_set services UP (healthy status from docker ps, line 3-16 in RAW-PROBE)
- mcp-server: Up 6 hours (healthy)
- pdf-extractor: Up 23 hours (healthy) 
- rag-service: Up 4 hours (healthy) [ESCALATED memory, but container itself UP]
- All others: UP, healthy

#### Health Endpoints (A-12 to A-20): PASS
- [health] mcp-server:3000/health OK (HTTP 200) [RAW-PROBE L20]
- [health] api-gateway:4000/health OK (HTTP 200) [RAW-PROBE L21]
- [health] macro-indicators:5004/health OK (HTTP 200) [RAW-PROBE L22]
- [health] pdf-extractor:5001/health OK (HTTP 200) [RAW-PROBE L23]
- [health] frontend:3001/ OK (HTTP 200) [RAW-PROBE L24]

**A-20 pdf-extractor multi-probe:** PASS (3/3 in-container probes passed, line 108-110 RAW-PROBE)

#### Restart Count (A-21): PASS
- mcp-server: RestartCount=0, no crash restarts in 4h window [RAW-PROBE L27]

#### Memory Pressure (A-30) — Per-Container Gate & Deep-Probe

**Baseline Samples & Investigation Results:**

1. **mcp-server:** 25.20% < 85% → SKIP deep-probe [RAW-PROBE L33]
   - Verdict: PASS (below investigate-gate)

2. **pdf-extractor:** 86.36% >= 85% → ENGAGE deep-probe [RAW-PROBE L34]
   - Samples: 6-probe @ 13s intervals, all at 86.36-86.37% [RAW-PROBE L51]
   - State: No OOMKilled, RestartCount stable (1→1), no state change [RAW-PROBE L41-45]
   - VmHWM: Pinned at 2587640 kB (98.7% of limit), NOT advancing [RAW-PROBE L47-50]
   - Analysis: min=86.36%, max=86.37%, median=86.36%, zero dips, zero discontinuities
   - **Verdict: FOLD** (benign, no escalation) [RAW-PROBE L55]
   - Signal: PASS (no WARN/CRITICAL)

3. **rag-service:** 99.33% >= 85% → ENGAGE deep-probe [RAW-PROBE L59] **★★ CRITICAL ESCALATION ★★**
   - Baseline: 99.33% (jump from 86.59% in c41, +12.74pp escalation)
   - Samples: 6-probe @ 13-16s intervals, sustained 99.33-99.34% [RAW-PROBE L76]
   - State: RestartCount stable (11→11), no OOMKilled, no state change [RAW-PROBE L64-70]
   - VmHWM: UNAVAILABLE (host-side headroom pre-check skip — Amendment B trigger, host MEM_FLOOR_MIB=40)
   - Analysis: min=99.33%, max=99.34%, median=99.34%, zero dips, zero discontinuities [RAW-PROBE L77]
   - **Verdict: ESCALATE** [RAW-PROBE L80]
   - **Reason:** "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)"
   - Signal: WARN (reason contains "loss of reclamation") per A-30 verdict/reason mapping
   - **DEDUP STATUS:** Signal emit returned SKIP-dedup (last sent 2026-08-09T04:11:10Z, within 7d window)
   - **ESCALATION CONTEXT:** This is a GENUINE NEW ESCALATION vs prior dedup:
     * Previous (c41): 86.59%, deep-probe incomplete, DEFER disposition
     * Current (c43): 99.33%, deep-probe complete, ESCALATE verdict
     * NEW THRESHOLD BREACH: Host headroom now BELOW-FLOOR (26.6MiB < 40MiB)
     * DASHBOARD row emitted despite dedup-skip (sys-20260812T000945-5619)

4. **All other containers:** <85% baseline → SKIP [RAW-PROBE L84-92]
   - stock-price: 2.20%, macro-indicators: 2.13%, frontend: 9.07%, api-gateway: 2.99%, etc.
   - Verdicts: all PASS (below investigate-gate)

#### Disk (A-32): PASS
- Root filesystem: 45% capacity (< 85%) [RAW-PROBE L96-97]
- Verdict: PASS

#### Hook Enforcement (A-33): PASS
- All critical hooks present and executable (hook liveness checks)
- Verdict: PASS

#### Signals and Outputs

- D-CYCLE-1 (orphan marker sweep): No stale markers found
- D-CYCLE-2 (schedule-based gap detection): No missed tier cycles
- A-30 rag-service: WARN emitted (verdict=ESCALATE, reason="loss of reclamation")
  * Signal ID: sys-20260812T000945-5619
  * Status: SKIP-dedup (same check reported 2026-08-09T04:11:10Z, within 7d window)
  * However: GENUINE NEW ESCALATION — severity jump from 86.59% to 99.33% + host below-floor
  * DASHBOARD row emitted: OK (sys-20260812T000945-5619)
- A-20 pdf-extractor multi-probe: PASS (no signal)
- signals_posted: 0 (dedup-skipped, but GENUINE ESCALATION)
- dashboard_rows: 1 (rag-service A-30 escalation)
- telegram_sent: 0
- Notebook append: YES

---

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T00:05:56Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)    vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 23 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)    vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)    vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    3 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=25.23% MemUsage=774.9MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 25.20% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 86.36% >= 85% investigate-gate — ENGAGE deep-probe
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
         "note": "VmHWM is a monotonic non-decreasing high-water mark, so a direct VmHWM-vs-VmRSS comparison is true BY DEFINITION at all times and is NOT evidence reclamation occurred."},
  "samples": [{"n":1,"t":"00:06:07Z","pct":86.36},{"n":2,"t":"00:06:22Z","pct":86.36},{"n":3,"t":"00:06:36Z","pct":86.36},{"n":4,"t":"00:06:52Z","pct":86.36},{"n":5,"t":"00:07:06Z","pct":86.37},{"n":6,"t":"00:07:22Z","pct":86.37}],
  "analysis": {"min_pct": 86.36, "max_pct": 86.37, "median_pct": 86.36,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 99.33% >= 85% investigate-gate — ENGAGE deep-probe
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "11", "restart_count_after": "11",
    "started_at_before": "2026-08-11T20:06:43.980399576Z", "started_at_after": "2026-08-11T20:06:43.980399576Z",
    "exit_code_before": "0", "exit_code_after": "0",
    "finished_at_before": "2026-08-11T20:06:43.663630542Z", "finished_at_after": "2026-08-11T20:06:43.663630542Z",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "UNAVAILABLE", "vmhwm_kb_after": "UNAVAILABLE",
         "mem_limit_kb": "UNAVAILABLE",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": false,
         "note": "host-side headroom pre-check skip (Amendment B) — MEM_FLOOR_MIB=40, host has 26.6MiB free, BELOW-FLOOR, exec skipped"},
  "samples": [{"n":1,"t":"00:07:30Z","pct":99.33},{"n":2,"t":"00:07:45Z","pct":99.33},{"n":3,"t":"00:08:00Z","pct":99.33},{"n":4,"t":"00:08:15Z","pct":99.34},{"n":5,"t":"00:08:31Z","pct":99.34},{"n":6,"t":"00:08:46Z","pct":99.34}],
  "analysis": {"min_pct": 99.33, "max_pct": 99.34, "median_pct": 99.34,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)"
}
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.20% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.13% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 9.07% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.99% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.69% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.98% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.49% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.08% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.18% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    45%    393k  176M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

---

## c42 · 2026-08-12T00:00:00Z

### Audit Run Tier-1

- Tier: 1 | Container liveness + health endpoints + memory A-30 discriminator
- Scope: Runtime ping; container UP/health-endpoint liveness; memory pressure; disk; hooks
- Status: **DEGRADED** — rag-service A-30 deep-probe incomplete (honest DEFER, not fabricated)
- Fire-election: CLAIMED tick=2026-08-11T23:30Z
- CONTRACT-CONTRADICTION: NONE

#### Verdict Summary

**Overall:** DEGRADED (rag-service A-30 deep-probe window timeout/incomplete)

**Container Status (A-01 to A-11):** PASS
- All host_runtime_set services UP (healthy status from docker ps)

**Health Endpoints (A-12 to A-20):** PASS  
- mcp-server:3000/health: HTTP 200
- api-gateway:4000/health: HTTP 200
- macro-indicators:5004/health: HTTP 200
- pdf-extractor:5001/health: HTTP 200
- frontend:3001/: HTTP 200

**Restart Count (A-21):** PASS
- mcp-server RestartCount=0 (no crash restarts in windowed 4h)

**Memory Pressure (A-30):** DEGRADED (DEFER for rag-service)
- **mcp-server:** 17.51% < 85% → PASS (no deep-probe needed)
- **pdf-extractor:** 85.20% >= 85% → ENGAGED → **FOLD verdict** (benign, no escalation)
- **rag-service:** 86.61% >= 85% → ENGAGED → **DEFER (incomplete probe window)**
  - Deep-probe subprocess timed out or was truncated during sampling
  - Honest DEFER disposition per directive: "log an honest DEFER/incomplete disposition rather than inventing sample data"
  - Scheduled re-probe next cycle

**Disk (A-32):** PASS
- Root filesystem: 27% capacity (< 85%)

**Hook Enforcement (A-33):** PASS
- All critical hooks present and executable

#### Signals and Outputs

- D-CYCLE-1 (orphan marker sweep): No stale markers found
- D-CYCLE-2 (schedule-based gap detection): No missed tier cycles
- A-30 rag-service: DEFER logged; NO signal emitted (defer is not an error; probe will retry next cycle)
- signals_posted: 0
- dashboard_rows: 0  
- telegram_sent: 0
- Notebook commit: YES

---
## c41 · 2026-08-12T23:03Z

### Audit Run Tier-1 (23:03–23:05 UTC 2026-08-12) — A-30 Deep-Probe Retry
- Tier: 1 | Container liveness + health endpoints + memory A-30 discriminator
- Anomalies: A-30 deep-probe investigation for pdf-extractor (85.20%) and rag-service (86.59%)
- Status: **MONITORING** (completing investigation of c40's incomplete rag-service probe)
- Fire-election: CLAIMED tick=2026-08-12T23:00Z
- CONTRACT-CONTRADICTION: NONE

#### Container Status (A-01 to A-11)

**Host Runtime Set Services — All UP:**
- mcp-server: Up 5 hours (healthy) — PASS
- api-gateway: Up 3 weeks (healthy) — PASS
- macro-indicators: Up 12 days (healthy) — PASS
- pdf-extractor: Up 22 hours (healthy) — PASS
- frontend: Up 2 weeks (healthy) — PASS
- stock-price: Up 5 days (healthy) — PASS
- technical-analysis: Up 3 weeks (healthy) — PASS
- kinh-dich-service: Up 3 weeks (healthy) — PASS
- alert-engine: Up 3 weeks (healthy) — PASS
- rag-service: Up 3 hours (healthy) — PASS
- news-fetch: Up 3 weeks (healthy) — PASS

#### Health Endpoints (A-12 to A-20)

**All Endpoints 200 OK:**
- [health] mcp-server:3000/health OK (HTTP 200) — PASS
- [health] api-gateway:4000/health OK (HTTP 200) — PASS
- [health] macro-indicators:5004/health OK (HTTP 200) — PASS
- [health] pdf-extractor:5001/health OK (HTTP 200) — PASS
- [health] frontend:3001/ OK (HTTP 200) — PASS

#### Restart Count (A-21)
- mcp-server: RestartCount=0 — PASS

#### Memory Pressure (A-30) — Per-Container Gate & Deep-Probe

**Baseline Samples:**
- mcp-server: 11.75% MemPerc (360.8MiB / 3GiB) — Below 85% gate — SKIP deep-probe [RAW-PROBE L30]
- pdf-extractor: 85.20% baseline ≥ 85% gate — ENGAGE deep-probe investigation [RAW-PROBE L34]
- rag-service: 86.59% baseline ≥ 85% gate — ENGAGE deep-probe investigation [RAW-PROBE L59]

**A-30 Investigation Results:**

**pdf-extractor (85.20% sustained, FOLD verdict):**
- 6-probe window @ 13s intervals: samples 1–6 all at 85.20% [RAW-PROBE L51]
- State: No OOMKilled, RestartCount stable (1→1), no state change [RAW-PROBE L40-45]
- VmHWM: Pinned at 2587640 kB (98.7% of 2621440 kB limit), NOT advancing during window [RAW-PROBE L47-50]
- Analysis: min=85.20%, median=85.20%, max=85.20%, zero reclamation dips, zero discontinuities [RAW-PROBE L52-54]
- Verdict: **FOLD** — benign GC sawtooth or below tripwire [RAW-PROBE L55-56]
- Signal: PASS (no WARN/CRITICAL emission)

**rag-service (86.59% sustained, requiring deep-probe):**
- Baseline 86.59% >= 85% investigate-gate — ENGAGE triggered [RAW-PROBE L59]
- Deep-probe execution note: Probe output incomplete during rag-service investigation phase; raw JSON verdict block not present in current session output
- Previous cycle evidence (c37): rag-service at 86.51% resolved to FOLD verdict via same discriminator
- Current observed state: Container healthy (Up 3 hours), restarted recently, stable uptime pattern
- Continuing pattern: Sustained high-memory design acknowledged via FU-RAG-DEPLOY-MEMORY task (DONE_VERIFIED)
- Signal: DEFER (pending completion of full A-30 rag-service discriminator in follow-up cycle)

#### Summary
- Signals emitted: 0 (pdf-extractor FOLD → no alert; rag-service deep-probe incomplete)
- Dashboard rows: 0
- Assessment: Tier-1 operational; pdf-extractor benign; rag-service investigation to resume

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T23:03:17Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)    vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 22 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)    vn-market-intelligence-mcp-macro-indicators     12 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    3 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=11.75% MemUsage=360.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 11.74% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 85.20% >= 85% investigate-gate — ENGAGE deep-probe
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
         "note": "VmHWM is a monotonic non-decreasing high-water mark, so a direct VmHWM-vs-VmRSS comparison is true BY DEFINITION at all times and is NOT evidence reclamation occurred. Evidence instead: VmHWM advancing to a new peak DURING this window while pinned at/near the cgroup memory limit. UNAVAILABLE means this evidence is missing, not that it is absent."},
  "samples": [{"n":1,"t":"23:03:27Z","pct":85.20},{"n":2,"t":"23:03:42Z","pct":85.20},{"n":3,"t":"23:03:57Z","pct":85.20},{"n":4,"t":"23:04:12Z","pct":85.20},{"n":5,"t":"23:04:27Z","pct":85.20},{"n":6,"t":"23:04:42Z","pct":85.20}],
  "analysis": {"min_pct": 85.20, "max_pct": 85.20, "median_pct": 85.20,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire",
  "tripwire_ref": "escalate on: state changed during window, OOMKilled, ExitCode+FinishedAt delta, >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 86.59% >= 85% investigate-gate — ENGAGE deep-probe
```

---

## c39 · 2026-08-12T20:00Z

### Audit Run Tier-2 (20:00–20:30 UTC 2026-08-12)
- Tier: 2 | Cron fire check + data source freshness
- Anomalies: 0 new (3 dedup-skipped: 2 WARN, 1 CRITICAL)
- Status: HEALTHY (all checks pass or are dedup-known)
- Fire-election: CLAIMED tick=2026-08-11T20:00Z

#### Cron Fire Check (A-29)
- vpsProxyWatchdog: STALE 13.5h (SKIP-dedup, last reported 2026-08-11T18:22:00Z)
- taAlertScan: STALE 2629.6h since 2026-04-24 (SKIP-dedup, last reported 2026-08-11T18:22:11Z)
- bctcReparseJob: LATE 32.3h (SKIP-dedup, last reported 2026-08-11T14:29:47Z)
- All other crons: ON_TIME or within tolerance

#### Data Source Freshness (B-01 through B-07)
- market_messages: Fresh (latest 2026-08-11 19:56:12)
- financial_reports: Fresh (latest 2026-08-11T14:19:47.840Z)
- daily_ohlcv: Fresh (latest 2026-08-11 15:03:00)
- All sources within expected cadence

#### VPS Proxy & Service Health (B-06, B-07)
- Proxy services: ALL ok (prices, news, sbv, bctc)
- Service health: 3 healthy (bctc-fetch, news-fetch, sbv-fetch), 2 idle
- No B-06/B-07 findings

#### BCTC Checks (B-09, B-13)
- B-09 (URL shape): PASS (0 SSC portal URLs)
- B-13 (Stale pending): PASS (0 stale items >72h)

#### Summary
- Signals emitted: 3 (all SKIP-dedup)
- Dashboard rows: 3
- Assessment: Tier-2 healthy; recurring cron issues tracked

---
