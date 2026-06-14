# Handoff — TASK-FIX-MCP-CRASH-LOOP-D-1

**Sprint:** FIX-MCP-CRASH-LOOP-WRITEWAL  
**Task ID:** D-1  
**Owner:** dev-mcp-server  
**Priority:** MEDIUM (guardrail, after BC-1 deployed)  
**Size:** S (~2h)

---

## Summary

GUARDRAIL: Escalation gate. When WAL file size exceeds 10 MB, inject an escalation signal into `docs/data/orch/orch-state.json` `.signal_queue` via atomic temp-rename write. This gate provides a long-term safety net for ops/triage loop to detect anomalies before a full restart is needed.

---

## Design

**Extend checkWalFileSize():**  
Add an optional `escalateFn?: (walBytes: number) => Promise<void>` parameter to the existing `checkWalFileSize()` function in `checkpoint.ts`. When WAL bytes > 10 MB, after sending the Telegram alert, call `escalateFn` with the WAL size.

**Injection point:**  
The 30-min WAL cron in `startScheduler.ts` passes a concrete escalation closure that reads `docs/data/orch/orch-state.json`, appends a signal object to `.signal_queue`, and writes atomically via temp-rename.

**DDD boundary:**  
The orch-state import/write lives in the scheduler layer (startScheduler.ts), not in the infrastructure layer (checkpoint.ts). Checkpoint.ts remains agnostic of orch-state; it only calls the injected callback.

---

## Files to Modify

### `apps/mcp-server/src/infrastructure/db/checkpoint.ts`

**Change:** Update `checkWalFileSize()` signature and implementation.

**Current signature:**
```typescript
export async function checkWalFileSize(deps?: {
  db?: Database;
  sendFn?: (message: string) => Promise<void>;
}): Promise<{ walBytes: number; alerted: boolean }>;
```

**New signature:**
```typescript
export async function checkWalFileSize(deps?: {
  db?: Database;
  sendFn?: (message: string) => Promise<void>;
  escalateFn?: (walBytes: number) => Promise<void>;
}): Promise<{ walBytes: number; alerted: boolean; escalated?: boolean }>;
```

**Implementation change:**
```typescript
// After Telegram alert is sent (if walBytes > 10MB threshold):
if (walBytes > 10_000_000 && deps?.escalateFn) {
  try {
    await deps.escalateFn(walBytes);
  } catch (err) {
    // Non-fatal: log error but do NOT propagate
    console.error('[checkWalFileSize] escalateFn error:', err);
  }
}
return { walBytes, alerted, escalated: !!deps?.escalateFn && walBytes > 10_000_000 };
```

**Constraint:** No breaking changes to existing callers that don't pass `escalateFn`. The closure is optional.

---

### `apps/mcp-server/src/scheduler/startScheduler.ts`

**Change:** Pass escalation closure to `checkWalFileSize()` in the WAL cron.

**Location:** In the 30-min WAL cron handler.

**Implementation:**
```typescript
const escalateFn = async (walBytes: number) => {
  try {
    // Read current orch-state
    const orchState = JSON.parse(await Bun.file(orchStatePath).text());
    
    // Append signal to signal_queue
    if (!Array.isArray(orchState.signal_queue)) {
      orchState.signal_queue = [];
    }
    orchState.signal_queue.push({
      type: 'WAL_ESCALATION',
      walBytes,
      severity: 'HIGH',
      timestamp: new Date().toISOString(),
      hint: 'WAL file exceeded 10MB; investigate checkpoint stall before next crash',
    });
    
    // Atomic temp-rename write
    const tempPath = orchStatePath + '.wal-escalation.tmp';
    await Bun.write(tempPath, JSON.stringify(orchState, null, 2) + '\n');
    await Bun.sh(`mv "${tempPath}" "${orchStatePath}"`).quiet();
  } catch (err) {
    console.error('[WAL cron] escalateFn write error (non-fatal):', err);
    // Do NOT throw; escalation gate failure does not cascade
  }
};

// Call checkWalFileSize with escalateFn
const result = await checkWalFileSize({ ...deps, escalateFn });
```

