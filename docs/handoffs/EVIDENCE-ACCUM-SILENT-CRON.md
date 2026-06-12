---
sprint: EVIDENCE-ACCUM-SILENT-CRON
branch: task/evidence-accumulator-silent-cron-fix
size: M
zone: apps/mcp-server/src/scheduler/
depends_on: []
blocks: ["SHIP-WAVE-REAUDIT"]
---

## TLDR

The `evidenceAccumulatorJob` cron job missed its scheduled 16:00 UTC tick on 2026-06-12, despite the scheduler running normally (peer jobs like `dataAuditJob:daily` fired at the same tick). This is the SECOND silent node-cron misfire in two days — `reputationComputeJob` showed the same signature on 2026-06-11 at 08:30 UTC. Root-cause investigation and fix required. Acceptance: root cause identified AND a verified live run of `evidenceAccumulatorJob` with `status=success + rows_written > 0` (manual trigger acceptable for proof, but the next scheduled 16:00 tick MUST also land).

## [PM] Planning Context

**Zone:** apps/mcp-server/src/scheduler/

**Acceptance Criteria:**
- [ ] Root cause of silent `evidenceAccumulatorJob` cron miss identified (check cron.schedule() registration, CRONS map entry, conditional disable, scheduler state, etc.)
- [ ] Manual trigger of `evidenceAccumulatorJob` executes and writes rows (proof the job logic is sound)
- [ ] Verify the fix does NOT re-break the job that was just fixed (FIX-EVIDENCE-PIPELINE commit 27eaece9)
- [ ] Live 16:00 UTC cron tick on or after 2026-06-12 shows `evidenceAccumulatorJob` in cron_job_runs with `status=success + rows_written > 0` (or next available tick if 16:00 already passed)

**Files to read first:**
- `apps/mcp-server/src/scheduler/startScheduler.ts` — scheduler initialization, CRONS map, cron.schedule() calls
- `apps/mcp-server/src/scheduler/evidenceAccumulatorJob.ts` — job implementation
- `apps/mcp-server/src/infrastructure/orchStateStore.ts` — cron_job_runs schema (verify rows_written field is stamped)
- QA Review Record in `docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md` § B-02 Re-check (lines 1064–1107) — shows the evidence

**Files to modify:**
- `apps/mcp-server/src/scheduler/startScheduler.ts` (if registration issue found)
- `apps/mcp-server/src/scheduler/evidenceAccumulatorJob.ts` (if job-internal bug found)
- Any conditional disable/feature flag that may silence the job

**Dependencies:** Blocks SHIP-WAVE-REAUDIT umbrella. Links to FU-REPUTATION-CRON-MISS (recurring pattern: 2nd silent node-cron misfire in same module).

**Knowledge needed:**
- `docs/protocols/fail-loud-protocol.md` — observable failures
- `docs/policies/dev-standards.md` — testing and verification
- Project memory: ["Cron re-entry reconcile"](../../docs/agent-memory/decisions/) — reconcile HEAD vs orch-state vs container before trusting

---

## Problem Statement

**QA Evidence (2026-06-12 16:15 UTC re-check):**

1. `foreignFlowAlertJob` ran 2026-06-12 08:13, status=success, rows_written=18 — PASS
2. `evidence_fragments` count=9 after that run — PASS
3. `evidenceAccumulatorJob` has NO entry in cron_job_runs for 2026-06-12 16:00 or later — FAIL
4. Scheduler tick at 16:00 UTC confirmed (peer jobs fired: `dataAuditJob:daily`, `pollNewsJob`, `deepFetchMainJob`, etc. all at 16:00–16:12)
5. Job IS registered in CRONS map at startup (confirmed: "80 cron keys in CRONS map")
6. Container healthy, no CRON_EVIDENCE_ACCUMULATOR env override
7. Container logs show zero "evidence|accumulator" activity post-16:00

**Recurring Pattern Alert:**

FU-REPUTATION-CRON-MISS (task 0eb4a917, owner ops) logged the same signature 2026-06-11 at 08:30 UTC:
- `reputationComputeJob` registered in CRONS map
- Peer jobs fired at 08:30 UTC
- `reputationComputeJob` silent
- Manual trigger worked

