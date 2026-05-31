<!-- size-justification: 200L — task handoff for test suite creation; input arch blueprint + spec + 12 BLOCKING ACs; output bun:test file with 13 DV test cases (unit + integration stubs); RED→GREEN pattern enforced -->

# TASK P1-DEV-7 — Create Test Suite `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts`

**Sprint:** DWF-PHASE1
**Task ID:** P1-DEV-7
**Assigned zone:** test-harness (mcp-server zone, but tests scripts/agents-flow/ logic — zero mcp-server production code under test)
**Estimated:** ~3h (13 test cases: unit + integration stubs; RED→GREEN proof for each)
**Status:** READY
**Precondition:** P1-DEV-1 (cadence-policy.json), P1-DEV-2 (cadence-policy.js), P1-DEV-3 (cowork-match-slots.js), P1-DEV-4 (cowork-schedule.json)

---

## Input

- `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md` § Test Strategy (T-1..T-13 matrix + DV proofs)
- `docs/REQ_DYN-WF-PHASE1.md` § § 9 Acceptance Criteria Summary (all 12 BLOCKING ACs + NFR-P1-1)
- `scripts/agents-flow/cadence-policy.js` (evaluator module to import and test)
- `docs/data/cadence-policy.json` (policy data to load in tests)

---

## Deliverable

**File:** `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts`

A comprehensive Bun test suite with 13 test cases, each with explicit RED→GREEN proof:

```typescript
import { test, expect } from "bun:test";
// Node resolve path from apps/mcp-server/ to scripts/agents-flow/
const { evaluateCadence, loadCadencePolicy, computeTiers, isStale } = require('../../../../scripts/agents-flow/cadence-policy.js');

// T-1: AC-P1-1-1 — Policy lookup returns correct interval
// T-2: AC-P1-1-2 — holiday+chef-intraday → null (suppress)
// T-3: AC-P1-1-3 — Unmatched policy/state → 240 (safe default)
// T-4: AC-P1-2-1 — policy_id: null → cron fallback (no regression)
// T-5: AC-P1-3-1 — last_fired=null → always due (first-run)
// T-6: AC-P1-3-2 — last_fired T-50min, cadence=60 → NOT due
// T-7: AC-P1-3-3 — last_fired T-65min, cadence=60 → IS due
// T-8: AC-P1-3-4 — Output schema includes due_reason + cadence_minutes
// T-9: AC-P1-6-2 — emitted_at staleness threshold (25min→stale, 18min→fresh)
// T-10: AC-P1-6-3 — stale_warning flag overrides age check
// T-11: AC-P1-1-2 variant + OQ-P1-3 — bctc-offmarket holiday/weekend/open rules
// T-12: EC-6 audit — No open+chef-intraday rule suppresses (all have interval_minutes != null)
// T-13: AC-P1-7-1 / AC-P1-7-2 / AC-P1-7-3 (integration stubs) — last_fired file write

[13 test cases with assertions, RED proof idea, RED→GREEN verification]
```

---

## Acceptance Criteria

**AC-P1-1-1 (BLOCKING):** Test T-1 asserts policy lookup with `calendar_status="open"`, `signal_backlog=8`, `volatility="high"`, `policy_id="gatherer-standard"` returns `interval_minutes=60`.
- RED proof: Remove the `medium/*` rule from cadence-policy.json → T-1 asserts wrong interval (240) → test fails
- GREEN proof: Rule present → returns 60 → test passes

**AC-P1-1-2 (BLOCKING):** Test T-2 asserts holiday+chef-intraday → null.
- RED proof: Remove holiday rule → no null returned → test fails
- GREEN proof: Rule present → returns null → test passes

**AC-P1-1-3 (BLOCKING):** Test T-3 asserts unmatched rule → 240.
- RED proof: Assert unmatched returns null → test fails
- GREEN proof: Returns 240 → test passes

**AC-P1-2-1 (BLOCKING):** Test T-4 asserts policy_id=null slot behaves like pre-Phase-1 (legacy cron match).
- RED proof: Remove cron field from null-policy slot → test fails
- GREEN proof: Cron field present → test passes

**AC-P1-3-1 (BLOCKING):** Test T-5 asserts last_fired=null → always due (first-run).
- RED proof: Assert first-run slot NOT included in output → test fails
- GREEN proof: First-run slot included → test passes

**AC-P1-3-2 (BLOCKING):** Test T-6 asserts elapsed=50min, cadence=60 → NOT due.
- RED proof: Assert slot IS due → test fails
- GREEN proof: Slot not due → test passes

