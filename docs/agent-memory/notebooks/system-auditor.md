# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


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

