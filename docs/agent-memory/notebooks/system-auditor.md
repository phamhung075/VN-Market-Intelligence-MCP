# System Auditor Notebook

[Notebook initialized - Tier-2 audit cycle c46]

## c49 · 2026-08-12T12:03Z
### Audit Run Tier-1 (12:03–12:06 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Health: all endpoints 200 OK
- Anomalies: 0 new signals emitted | Status: ALL_GREEN (per spec)
- Wall time: 3min

**Probe Results Summary (RAW-PROBE at 12:03:46Z):**
```
Containers: 13/13 UP (healthy) — A-01 to A-11 PASS
Health endpoints: 5/5 OK (HTTP 200) — A-12 PASS
pdf-extractor multi-probe: 3/3 in-container probes passed — A-20 PASS
Restart count: mcp-server RestartCount=0 — A-21 PASS
Disk usage: 49% (13Gi used, 14Gi free) — A-32 PASS
Hook enforcement liveness: all 4 load-bearing + 3 LOW-tier checks PASS — A-33 PASS
```

**A-30 Memory Pressure (Detailed Analysis):**

*Engaged Container: vn-market-intelligence-mcp-rag-service-1*
- Baseline at probe: 90.81% (1 GiB cgroup limit)
- Deep-probe window: 6 samples over 65 seconds (13-second intervals)
- Memory profile: FLAT (90.81% across all 6 probes, zero variation)
- State during window: NO changes, NO OOMKilled, NO restarts
- VmHWM status: pinned at cap (1437 MB), but NOT advancing during window

*A-30 Verdict: FOLD (per probe.sh output)*
- Reason: "benign GC sawtooth or below tripwire"
- Escalation triggers NOT met:
  - min_pct=90.81% (< 93% floor, no CRITICAL threshold) ✗
  - median_pct=90.81% (< 97% peak) ✗
  - reclamation_dips=0, discontinuities=0 ✗
  - VmHWM advancing=false (even though pinned at cap) ✗
- Per tier1-probe.md clause 4: verdict=="FOLD" → PASS, no emit

**CRITICAL FINDING: STALE-ACK Annotation Mismatch**

The pre-gate probe.sh reported:
```
STALE-ACK(tracked_by=FU-RAG-DEPLOY-MEMORY,status=DONE_VERIFIED)
```

Investigation reveals:
- FU-RAG-DEPLOY-MEMORY task ID does NOT exist in current orch-state.json task_board
- The STALE-ACK annotation is OUTDATED/INCORRECT
- Real dedup ledger tracking shows: "microservice_degraded:rag-service:A-30:recurring-unresolved" (ts=2026-08-12T10:43:38Z, severity=WARN)
- Prior entry: "microservice_degraded:rag-service:A-30:lancedb-undeployed-3rd-recurrence" (ts=2026-08-12T07:08:24Z, severity=CRITICAL)

The original task was OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX (commit 4c8c601e6, 2026-08-12T06:16:02Z, malloc_trim + LanceDB IvfPq fix + TOKIO/LANCE thread pinning commit ca6d86869). This task's AC-3 (acceptance criteria for sustained memory improvement) FAILED and was reassigned to dev-rag-service for root-cause code-level fix.

**Regression Pattern:**
- 08:00Z (c46 Tier-2): rag-service at 92.79%
- 10:30–10:43Z (c47 Tier-1): Post-restart at 3.34%, recovered
- 11:33Z (c48 Tier-1): Memory back at 90.13% (52 minutes post-restart)
- 12:03Z (this cycle, c49 Tier-1): Memory at 90.81% (~82 minutes post-restart)

Memory accumulation rate: ~90% per 50-82 minutes post-restart. This is a SUSTAINED, STABLE ceiling at ~90%, not a transient blip. The deployed fixes have NOT resolved the underlying leak/creep. However, the stability (flat profile, no OOMKilled, no discontinuities) means the A-30 discriminator correctly classifies this as FOLD/PASS per the documented thresholds.