**Reuse:** Use existing `jobRunRepo.wrapRun` pattern for error handling and logging.

---

## Files to Create

### `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts`

**Test suite:** 4 unit tests.

1. **Test: escalateFn NOT called when WAL < 10 MB**
   - Mock db to return 5 MB WAL size
   - Pass mock escalateFn to `checkWalFileSize()`
   - Call function
   - Assert escalateFn NOT called
   - Assert escalated=false

2. **Test: escalateFn IS called when WAL > 10 MB**
   - Mock db to return 15 MB WAL size
   - Pass mock escalateFn to `checkWalFileSize()`
   - Call function
   - Assert escalateFn called exactly once
   - Assert escalated=true

3. **Test: escalateFn receives byte count**
   - Mock db to return 15_000_000 bytes
   - Pass mock escalateFn that captures argument
   - Call function
   - Assert escalateFn received 15_000_000 (exact value)

4. **Test: escalateFn error is non-fatal**
   - Mock db to return 15 MB WAL size
   - Pass mock escalateFn that throws error
   - Call function
   - Assert function does NOT throw
   - Assert escalated=true (attempt was made)
   - Assert error is logged (check log capture)

---

## Acceptance Criteria

| AC | Gate |
|---|---|
| Unit: escalateFn called exactly once when WAL > 10 MB | `bun test FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts` (test 2) passes |
| Unit: escalateFn not called when WAL <= 10 MB | `bun test FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts` (test 1) passes |
| Unit: escalateFn error does not propagate (fire-and-forget, non-fatal) | `bun test FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts` (test 4) passes |
| Orch-state write uses temp-rename (no direct overwrite) | Code review: verify `Bun.write(tempPath) + mv` pattern in startScheduler.ts |
| tsc 0 errors | `bun run tsc --noEmit` pre-commit hook passes |

---

## Live-Verify Recipe

After ops deploys (force-recreate):

```bash
# Monitor WAL size for escalation gate trigger
for i in {1..4}; do
  sleep 1h
  WAL_SIZE=$(docker exec vn-market-intelligence-mcp-mcp-server-1 stat -f%z /data/market.db-wal 2>/dev/null || echo 0)
  echo "WAL size: $WAL_SIZE bytes"
done

# If BC-1 is working correctly, WAL should stay < 5 MB
# Expected: no escalation signals written to orch-state.json

# If escalation DOES fire (WAL > 10MB):
jq '.signal_queue[] | select(.type=="WAL_ESCALATION")' docs/data/orch/orch-state.json
# Expected: signal with walBytes, timestamp, severity=HIGH
```

---

## Reuse & Constraints

- **Reuse:** Existing `checkWalFileSize()` infrastructure; extend via optional parameter only.
- **Reuse:** Existing `orchStatePath` variable in startScheduler.ts (no hardcode).
- **Constraint:** Injectable `escalateFn` for testing (mock implementation).
- **Constraint:** Atomic write via temp-rename; never direct orch-state.json overwrite.
- **Constraint:** Error in escalateFn MUST NOT propagate; logged but non-fatal.
- **Constraint:** No new MCP tools, no new domain services.
- **Constraint:** No breaking changes to checkWalFileSize() signature (escalateFn is optional).

---

## Sequence & Dependencies

- **Blocks:** none.
- **Depends on:** BC-1 must be merged and deployed first (escalation gate is redundant while crash loop is running).
- **Can run parallel with:** A-1 (separate cron schedules, different files except startScheduler.ts which has independent code paths).

---

## Dev Notes

- Escalation signal appends to `.signal_queue` array (existing orch-state structure).
- Signal includes `type='WAL_ESCALATION'`, `walBytes`, `severity='HIGH'`, `timestamp`, `hint`.
- WAL threshold is 10 MB (100× the target <5 MB post-fix, provides headroom for anomaly detection).
- Escalation closure is defined inline in the WAL cron handler (no separate file); keeps orch-state logic isolated to scheduler layer.
- Atomic write uses temp-rename pattern matching `project_orch_state_cutover` memory (filesystem atomicity, no jq guard needed since we construct JSON directly).

