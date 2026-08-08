# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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


## c373 · 2026-08-08T15:39Z

### Audit Run Tier-1 (15:34–15:39 UTC 2026-08-08)
- Tier: 1 | Services: 13 host_runtime_set checked | Health: 5 probed
- Anomalies: 2 new (C 0, W 2, I 0) | Status: DEGRADED
- A-30 Memory Pressure (per-container deep-probe):
  - rag-service-1: 94.69% baseline ≥ 85% gate → ENGAGE deep-probe
    - verdict: ESCALATE (loss of reclamation)
    - 6-sample median: 94.71% (min 94.69%, max 94.71%)
    - VmHWM: pinned at cap (1.5GiB), NOT advancing in window
    - No OOMKilled, no state_changes, no discontinuities
    - Emission: [emit-signal] OK sys-20260808T153848-7fac (WARN)
    - Known disposition (STALE-ACK): FU-RAG-DEPLOY-MEMORY status=DONE_VERIFIED
    - Verification needed: escalation vs benign within established bounds
  - mcp-server-1: 95.29% baseline ≥ 85% gate → ENGAGE deep-probe
    - verdict: ESCALATE (loss of reclamation)
    - 6-sample median: 94.50% (min 94.36%, max 94.93%)
    - VmHWM: pinned at cap (3.0GiB), NOT advancing in window
    - No OOMKilled, no state_changes, no discontinuities
    - Emission: [emit-signal] OK sys-20260808T153859-7b4c (WARN)
    - Fresh finding — distinct from rag-service (per FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE)
- All other memory checks: PASS (pdf-extractor 70.92%, all others < 10%)
- A-20 pdf-extractor multi-probe: 3/3 PASS
- All health endpoints: OK (HTTP 200)
- Disk: 68% used < 85% PASS
- Restart count: mcp-server RestartCount=3, windowed=0 PASS

## c372 · 2026-08-06T22:33:04Z
### Audit Run Tier-1 (22:31–22:33 UTC 2026-08-06)
- Tier: 1 | Services: 12 host_runtime_set | Health: 5 probed
- Anomalies: 0 | Status: HEALTHY
- All container checks PASS: [mcp-server, api-gateway, frontend, macro-indicators, mcp-gateway, pdf-extractor, stock-price, technical-analysis, kinh-dich-service, alert-engine, rag-service, news-fetch] — all Up, healthy status.
- Health endpoints PASS [mcp-server:3000, api-gateway:4000, macro-indicators:5004, pdf-extractor:5001, frontend:3001].