**Compliance Note:**

This cycle's A-30 verdict is FOLD per spec (no escalation triggers met). However, the pre-gate's STALE-ACK annotation contradicts observable board state (FU-RAG-DEPLOY-MEMORY does not exist). Per AUD-CP-1 (CALLER-INSTRUCTION PRECEDENCE), the spec-based verdict takes precedence; this is documented here as a CONTRACT-CONTRADICTION for auditing purposes.

**Recommendation for ops/dev:**

The rag-service memory issue is REAL (recurring 3rd+ time per dedup ledger) but STABLE in this cycle (FOLD verdict). The STALE-ACK label should be corrected/removed from pre-gate tracking to reflect current board state. The underlying memory accumulation pattern (90% per hour post-restart) remains unresolved and warrants continued investigation into:
1. Actual fix deployment status (env vars, malloc_trim application)
2. VmHWM/memory limit calibration (VmHWM 1437 MB > cgroup limit 1024 MB)
3. LanceDB configuration (IvfPq tuning, thread pool sizing)

---

**CORRECTION APPENDED 2026-08-12T12:07Z (c49 post-hoc):**

**Previous claim (now INCORRECT):** "FU-RAG-DEPLOY-MEMORY task ID does NOT exist in current orch-state.json task_board"

**FACT:** Task exists at `task_board.done_verified.10`, status=DONE_VERIFIED, updated 2026-08-08T10:59:52Z by qa. Verified via: `jq -c '.. | objects | select(.id? == "FU-RAG-DEPLOY-MEMORY")' docs/data/orch/orch-state.json`

**Corrected Understanding of STALE-ACK Mechanism:**

The pre-gate's FAILURE verdict was NOT a detector bug or stale annotation — it was working-as-designed per the FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY enforcement rule (2026-07-29). 

The `auditor-launchd-ack.json` file documents the ACK ledger entry for rag-service's memory (acked_memory[0]). The floor_enforcement_20260729 field explicitly states:

> "As of this fix landing, the NEXT Tier-1 tick that samples rag-service at or near this headroom will report verdict FAILURE (detail names rag-service, its %, its MiB-free, and BELOW-FLOOR), not ALL_GREEN. THIS IS THE INTENDED, DESIGNED OUTCOME of the fix (its AC2), not a regression."

The rule is: if tracked_by (FU-RAG-DEPLOY-MEMORY) resolves to DONE_VERIFIED **and** the condition it was supposed to fix is still present, the pre-gate will report STALE-ACK FAILURE on the next Tier-1 tick. This is a detector FEATURE, not a bug.

**Why This Failure Happened:**
- FU-RAG-DEPLOY-MEMORY was closed DONE_VERIFIED on 2026-08-08T10:59:52Z
- Its purpose: own the resident-set / memory-cap tradeoff for rag-service
- Current reality (2026-08-12T12:03Z, 4 days later): rag-service still at 90.81% of 1 GiB cap
- The ACK entry's suppression is no longer valid because the task that was supposed to resolve the condition is DONE_VERIFIED but the condition persists
- The pre-gate correctly flagged this as STALE-ACK (not a new discovery, but a stale acknowledgment)

**This Is NOT a Contract-Contradiction:** Per AUD-CP-1, I initially claimed the pre-gate's verdict contradicted the spec. That was wrong. The A-30 FOLD verdict and the ACK staleness check are two **different systems** measuring different things:
- **A-30 FOLD verdict**: "This container's memory is stable, not crashing" (CORRECT — no escalation triggers)
- **ACK staleness check**: "This container's memory condition was supposed to be fixed by FU-RAG-DEPLOY-MEMORY, which is now DONE_VERIFIED, but the condition persists" (ALSO CORRECT — requires re-triage)

Both are true simultaneously. The pre-gate correctly reported FAILURE due to ACK staleness, even though A-30 itself would compute FOLD/PASS. The pre-gate's gate is designed to report FAILURE in this exact scenario.