---

## Brief Reference

Full design: `docs/architecture-briefs/2026-06-14-fix-mcp-crash-loop-writewal.md` (§ 3, Fix-Class D).

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/db/checkpoint.ts` — added 4th optional param `escalateFn?: (walBytes: number) => Promise<void>` to `checkWalFileSize()`; call after Telegram alert when bytes > 10 MB (non-fatal try/catch); return `escalated?: boolean` in response
  - `apps/mcp-server/src/scheduler/startScheduler.ts` — added `appendSignalQueueRow` + `getOrchStatePath` + `getProjectRoot` imports; defined `walEscalateFn` closure (scheduler layer, DDD-clean) that writes `WAL_ESCALATION` signal to orch-state via `appendSignalQueueRow` (atomic CAS with WF-2 retry); passed as 4th arg to `checkWalFileSize()`
- **Tests written:** `apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts` — 7 assertions across 4 describe blocks, GREEN
  - escalateFn NOT called when WAL 5 MB (below threshold)
  - escalated is not true when below threshold
  - escalateFn called exactly once when WAL 15 MB (above threshold)
  - escalated is true when above threshold with escalateFn provided
  - escalateFn receives exact byte count
  - checkWalFileSize does not throw when escalateFn rejects
  - escalated is true when escalateFn throws (attempt was made)
- **Git commits:** [see commit hash below]
- **Type check:** clean (bun tsc --noEmit — exit 0)
- **bun test (targeted):** 37 pass / 0 fail (6 checkpoint test files including new D-1 suite)
- **bun test (full suite):** 12841 pass / 42 skip / 54 fail (54 pre-existing failures in _deprecated/ and unrelated suites; 0 new failures introduced)
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 80 cron.schedule entries (baseline 76 as of FIX-PROJECT-STATS-GENERATED + 4 added by prior tasks; D-1 adds 0 new cron registrations)
- **Docs updated:** `docs/architecture/microservice/mcp-server/testing.md` — added WAL Checkpoint / DB Health table with all 7 checkpoint test files
- **Graphify:** skipped (no architecture graph nodes changed)

**Design note:** `escalateFn` added as 4th positional param (not deps object) to preserve 100% backwards compat with existing 1329b positional callers. Orch-state write reuses `appendSignalQueueRow` (CAS retry, WF-2 protocol) rather than raw `Bun.sh mv` — avoids subprocess dependency and handles concurrent writer collision.

---

## [QA] Review Record

- **Reviewer:** qa
- **Date:** 2026-06-14T07:10Z
- **Verdict:** APPROVED
- **Commit reviewed:** e7289070

**Gate results:**
- TARGETED (D-1 suite): 7 pass / 0 fail — all 4 ACs covered by 7 assertions
- CHECKPOINT SUITE (9 files): 65 pass / 0 fail — zero regression
- TSC (pnpm check): exit 0, 0 errors
- FULL SUITE: 12842 pass / 42 skip / 53 fail — all failures pre-existing (_deprecated/ + TA/MACD integration); 0 introduced by D-1
- DDD: PASS — checkpoint.ts agnostic of orch-state; walEscalateFn closure in scheduler layer; infra→infra import permitted
- SECURITY: PASS — no shell-interpolation of walBytes (structured row, not shell command); no process.env; no secrets
- ATOMIC WRITE (code inspect): PASS — appendSignalQueueRow → writeOrchStateAtomic → writeFileSync(tmp)+renameSync(tmp→target); CAS 3-retry; payload guard validates .head/.task_board/.signal_queue before any fs op
- GENERIC: PASS — threshold is global WAL file size, no per-ticker/per-table coupling
- DESIGN CONFORMANCE: PASS — exceeds spec (CAS retry vs raw Bun.sh mv); non-fatal; DDD boundary enforced; no new cron entries; no new domain services

**Live-verify gate (ops):** rebuild mcp-server --no-deps --force-recreate, then exercise/observe the WAL>10MB escalation path writes an atomic orch-state signal on the named-volume DB, peers intact.
