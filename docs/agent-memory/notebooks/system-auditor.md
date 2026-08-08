# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c384 · 2026-08-08T22:04Z

### Audit Run Tier-1 (22:04–22:06 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 chronic) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (PERSISTENT CHRONIC ESCALATION):**
  - Baseline: 93.82% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.82% (min 93.82%, median 93.82%, max 93.82%) — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all >93% sustained)
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=pinned_at_cap, vmhwm_advancing=false
  - Emission: [emit-signal] SKIP-dedup sys-20260808T220615-02a8 (WARN, last reported @08:16:21Z c??)
  - Analysis: Chronic pattern continues from c377+ (6+ hours sustained @93-99%). Marked in PO triage @c376–c382 as ONE condition (FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS) but persists. Caller prompt noted stale ACK against tracking task (FU-RAG-DEPLOY-MEMORY status=DONE_VERIFIED). This cycle confirms pattern is live; within 7d dedup window, no new signal emit warranted.
- **mcp-server-1 A-30:** Baseline 7.81% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 47% PASS
- [OUTPUT-CONTRACT] signals_posted=0 (dedup) | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1

## c383 · 2026-08-08T21:30Z

### Audit Run Tier-1 (21:36–21:37 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 chronic) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (PERSISTENT CHRONIC PATTERN):**
  - Baseline: 93.80% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 93.80% (min 93.80%, median 93.80%, max 93.80%) — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all >93% sustained)
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=pinned_at_cap, vmhwm_advancing=false
  - Emission: [emit-signal] SKIP-dedup sys-20260808T213824-7dc3 (WARN, last reported @17:38:48Z c377)
  - PO triage c376–c382 (32min prior): folded as ONE chronic condition across 5 cycles, marked FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS. This c383 reading confirms pattern persistence; within 7d dedup window. No new dedup emit warranted.
- **mcp-server-1 A-30:** Baseline 8.62% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 47% PASS
- [OUTPUT-CONTRACT] signals_posted=0 (dedup) | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1

## c382 · 2026-08-08T20:30Z

### Audit Run Tier-1 (20:33–20:35 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 1 SKIP-dedup (A-30 rag-service-1 SUSTAINED) | Status: DEGRADED
- **rag-service-1 A-30 Memory Pressure (SUSTAINED CHRONIC PATTERN):**
  - Baseline: 97.34% ≥ 85% investigate-gate → ENGAGE deep-probe
  - Deep-probe 6 samples over 65s: ALL exactly 97.34% (min 97.34%, median 97.34%, max 97.34%) — FLAT-LINE
  - Verdict: ESCALATE "loss of reclamation" (0 dips, 0 discontinuities, all 100% sustained)
  - State: OOMKilled=false, restarts=0, state_changed=false, VmHWM=UNAVAILABLE (Amendment B host-floor-check skip)
  - Emission: [emit-signal] SKIP-dedup sys-20260808T203549-0289 (WARN, last reported @17:38:48Z)
  - Analysis: Fresh A-30 discriminator confirms GENUINE SUSTAINED PRESSURE (not crash-cliff). Chronic pattern c376→FOLD; c377–c381→ESCALATE "loss of reclamation" (5+ hours, 2+ cycles @97%+). Memory floor breach persists (2.9MiB vs 40MiB floor @18:05 c378). FU-RAG-DEPLOY-MEMORY marked DONE_VERIFIED @10:59:52Z but pattern persisted and worsened. CRITICAL: This is chronic architectural pressure, not transient GC. Recommend: (a) escalate to PO as PRIORITY if fix not in-flight, (b) immediate ops investigation into rag-service load profile.
- **mcp-server-1 A-30:** Baseline 13.03% < 85% gate → SKIP
- A-20 pdf-extractor: 3/3 PASS | A-21 crashes: 0 PASS | Disk: 48% PASS
- [OUTPUT-CONTRACT] signals_posted=0 (dedup) | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1

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