Per memory lesson ["Recurring bug escalation"](../../docs/agent-memory/decisions/), 2+ occurrences in the same module (node-cron scheduler, startScheduler.ts) escalate to architect for systemic investigation. **Developer must link both tasks in the handoff and consider escalation chain shape.**

---

## Technical Investigation Checklist

**Likely root causes (order by probability):**

1. **Scheduler registration miss:** `cron.schedule(CRONS.evidenceAccumulator, ...)` call at startScheduler.ts L469 never executes (conditional check prevents it, or import/require fails silently).
   - Check: grep `evidenceAccumulator` in startScheduler.ts for syntax/condition errors
   - Check: verify `CRONS` object includes `evidenceAccumulator` key

2. **Silent job error:** Job executes but throws and catches without logging/stamping cron_job_runs.
   - Check: wrap entire job in try/catch that calls `recordJobRun(..., {status: "error", error_msg: "..."})`
   - Check: does evidenceAccumulatorJob have any bare try/catch blocks that swallow errors?

3. **Concurrency guard blocking:** Some other lock (commit-mutex, task lock, etc.) prevents execution.
   - Check: look for lock acquire/release in scheduler or job start

4. **Evidence_fragments query condition:** The job's evidence-fetch query returns empty and an early guard throws OR silently bails without recording a run.
   - Check: FIX-EVIDENCE-PIPELINE commit 27eaece9 added `throw when evidence_fragments empty` — is this correctly wrapped?

5. **Node-cron library state corruption:** Unlikely but check scheduler health via running test job.
   - Manual trigger: spawn a test cron expression and verify scheduler responds

---

## Verification Steps

1. **Review code (first ~30 min):**
   - Open startScheduler.ts, search `evidenceAccumulator`, verify registration
   - Check if there's a feature flag or env-based disable
   - Check if commit 27eaece9 introduced an unguarded throw

2. **Local manual trigger (if possible):**
   - Invoke `evidenceAccumulatorJob()` directly via MCP tool or container exec
   - Verify it completes and writes rows
   - Proof: rows in evidence_fragments + entry in cron_job_runs

3. **Live re-verify (after fix deployed + container rebuild):**
   - Wait for next 16:00 UTC tick (or other scheduled time)
   - Query cron_job_runs for evidenceAccumulatorJob entry post-fix
   - Verify `status=success + rows_written > 0`

---

## Link to Related Task

**FU-REPUTATION-CRON-MISS** (0eb4a917, status: ops-assigned, same signature on 2026-06-11 08:30 UTC)

Both tasks show the same pattern:
- Cron job registered and expected to fire
- Peer jobs fire at the same tick
- Target job is silent (no cron_job_runs entry, no logs)
- Manual trigger succeeds

**Escalation path:** If both fixes are isolated patches with no common root, architect may still want a systemic review of node-cron scheduler under concurrent load (startScheduler.ts, scheduler state, node-cron library version, etc.). Developer should note in session log if a systemic issue is suspected during investigation.

---

## Blockers & Dependencies

- **Blocks:** SHIP-WAVE-REAUDIT (umbrella sprint, status ARCH-SHIP-WAVE-REAUDIT REVIEW) waits for FIX-EVIDENCE-PIPELINE-STARVED to pass re-check
- **Depends on:** None (but may need ops rebuild after fix)
- **Knowledge link:** FU-REPUTATION-CRON-MISS for pattern/context

---

## Test Plan

- [ ] Manual trigger of evidenceAccumulatorJob produces rows in evidence_fragments + cron_job_runs
- [ ] Build log shows no errors during container rebuild post-fix
- [ ] Live 16:00 UTC (or next scheduled tick) shows evidenceAccumulatorJob in cron_job_runs with status=success
- [ ] Verify rows_written > 0 on that cron tick
- [ ] Verify FIX-EVIDENCE-PIPELINE-STARVED still PASS (foreignFlowAlertJob + evidence_fragments both work)

---

## Delivery Checklist

- [ ] Root cause documented in commit message (clear explanation of the miss)
- [ ] Fix code reviewed and merged (task/evidence-accumulator-silent-cron-fix → main)
- [ ] OPS rebuilds container post-fix
- [ ] QA re-verifies live cron_job_runs entry with status=success
- [ ] Task marked DONE in task_board only after live cron tick verification