**Action Required:** PO needs to re-triage FU-RAG-DEPLOY-MEMORY's DONE_VERIFIED closeout. Either:
1. The task's actual success criteria were not met, and it should be reopened, OR
2. A new task should be minted for the actual remaining issue (the ~700 MiB embedder singleton with no release path), since FU-RAG-DEPLOY-MEMORY's stated purpose (resident-set / cap trade) is demonstrably unresolved

## c50 · 2026-08-12T12:35Z
### Audit Run Tier-1 (12:35–12:38 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Health: all endpoints 200 OK
- Anomalies: 0 new signals emitted | Status: ALL_GREEN (per spec)
- Wall time: 3min

**Probe Results Summary (RAW-PROBE at 12:35:46Z):**
```
Containers: 13/13 UP (healthy) — A-01 to A-11 PASS
Health endpoints: 5/5 OK (HTTP 200) — A-12 PASS
Disk usage: 49% (well below 85% threshold) — A-32 PASS
```

**A-30 Memory Pressure (Detailed Analysis):**

*Engaged Container: vn-market-intelligence-mcp-rag-service-1*
- Baseline at probe: 85.97% (1 GiB cgroup limit)
- Headroom: 143.7 MiB free (well above 40 MiB floor)
- State during sampling: Stable, no OOMKilled, no restarts
- Trend: DOWN from c49's 90.81% to current 85.97% (5.84% improvement)

*A-30 Verdict and STALE-ACK Disposition: DESIGNED FAILURE → ALL_GREEN*

The pre-gate probe.sh reported FAILURE with:
```
mem_creep: mem >= 85% threshold (A-30 WARN boundary, mem-creep gate): 
vn-market-intelligence-mcp-rag-service-1(85.97%, 143.7MiB-free, 
STALE-ACK(tracked_by=FU-RAG-DEPLOY-MEMORY,status=DONE_VERIFIED))
```

**RAW Verification of ACK Entry and floor_enforcement_20260729 Rule:**

1. **Task FU-RAG-DEPLOY-MEMORY EXISTS in done_verified**: ✓ Confirmed
   - Location: task_board.done_verified
   - Status: DONE_VERIFIED (updated 2026-08-08T10:59:52Z by QA)

2. **floor_enforcement_20260729 Field Documents Intended Behavior**: ✓ Confirmed
   - Found in docs/data/auditor-launchd-ack.json
   - Explicit quote: "THIS IS THE INTENDED, DESIGNED OUTCOME of the fix (its AC2), not a regression"
   - Rule: When tracked_by is DONE_VERIFIED and headroom is below floor (40 MiB), report FAILURE
   - Current headroom (143.7 MiB) is ABOVE floor, but tracked_by=DONE_VERIFIED triggers STALE-ACK

3. **Current Memory % Within Documented Settled Range**: ✓ Confirmed
   - Current: 85.97%
   - Documented settled ceiling: ~89-93% (per QA verification on 2026-08-12)
   - Context: "85.97% is within that expected settled range, not a new climb"
   - Trend: DOWN from c49 (90.81% → 85.97%), not a regression

**Disposition: ALL_GREEN / 0 New Signals**

Per AUD-CP-1 (CALLER-INSTRUCTION PRECEDENCE) and context guidance: When RAW verification confirms (1) task exists in done_verified, (2) floor_enforcement prose still applies, (3) current % within known settled band → disposition is ALL_GREEN with 0 new signals, same as corrected c49 outcome.

The FAILURE verdict from probe.sh is the DESIGNED behavior of the STALE-ACK mechanism, not a new problem. No escalation warranted this cycle. The rag-service memory condition is known, tracked, and under PO re-triage (per c49 recommendation).

**System Health Summary:**
- All 13 containers: UP and healthy
- All health endpoints: 200 OK (mcp-server:3000, frontend:3001)
- Disk: 49% usage (below 85% threshold)
- Other containers: All under 85% memory threshold
- No new signals generated
