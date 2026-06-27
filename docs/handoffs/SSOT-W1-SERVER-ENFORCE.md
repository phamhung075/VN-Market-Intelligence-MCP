---
task_id: SSOT-W1-SERVER-ENFORCE
sprint: SSOT-INTEGRITY-PERIMETER
wave: 1
rank: 4
type: dev
size: M
zone: apps/mcp-server/
priority: high
owner: dev-mcp-server
depends_on:
  - SSOT-W1-ZOD-SCHEMA-MODEL
created_at: 2026-06-27T16:50:00Z
---

# SSOT-W1-SERVER-ENFORCE

**Current state:** `apps/mcp-server/src/infrastructure/orchStateStore.ts` is ~60% complete. safeParse gate exists but status type has an escape hatch.

**What's shipped:**
- `writeOrchStateAtomic(path, data)` function: reads, applies mutation, writes to temp, renames to live (atomic)
- safeParse call mentioned in code: OrchStateSchema.safeParse(parsed) before any fs operation
- All internal mcp-server writers (task_claim, task_release, coordinationTools, scheduler) route through this function
- CAS retry mechanism (mtime-compare, up to 3 retries) for concurrent writer resilience

**Delta — what this task hardens:**
1. **Status type escape hatch closure (RISK-1):** 
   - Current: `OrchStateTaskBoardTask.status` is typed as `"TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "BLOCKED" | "CANCELLED" | "DEFERRED" | string`
   - The `| string` is an escape hatch allowing any value at compile time
   - Fix: Replace with `z.infer<typeof StatusEnum>` so the interface derives from the schema, not a duplicate definition
   - This moves the status type from 8-value hand-maintained union to 12-value schema-derived type
   - Test: After replacement, code that tries to construct a task with status="PARKED" should fail TypeScript compilation

2. **Verify safeParse before every atomic write:**
   - Audit all callers of `writeOrchStateAtomic()`: task_claim, task_release, coordinationTools, scheduler jobs
   - Confirm each passes data through `OrchStateSchema.safeParse()` BEFORE the atomic write
   - Throws on schema violation BEFORE any writeFileSync/renameSync touches the live file
   - Add inline comments documenting the safeParse check in writeOrchStateAtomic if not present

3. **QA-6 gate (task_claim with bad status throws pre-rename):**
   - Write test that calls task_claim with a task object containing status="PARKED"
   - Verify `writeOrchStateAtomic()` throws an error (via safeParse) BEFORE any rename occurs
   - Verify live orch-state.json is left untouched (unchanged timestamp, content)

4. **QA-7 gate (types compile, tests green):**
   - After status type replacement, verify `tsc` compiles without errors
   - Verify RED 1837a-pipeline-state.test.ts and RED 1980-f2-canon-schema.test.ts pass (or are updated if they had stale expectations)
   - Run full mcp-server test suite: `npm test` or equivalent, all tests green

5. **Reconcile RED 1837a + 1980-f2:**
   - RED 1837a: pipeline-state.test.ts — may have hard-coded status values or type assertions that need updating
   - RED 1980-f2: canon-schema.test.ts — may test the old 8-value enum or hand-synced types
   - After status type replacement: update both tests to use the 12-value StatusEnum or z.infer type
   - Ensure both tests pass post-update

**Acceptance criteria:**
- `OrchStateTaskBoardTask.status` is now `z.infer<typeof StatusEnum>` (12 values, no escape hatch).
- `safeParse()` call verified in writeOrchStateAtomic before any fs operation.
- All callers (task_claim, task_release, coordinationTools, scheduler) route through the gated function.
- QA-6 test passes (bad status throws pre-rename, live file untouched).
- QA-7 test passes (tsc compiles, types correct, full test suite green).
- RED 1837a and 1980-f2 reconciled and passing.
- No TypeScript compilation errors in full project.

**Files touched:**
- `apps/mcp-server/src/infrastructure/orchStateStore.ts` (replace status type, verify safeParse wiring)
- `apps/mcp-server/src/infrastructure/*.test.ts` (update tests for new type, add QA-6/QA-7 gates)

**Depends on:** SSOT-W1-ZOD-SCHEMA-MODEL (StatusEnum + OrchStateSchema must exist).

**Time estimate:** 2h (type replacement, audit all callers, test reconciliation, full suite verification).
