
## c56 · 2026-08-12T16:05:58Z
### Audit Run Tier-1 (16:05–16:05 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 1 new (1 critical, 0 warn, 0 info) | 1 dedup-skipped
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T16:03:43Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)    vn-market-intelligence-mcp-rag-service          5 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 22 hours (healthy)   vn-market-intelligence-mcp-mcp-server           22 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 39 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)     vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)    vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           4 weeks ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=14.90% MemUsage=457.6MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 44.96% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 14.85% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 95.32% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.51% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.64% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.95% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.96% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 5.06% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 10.13% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.40% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.33% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.21% < 85% investigate-gate
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
  "samples": [{"n":1,"t":"16:03:55Z","pct":95.32},{"n":2,"t":"16:04:09Z","pct":95.32},{"n":3,"t":"16:04:24Z","pct":95.28},{"n":4,"t":"16:04:40Z","pct":95.18},{"n":5,"t":"16:04:55Z","pct":95.18},{"n":6,"t":"16:05:10Z","pct":95.18}],
  "analysis": {"min_pct": 95.18, "max_pct": 95.32, "median_pct": 95.23,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip — escalate on: state changed during window, OOMKilled, ExitCode=0+FinishedAt delta, a >40pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    13Gi    50%    393k  141M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
- [A-30] pdf-extractor: CRITICAL sustained memory >93% (95.32% max)
  - Verdict: ESCALATE per multi-probe discriminator
  - 6-sample window, 65s span: min=95.18%, max=95.32%, median=95.23%
  - No reclamation dips, no discontinuities, state stable
  - VmHWM pinned at cgroup limit
  - Risk: OOMKiller eviction if sustained
  - [emit-signal] OK-escalation-bypass dedup_key=microservice_degraded:pdf-extractor:A-30 prev_sev=2 new_sev=3 id=sys-20260812T160538-57ef
  - [emit-dashboard] OK id=sys-20260812T160538-57ef check_id=A-30

## c55 · 2026-08-12T15:30Z
### Audit Run Tier-1 (15:30–15:35 UTC 2026-08-12)
- Tier: 1 | Status: DEGRADED
- Anomalies: 2 found (1 new, 1 dedup-known)
- Wall time: ~4min
- Summary: A-30 memory pressure on two containers; pdf-extractor escalation continuing; rag-service tracked

**RAW-PROBE:** [2026-08-12T15:33:31Z]
All services UP (docker ps ✓), all health endpoints 200 ✓, disk 48% ✓

**Container Status (A-01..A-11):** All PASS
**Health Endpoints (A-12..A-19):** All PASS  
**A-20 (pdf-extractor multi-probe):** 3/3 probes 200 OK → PASS
**A-21 (Restart count):** mcp-server RestartCount=0 → PASS
**A-32 (Disk):** 48% capacity → PASS

**A-30 (Memory Pressure — Multi-Probe Verdict):**

- **vn-market-intelligence-mcp-rag-service-1:** baseline 95.57%
  - Verdict: ESCALATE — "all samples >93% sustained high — loss of reclamation"
  - severity: WARN (sustained >93% floor, no state change/OOMKilled/discontinuity/vmhwm advance)
  - Signal: [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 last_sent=2026-08-06T08:16:21Z id=sys-20260812T153534-59fc
  - DASHBOARD row: [emit-dashboard] OK id=sys-20260812T153534-59fc check_id=A-30
  - Note: Dedup-skipped (within 7-day window from prior send 2026-08-06)

- **vn-market-intelligence-mcp-pdf-extractor-1:** baseline 95.36%
  - Verdict: ESCALATE — "all samples >93% sustained high — loss of reclamation"
  - severity: WARN (sustained >93% floor, no state change/OOMKilled/discontinuity/vmhwm advance)
  - Signal: [emit-signal] OK dedup_key=microservice_degraded:pdf-extractor:A-30 id=sys-20260812T153538-7fe5
  - DASHBOARD row: [emit-dashboard] OK id=sys-20260812T153538-7fe5 check_id=A-30
  - Escalation trend confirmed: 88.95% → 78.16% (SKIP) → 93.92% → 95.23% → 95.36% (current)
  - Pattern analysis: sustained loss of reclamation without crash cliff indicates workload growth or inefficiency

**Other Containers:** All baseline <85% → SKIP gate → PASS

**Summary:** Both rag-service and pdf-extractor show sustained memory >93% with loss of reclamation pattern. No death indicators (OOMKilled/state change/discontinuity). pdf-extractor shows genuine escalation trend (4-cycle climb from 88.95% baseline). Tracked findings; rag-service known from prior work, pdf-extractor new emit this cycle.

**Signals:**
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 last_sent=2026-08-06T08:16:21Z id=sys-20260812T153534-59fc
- [emit-signal] OK dedup_key=microservice_degraded:pdf-extractor:A-30 id=sys-20260812T153538-7fe5
- [emit-dashboard] OK id=sys-20260812T153534-59fc check_id=A-30
- [emit-dashboard] OK id=sys-20260812T153538-7fe5 check_id=A-30

**[OUTPUT-CONTRACT]** signals_posted=2 | telegram_sent=1 | signal_queue_rows_written=2 | dashboard_rows=2 | dedup_skipped=1

**[HEARTBEAT]** no heartbeat written this cycle (Tier-1 subagent never touches auditor-tier1-last-healthy.json)

**[CONTRACT-CONTRADICTION]** NONE

---

## c53 · 2026-08-12T14:21Z
### Audit Run Tier-2 (14:21–14:22 UTC 2026-08-12)
- Tier: 2 | Services checked: N/A (Tier-2 freshness sweep) | Sources: 28 checked
- Anomalies: 1 new (1 WARN) | 0 dedup-skipped
- Status: DEGRADED

**Findings:**
- **B-07 (VPS Service Health):** vn-bctc-fetch reported unhealthy. BCTC data pipeline at risk. Signal: sys-20260812T142118-1332
- [emit-signal] OK dedup_key=microservice_degraded:vn-bctc-fetch:B-07 id=sys-20260812T142118-1332
- [emit-dashboard] OK id=sys-20260812T142118-1332 check_id=B-07

**Tier-1 Context (caller dispatch):**
- PDF-extractor memory escalating: 88.95% → 78.16% (c52 PASS) → 93.92% (current)
- Genuinely escalating trend, not transient noise. A-30 engage on next Tier-1 cycle.

**Freshness Summary:** All sources PASS (pipeline healthy, SLA compliance OK, VPS proxy ok/idle)

## c54 · 2026-08-12T15:00Z
### Audit Run Tier-1 (15:00–15:07 UTC 2026-08-12)
- Tier: 1 | Status: DEGRADED
- Anomalies: 1 tracked (A-30 pdf-extractor) | 0 new this cycle (dedup-known)
- Wall time: ~2min
- Summary: A-30 memory pressure escalation on pdf-extractor (95.23% sustained); rag-service benign (FOLD)

**RAW-PROBE:** [2026-08-12T15:05:06Z]
All services UP (docker ps ✓), all health endpoints 200 ✓, disk 51% ✓

**Container Status (A-01..A-11):** All PASS
