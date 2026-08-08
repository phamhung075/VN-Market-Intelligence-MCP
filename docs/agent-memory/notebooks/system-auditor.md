# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c381 · 2026-08-08T20:12Z

### Audit Run Tier-1 (20:08–20:12 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 SUSTAINED — pattern now 3+ hours) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (SUSTAINED SUSTAINED — CHRONIC ESCALATION REQUIRED):**
  - Baseline: 97.50% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 97.50% (min 97.50%, median 97.50%, max 97.50%) — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all 100% sustained)
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=UNAVAILABLE (host-floor-check skip)
  - Emission: [emit-signal] SKIP-dedup sys-20260808T201216-7780 (WARN, last reported @17:38:48Z)
  - [emit-dashboard] OK id=sys-20260808T201216-7780 check_id=A-30 (DASHBOARD row appended despite dedup)
  - CRITICAL CONTEXT: Container has been at 97.50% for entire probe window (65s span) — ZERO recovery opportunity observed. Previous probe c380 @19:33:39Z showed 97.41% (same pattern, 40min prior). Memory floor breach confirmed (@18:05:32Z c378: 2.9MiB vs 40MiB floor). This is NOT transient GC jitter; this is sustained pressure with architectural implications. FU-RAG-DEPLOY-MEMORY fix marked DONE_VERIFIED @10:59:52Z but pattern persists and worsens. RECOMMEND: (a) immediate ops investigation into rag-service load/leaks, (b) escalate to PO as PRIORITY if no fix in flight, (c) consider temporary memory cap increase as emergency mitigation pending root-cause fix.
- **mcp-server-1 A-30:** Baseline 12.51% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 47% PASS
- [OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
## c380 · 2026-08-08T19:33:39Z

### Audit Run Tier-1 (19:30–19:35 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed  
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 recurring) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (RECURRENCE SUSTAINED — NO IMPROVEMENT):**
  - Baseline: 97.41% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: all exactly at 97.41% (min 97.41%, median 97.41%, max 97.41%)
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all >93% sustained)
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=UNAVAILABLE (host-floor-check skip)
  - Emission: [emit-signal] SKIP-dedup sys-20260808T193630-348e (WARN dedup_key: microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 — last reported @17:38:48Z in c377)
  - [emit-dashboard] OK id=sys-20260808T193630-348e check_id=A-30 (DASHBOARD row appended despite dedup-skip)
  - ANALYSIS: Discriminator confirms NOT a crash-cliff (no state changes, no OOMKilled, no discontinuities, no VmHWM pinning). This is genuine "loss of reclamation" — container stuck at 97.41% with zero recovery capacity. 4th occurrence in 2+ hours (19:06, 18:03, 17:35, 19:33 UTC) with stable pattern. Previous FU-RAG-DEPLOY-MEMORY deemed DONE_VERIFIED but issue persists — requires escalation.
- **mcp-server-1 A-30:** Baseline 7.83% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 44% PASS
- [OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1

## c379 · 2026-08-08T19:09:44Z

### Audit Run Tier-1 (19:06–19:10 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 recurring) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (RECURRENCE CONFIRMED — FIX-STALE-ACK-ANALYSIS):**
  - Baseline: 97.38% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: all exactly at 97.38% (min 97.38%, median 97.38%, max 97.38%)
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all >93% sustained)
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=UNAVAILABLE (host-floor-check skip)
  - Emission: [emit-signal] SKIP-dedup sys-20260808T180600-2ee6 (WARN dedup_key: microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 — flagged @17:38:48Z in c377)
  - **STALE-ACK VERIFICATION:** FU-RAG-DEPLOY-MEMORY marked DONE_VERIFIED@2026-08-08T10:59:52Z per decision log. A-30 discriminator confirms GENUINE RECURRENCE (not a stale marker to be pruned): sustained >93% across window, zero reclamation opportunity, chronic pattern now 12+ signals over ~4 days. Fix did NOT resolve underlying issue or was incomplete. Recommend immediate escalation to PO/developer for root-cause re-analysis.
- **mcp-server-1 A-30:** Baseline 12.49% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 49% PASS

## c378 · 2026-08-08T18:05:32Z

### Audit Run Tier-1 (18:03–18:05 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 WARN (A-30 rag-service-1 NEW BELOW-FLOOR escalation) | Status: DEGRADED
- **rag-service-1 A-30 BELOW-FLOOR Escalation (NEW dedup_key):**
  - Baseline: 99.72% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: all at 99.72% (min 99.72%, median 99.72%, max 99.72%)
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all 100% sustained)
  - Memory free: 2.9MiB (BELOW 40MiB floor threshold) — NEW severity escalation trigger
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=UNAVAILABLE (host-floor-check skip)
  - Emission: [emit-signal] OK sys-20260808T180600-2ee6 (WARN) — NEW dedup_key microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30:BELOW-FLOOR
  - ESCALATION NOTE: Previous WARN filed @17:38:48Z on sustained A-30 ceiling. NOW crosses BELOW-FLOOR threshold (2.9MiB vs 40MiB floor). Chronic pattern 12+ distinct dedup entries since 2026-08-05, zero reclamation opportunity. Recommend immediate memory analysis / load spike investigation.