**AC-P1-3-3 (BLOCKING):** Test T-7 asserts elapsed=65min, cadence=60 → IS due.
- RED proof: Assert slot NOT due → test fails
- GREEN proof: Slot due → test passes

**AC-P1-3-4 (BLOCKING):** Test T-8 asserts output schema includes `due_reason` and `cadence_minutes`.
- RED proof: Strip `due_reason` → schema parse fails or matcher logic breaks → test fails
- GREEN proof: Schema complete → test passes

**AC-P1-6-2 (BLOCKING):** Test T-9 asserts staleness threshold = 20 minutes.
- RED proof: Assert 25-min-old NOT stale → test fails; assert 18-min-old IS stale → test fails
- GREEN proof: 25-min → stale=true, 18-min → stale=false → test passes

**AC-P1-6-3 (BLOCKING):** Test T-10 asserts stale_warning=true overrides age.
- RED proof: Set stale_warning=false + old age → expect isStale=true (age-based) only → test fails if stale_warning is the only gate
- GREEN proof: stale_warning=true + recent emitted_at → isStale=true → test passes

**AC-P1-1-2 variant (BLOCKING, OQ-P1-3):** Test T-11 asserts bctc-offmarket policy.
- holiday → null (suppress)
- weekend → 1440 (once/day)
- open/half_day/unknown → _cron_fallback=true (legacy)
- RED proof: Assert weekend returns null → test fails
- GREEN proof: Weekend → 1440, open → _cron_fallback=true → test passes

**EC-6 audit (BLOCKING, NFR-P1-1 implicit):** Test T-12 asserts no open+chef-intraday rule has null interval.
- RED proof: Inject null-open rule → test goes RED
- GREEN proof: All open+chef-intraday rules have interval_minutes != null → test passes

**AC-P1-7-1/2/3 (BLOCKING, integration stubs):** Tests T-13/13b/13c for last_fired write.
- T-13: Successful spawn → last_fired written with correct timestamp
- T-13b: Failed spawn → last_fired NOT written
- T-13c: Write failure → non-fatal, spawn already happened
- RED proofs: Same pattern (assert opposite behavior → RED)
- GREEN proofs: Correct behavior → GREEN
- **Note:** These are integration tests requiring file-system access. Stub implementations with mocked fs or temp file paths. Full integration tested in P1-QA.

---

## Files to Modify

**CREATE:**
- `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` (~350 lines: 13 test blocks + setup/teardown + helper functions)

---

## Implementation Notes

1. **Import path:** 
   ```typescript
   const { evaluateCadence, loadCadencePolicy, computeTiers, isStale } = require('../../../../scripts/agents-flow/cadence-policy.js');
   ```
   Adjust relative path from test file location if needed. Verify path traversal is correct (7 levels: `apps/mcp-server/src/__tests__/` → `./../../../../scripts/agents-flow/`).

2. **Test structure (RED→GREEN pattern):**
   - Each test has two sub-cases:
     - RED case: assert the opposite of correct behavior (e.g., wrong interval, missing rule) → must FAIL
     - GREEN case: correct behavior → must PASS
   - OR: use `test.todo()` for the RED case (marked as deliberate failure probe, not run by default)
   - OR: comment the RED case with a description of what would break it

   **Recommended:** Include both RED (commented or in test.skip) and GREEN in source code for clarity, but only GREEN runs in normal test suite. PM doc should note "each test has implicit RED proof idea" rather than doubling test count.

3. **Mocking pressure-state and cadence-policy:**
   - Load real `cadence-policy.json` from disk via `loadCadencePolicy()`
   - Construct test `pressure_state` objects in memory (no file I/O for unit tests)
   - Example:
     ```typescript
     const pressureState = {
       emitted_at: "2026-05-31T12:00:00Z",
       stale_warning: false,
       signal_backlog: 8,
       last_volatility_level: "high",
       calendar_status: "open"
     };
     ```

4. **Timestamp handling:**
   - Use `new Date().getTime()` for current time (milliseconds)
   - Parse ISO8601 via `new Date("2026-05-31T12:00:00Z").getTime()`
   - Elapsed seconds = `(now_ms - emitted_ms) / 1000`

5. **Test case structure:**
   ```typescript
   test("T-1: AC-P1-1-1 gatherer-standard open/medium → 60", () => {
     const policyObj = loadCadencePolicy();
     const result = evaluateCadence("gatherer-standard", "open", "medium", "*", policyObj);
     expect(result.interval_minutes).toBe(60);
   });
   ```

