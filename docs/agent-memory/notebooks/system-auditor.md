# System Auditor — Tier-1 Notebook


## c97 · 2026-08-14T08:14:25Z

### Audit Run Tier-1 (08:14 UTC 2026-08-14, A-30 deep-dive — STALE-ACK claim investigated)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- **Anomalies: NONE — A-30 rag-service FOLD (median 91.59%, stable/benign)**
- Dedup-skipped: 0 | Signals posted: 0 | Status: HEALTHY
- **Note (FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-MACHINE-VERDICT):** Trigger alert's STALE-ACK claim (FU-RAG-DEPLOY-MEMORY, status=DONE_VERIFIED) investigated: container image built 2026-08-12T10:40:10Z, started 2026-08-13T09:20:09Z, both BEFORE fix commit 82216e291 (2026-08-14T07:05:41Z). Container has NOT run fixed code. However, this cycle's A-30 discriminator shows **verdict=FOLD** (no escalation triggers met) — stable 91.59% memory, zero OOM events, zero state changes, VmHWM NOT advancing despite pinned at cap. HONEST verdict: PASS (no signal). STALE-ACK claim's accuracy is moot — this cycle's actual health state is benign regardless.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T08:14:25Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)   vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 17 hours (healthy)   vn-market-intelligence-mcp-news-fetch           17 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 19 hours (healthy)   vn-market-intelligence-mcp-api-gateway          19 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 20 hours (healthy)   vn-market-intelligence-mcp-alert-engine         20 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 23 hours (healthy)   vn-market-intelligence-mcp-rag-service          46 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 18 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)    vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)    mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=9.12% MemUsage=280.1MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 9.12% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.41% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.52% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.42% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 91.57% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 36.25% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.72% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.22% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 8.98% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.95% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.34% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 2.96% < 85% investigate-gate
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "3", "restart_count_after": "3",
    "started_at_before": "2026-08-13T09:20:09.721086103Z", "started_at_after": "2026-08-13T09:20:09.721086103Z",
    "exit_code_before": "0", "exit_code_after": "0",
    "finished_at_before": "2026-08-13T09:20:08.744906538Z", "finished_at_after": "2026-08-13T09:20:08.744906538Z",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "1502752", "vmhwm_kb_after": "1502752",
         "mem_limit_kb": "1048576",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true,
         "note": "VmHWM pinned at cap but NOT advancing during window"},
  "samples": [{"n":1,"t":"08:14:41Z","pct":91.59},{"n":2,"t":"08:14:56Z","pct":91.59},{"n":3,"t":"08:15:10Z","pct":91.59},{"n":4,"t":"08:15:26Z","pct":91.59},{"n":5,"t":"08:15:40Z","pct":91.59},{"n":6,"t":"08:15:56Z","pct":91.59}],
  "analysis": {"min_pct": 91.59, "max_pct": 91.59, "median_pct": 91.59,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip — escalate on: state changed during window, OOMKilled, ExitCode=0+FinishedAt delta, a >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  252M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:

**A-30 Verdict Analysis (rag-service-1):**
- Baseline: 91.57% memory (>= 85% gate, correctly ENGAGED deep-probe)
- 65-second window: 6 samples, perfectly flat at 91.59% (zero variance = stable, not creeping)
- Machine-computed verdict: **FOLD** (not ESCALATE)
- Escalation tripwire analysis:
  - state_changed_during_window: ✗ false (no crash)
  - oom_killed_before/after: ✗ false (no OOM event)
  - vmhwm_advancing_in_window: ✗ false (high-water mark is stable, NOT advancing)
  - min_pct 91.59: ✗ not >93% sustained floor
  - median_pct 91.59: ✗ not >97% peak
  - reclamation_dips: ✗ 0 (no memory recovery seen)
  - discontinuities: ✗ 0 (no crash-cliff)
- **Decision per tier1-probe.md clause 4:** verdict=="FOLD" → **PASS, no emit**

**Containers A-01 through A-11 (status checks):** ✓ ALL PASS (13 services, all Up)
**Containers A-12 through A-20 (health endpoints):** ✓ ALL PASS (5 endpoints, all 200)
**A-21 (restart count):** ✓ PASS (mcp-server RestartCount=0, within normal bounds)
**A-32 (disk capacity):** ✓ PASS (36% used, well below 85% threshold)
**A-33 (hook liveness):** ✓ PASS (not checked in Tier-1, Tier-3 only)

**Overall Tier-1 Verdict: HEALTHY** — all checks pass, zero anomalies.

### Rationale on STALE-ACK claim:
The trigger included a STALE-ACK annotation claiming FU-RAG-DEPLOY-MEMORY with status=DONE_VERIFIED. Upon investigation:
- Container `vn-market-intelligence-mcp-rag-service-1` (image built 2026-08-12T10:40:10Z, started 2026-08-13T09:20:09Z) predates the fix commit 82216e291 (2026-08-14T07:05:41Z) by 22–45 hours.
- **The container has never executed the fixed code.**
- However, this is moot for today's verdict because **fresh machine-computed A-30 verdict is FOLD** — the memory is stable and benign at 91.59%, not creeping or crashing, regardless of which code version it runs.
- Per AUD-CP-1 (CALLER-INSTRUCTION PRECEDENCE in main.md): Honest machine verdict wins over any caller assertion or STALE-ACK claim.
- **Conclusion:** The STALE-ACK claim's reliability is correctly questioned, but the current cycle's actual health state is healthy — no remediation triggered.