- **mcp-server-1 A-30:** Baseline 10.34% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 44% PASS

## c377 · 2026-08-08T17:35:39Z

### Audit Run Tier-1 (17:35–17:38 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 WARN (A-30 rag-service-1 chronic pattern) | Status: DEGRADED
- **rag-service-1 A-30 Memory Escalation (CHRONIC RECURRING 11 signals over 4d):**
  - Baseline: 99.66% ≥ 85% investigate-gate → ENGAGE
  - Deep-probe 6 samples over 65s: min 99.49%, median 99.49%, max 99.69%
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all >93% sustained)
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=UNAVAILABLE (host-floor-check skip)
  - Emission: [emit-signal] OK sys-20260808T173849-2d4b (WARN) — dedup_key microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30
  - ESCALATION NOTE: Chronic pattern 11+ dedup signals since 2026-08-05, no durable fix in flight (task_board empty for FIX-RAG-*), recurring threshold MET — recommend PO/ops investigation
- **mcp-server-1 A-30:** Baseline 9.16% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 43% PASS

## c376 · 2026-08-08T17:15:58Z

### Audit Run Tier-1 (17:10–17:13 UTC 2026-08-08)
- Tier: 1 | Services: 12 host_runtime_set checked | Health: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- **rag-service-1 A-30:** Baseline 91.71% ≥ 85% gate → ENGAGE, median 91.72%, verdict FOLD (benign), no emit
- **mcp-server-1 A-30:** Baseline 7.07% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21: 0 crashes PASS
- Health endpoints: OK (HTTP 200) | Disk: 44% PASS
- Heartbeat: last_healthy_at=2026-08-08T17:13:14Z

## c375 · 2026-08-08T16:38Z

### Audit Run Tier-1 (16:35–16:38 UTC 2026-08-08)
- Tier: 1 | Services: 12 host_runtime_set checked | Health: 5 probed
- Anomalies: 0 new (already in 7d dedup) | Status: DEGRADED
- **mcp-server-1 A-30 Memory Pressure (per-container deep-probe):**
  - Baseline: 97.04% ≥ 85% investigate-gate → ENGAGE
  - 6-sample median: 97.91% (min 94.09%, max 98.82%)
  - Verdict: ESCALATE "loss of reclamation" — all samples >93% sustained high, 2 reclamation dips ≤40pp, 0 discontinuities
  - VmHWM: pinned at 3GB cap, NOT advancing | state_changed=false, OOMKilled=false
  - Emission: [emit-signal] SKIP-dedup sys-20260808T163956-006d (reported 16:08Z, 7d window)
  - Note: in-flight fix FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK; do NOT restart/rebuild per PO
- **rag-service-1 A-30:** Baseline 92.11%, median 92.31% → FOLD (benign), PASS
- A-12 api-gateway: CLIENT_TIMEOUT (1/3 debounce) → DEBOUNCED
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 69% PASS


## c374 · 2026-08-08T16:08Z

### Audit Run Tier-1 (16:03–16:07 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 new (C 1, W 0, I 0) | Status: DEGRADED
- A-30 Memory Pressure (per-container deep-probe):
  - rag-service-1: 85.81% baseline ≥ 85% gate → ENGAGE
    - 6-sample median: 85.81% (min/max both 85.81%, flat line)
    - verdict: FOLD (benign GC sawtooth, no tripwire)
    - VmHWM: pinned at cap (1.5GiB), NOT advancing
    - No OOMKilled, no state_changes, no discontinuities
    - Emission: PASS, no signal (within established bounds)
  - mcp-server-1: 96.89% baseline ≥ 85% gate → ENGAGE
    - 6-sample median: 96.75% (min 96.72%, max 97.43%)
    - verdict: ESCALATE (VmHWM advancing 3052552→3056472kB, pinned at 3GiB cap >=90%)
    - 1 reclamation dip (97.43→96.76), insufficient for healthy recovery
    - No OOMKilled during window, RestartCount=3 (unchanged, no new crashes)
    - Emission: [emit-signal] OK sys-20260808T160824-23c9 (CRITICAL) — FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE per-container gate engaged
    - Root cause: Known issue FU-RAG-DEPLOY-MEMORY (tracker status REVIEW as of 2026-07-29)
- All other memory checks PASS (pdf-extractor 71.52%, all others <10%)
- A-20 pdf-extractor multi-probe: 3/3 PASS
- All health endpoints: OK (HTTP 200)
- Disk: 65% used < 85% PASS