6. **Integration tests (T-13/13b/13c):**
   - Stub file operations with mocked `fs` or use temp directory (bun test has temp file API)
   - Example structure:
     ```typescript
     test("T-13: AC-P1-7-1 last_fired written after successful spawn", async () => {
       // Mock cowork-schedule.json read/write
       // Simulate WON_SLOTS = [slot1, slot2]
       // Call the "batched last_fired write" logic (extracted as a helper function or inline)
       // Verify TEMP.json contents before rename
       // Verify FINAL.json contents after rename
       // Assert last_fired field matches FIRED_AT timestamp
     });
     ```

7. **Bun test syntax:**
   - `import { test, expect } from "bun:test"` (Bun built-in)
   - `test(name, fn)` or `test(name, { skip, only }, fn)`
   - `expect(value).toBe(expected)`, `expect(value).toEqual(obj)`, `expect(fn).toThrow()`
   - No Vitest/Jest incompatibilities — Bun test is Jest-compatible

8. **Type hints (TypeScript):**
   - Use JSDoc comments for cadence-policy.js functions (the evaluator is CommonJS, not TS)
   - Or cast evaluator results in test via `as any` / `as CadenceResult`

---

## Test Mapping (13 Tests → 12 BLOCKING ACs + 1 NFR)

| Test ID | AC / NFR | Description | DV Proof Type |
|---|---|---|---|
| T-1 | AC-P1-1-1 | Policy lookup: gatherer-standard open/medium → 60 | Assert wrong interval → RED |
| T-2 | AC-P1-1-2 | holiday+chef-intraday → null (suppress) | Remove rule → RED |
| T-3 | AC-P1-1-3 | Unmatched rule → 240 (safe default) | Assert null → RED |
| T-4 | AC-P1-2-1 | policy_id=null → cron fallback (no regression) | Remove cron → RED |
| T-5 | AC-P1-3-1 | last_fired=null → always due (first-run) | Assert not included → RED |
| T-6 | AC-P1-3-2 | elapsed=50min, cadence=60 → NOT due | Assert due → RED |
| T-7 | AC-P1-3-3 | elapsed=65min, cadence=60 → IS due | Assert not due → RED |
| T-8 | AC-P1-3-4 | Output schema: due_reason + cadence_minutes | Strip field → RED |
| T-9 | AC-P1-6-2 | Staleness threshold 20min (25→stale, 18→fresh) | Reverse age → RED |
| T-10 | AC-P1-6-3 | stale_warning=true overrides age | Set to false → RED (via age only) |
| T-11 | OQ-P1-3 | bctc-offmarket: holiday→null, weekend→1440, open→fallback | Assert weekend→null → RED |
| T-12 | EC-6 audit | No open+chef-intraday rule has null interval | Inject null rule → RED |
| T-13 | AC-P1-7-1/2/3 | last_fired file write (atomic, non-fatal on failure) | Assert not written; write fails but spawn proceeds → RED |

---

## Zone & Dependencies

**Zone:** test-harness (mcp-server zone for harness reuse; zero production code under test)
**Depends on:** P1-DEV-1, P1-DEV-2, P1-DEV-3, P1-DEV-4 (files must exist to be tested)
**Blocks:** None (test suite is standalone, runs in P1-QA verification step)
**Parallel-run with:** P1-DEV-5, P1-DEV-6 (no blocking interdependency; can run in parallel after DEV-1..4 complete)

---

## Success Criteria

- [ ] File `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` created
- [ ] 13 test cases present (T-1 through T-13, or T-13a/b/c for integration split)
- [ ] All tests use bun:test runner
- [ ] All tests import cadence-policy.js correctly
- [ ] All 13 DV proofs documented (RED proof idea listed for each test)
- [ ] Test suite runs: `bun test apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts`
- [ ] All tests GREEN (pass) after P1-DEV-1..4 complete
- [ ] All tests RED if corresponding rule/logic removed (manual verification for PM/QA)
- [ ] Committed to `main`

---

## RETURN

```
ZONE: test-harness
FILE_COUNT: 1 (CREATE)
LINES: ~350
BLOCKING_ACS: 12 (AC-P1-1-1/1-2/1-3/2-1/3-1/3-2/3-3/3-4/6-2/6-3 + OQ-P1-3 + EC-6)
DV_TESTS: 13 (T-1..T-13; each with RED proof idea)
DEPENDS_ON: P1-DEV-1, P1-DEV-2, P1-DEV-3, P1-DEV-4
PARALLEL_WITH: P1-DEV-5, P1-DEV-6 (after DEV-1..4)
```
