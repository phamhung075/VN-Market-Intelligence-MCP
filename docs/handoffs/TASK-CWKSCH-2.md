---
sprint: FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER
branch: fix/CWKSCH-2-dwf-test-upgrade
size: M
zone: apps/mcp-server/src/__tests__/
depends_on: ["TASK-CWKSCH-1"]
blocks: []
---

## TLDR
Upgrade `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts` with two changes: (1) update the inline `batchWriteLastFired()` helper function to include the FR-4 monotonic guard (3 lines added to the update loop), and (2) add a new describe block with 3 sub-tests (T-14, T-14b, T-14c) that directly exercise the concurrent-writer scenario. The T-14b test is the mandatory RED proof: without the guard, T-14b fails (slot reverts to stale value); with the guard, T-14b passes (slot stays fresh). Update file header comment test count from 13 to 16.

## [PM] Planning Context

### Zone
- **Zone:** `apps/mcp-server/src/__tests__/`
- **Build-standard:** Test-only (no production mcp-server code change)

### Acceptance Criteria
- [ ] `batchWriteLastFired` helper (lines 503–524) upgraded: add 3-line monotonic guard inside the for-loop
- [ ] Guard: `if currentLastFired === null OR firedAt > currentLastFired` before assigning `slot.last_fired = firedAt`
- [ ] T-14 test added: Writer-A (stale base, owns slot-a) does NOT clobber Writer-B's slot-b (both slots persist after write)
- [ ] T-14b test added (MANDATORY RED PROOF): adversarial case where stale stamp is REJECTED by guard → slot stays fresh
- [ ] T-14c test added: null first-run case → always write (NFR-4)
- [ ] T-14b is the critical guard verification — removing the guard makes T-14b RED, proving the guard works
- [ ] File header comment test count updated: "13 tests" → "16 tests"
- [ ] All 3 new tests GREEN with guard in place, T-14b RED without guard
- [ ] `tsc` clean, `bun test` all tests pass

### Files to read first
- `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts:1-30` — file header, test count comment on line 16
- `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts:503-524` — current `batchWriteLastFired` helper (to upgrade)
- `docs/architecture-briefs/2026-06-18-cowork-schedule-stale-base-clobber.md:75-208` — exact T-14 test shape + pseudocode template
- `docs/handoffs/FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER-BA-spec.md:102-110` — FR-6 concurrent-writer test requirement

### Files to modify
- `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts:16` — header comment: "13 tests" → "16 tests"
- `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts:503-524` — upgrade `batchWriteLastFired` helper with monotonic guard
- `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts:end` — add T-14/T-14b/T-14c describe block after T-13c

### Files to create
- None (modify existing test file only)

### Dependencies
- TASK-CWKSCH-1 (flow-doc update must complete first to understand the guard semantics)
- Existing test framework: `bun test`, `fs`, `path`, `os` modules already imported
- Existing helper pattern: `batchWriteLastFired` is the canonical TypeScript replica of Step 5b in last-fired.md

### Knowledge needed
- `docs/architecture-briefs/2026-06-18-cowork-schedule-stale-base-clobber.md` § T-14 Test Shape
- FR-4 monotonic guard semantics (ISO-8601 lexicographic compare)
- RED proof concept: T-14b must fail without guard to demonstrate guard effectiveness
- Test isolation: use `os.tmpdir()` for temp files, clean up with `fs.unlinkSync`

### Verification
1. Run `bun test` locally in `apps/mcp-server/`: all 16 tests GREEN
2. Temporarily comment out the guard condition (line ~96) in `batchWriteLastFired` and re-run tests: T-14b must RED, proving the guard works
3. Restore guard and re-run: all GREEN
4. Run `tsc` to verify no TypeScript errors
5. Verify header comment now says "16 tests" (was "13")

---

## Context

### Root Cause (Reference)
`docs/data/cowork-schedule.json` writer holds a STALE in-memory snapshot and writes the entire file back, clobbering fresher `last_fired` timestamps. The monotonic guard (FR-4) prevents this by making the write forward-only: never decrease a slot's `last_fired` value.

### Why This Test
The concurrent-writer scenario is the direct verification of FR-4. Two simulated writers (Writer-A stale base, Writer-B live timestamp) must BOTH persist correctly after the fix. T-14 tests single-slot persistence; T-14b (the RED proof) tests the guard blocking a stale stamp to a different slot; T-14c (NFR-4) tests first-run null handling.

### Architecture Rationale
- **ARCH-RATIFY-CWKSCH-1 resolved:** T-14 in SAME file (DWF-phase1-cadence.test.ts). The `batchWriteLastFired` helper is inline; modifying it in-place avoids orphaning the helper from its test consumers.
- **T-14 test location:** after T-13c (same describe block or new describe block for this concurrent-writer scenario)
- **RED proof (RISK-1):** T-14 alone is GREEN even without guard (Writer-A only mutates slot-a). T-14b is mandatory because it explicitly tests the guard-rejection case. PM propagates this risk to the developer.
- **Test count SSOT (RISK-3):** header comment must be updated (was "13 tests", now "16 tests" after 3 new tests)

### Risk Flags
**RISK-1 — T-14 alone is GREEN without guard:** Only T-14b validates the guard. Developer must add all 3 sub-tests; removing T-14b or the guard makes the verification incomplete.

**RISK-3 — test count comment must be updated:** Line 16 of the file says "13 tests". After T-14/T-14b/T-14c ship, it becomes "16". This is a SSOT (single source of truth) that CI/scripts may rely on.

---

## Handoff Notes

**Developer:** dev-mcp-server (owns apps/mcp-server zone)

**AC Trailer:** When complete, commit with:
```
Task: TASK-CWKSCH-2
AC: batchWriteLastFired upgraded with FR-4 guard; T-14/T-14b/T-14c tests added; header comment 13→16; all tests GREEN; T-14b RED without guard (proof)
```

**Dependency chain:** TASK-CWKSCH-1 (flow-doc) must complete before this; no other tasks depend on this (it blocks nothing).

**Test execution:** Run `cd apps/mcp-server && bun test` to verify all 16 tests GREEN.

**RED proof step (do NOT skip):**
1. Run `bun test` with guard in place → all GREEN (baseline)
2. Temporarily remove or comment out lines ~96-98 (the guard condition)
3. Run `bun test` again → T-14b MUST RED (proving guard is load-bearing)
4. Restore the guard
5. Run `bun test` one more time → all GREEN again (final confirmation)

If T-14b does NOT red when guard is removed, the guard condition is not load-bearing and the test is insufficient. Do NOT commit without a RED proof.

---

## [QA] Review Record

**verdict:** APPROVED | **impl-commit:** 30b9a7f8 | **date:** 2026-06-18

- G1 TARGETED 51/0 (DWF-phase1-cadence.test.ts --no-cache, 409ms)
- G2 T-14b RED-without-guard INDEPENDENTLY REPRODUCED: 50/1 (only T-14b: received STALE_A, expected FIRED_B); guard restored → 51/0
- G3 FULL SUITE ci-per-file-isolation.sh 16: 13159/42 skip/40 fail; 12 failing files DISJOINT from commit
- G4 TSC exit 0
- G5 DDD PASS, G6 SECURITY PASS, G7 SMART-SKIP (test-only + flow-doc)
- G8 DIFF: guard scoped to WON_SLOTS only; null explicit; fresh-read+atomic-rename untouched
- G9 VERIFICATION GATE: T-14 + T-14b = both-slots-persist + monotonic confirmed
- DJ: sprint-FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER-qa.md

---

## [Developer] Implementation Notes

### Step 1: Upgrade `batchWriteLastFired` Helper

Current function (lines ~503-524):
```typescript
function batchWriteLastFired(...): {...} {
  // ...
  for (const slot of schedule.slots) {
    if (wonSet.has(slot.slot_id)) {
      slot.last_fired = firedAt;  // ← unconditional write (UNSAFE)
    }
  }
  // ...
}
```

Updated function (add 3 lines of guard):
```typescript
function batchWriteLastFired(
  scheduleFilePath: string,
  wonSlotIds: string[],
  firedAt: string
): { success: boolean; error?: string } {
  const tmpPath = scheduleFilePath + ".tmp";
  try {
    const raw = fs.readFileSync(scheduleFilePath, "utf8");
    const schedule = JSON.parse(raw);
    const wonSet = new Set(wonSlotIds);
    for (const slot of schedule.slots) {
      if (wonSet.has(slot.slot_id)) {
        const currentLastFired: string | null = slot.last_fired;
        // FR-4 monotonic guard: never decrease last_fired
        if (currentLastFired === null || firedAt > currentLastFired) {
          slot.last_fired = firedAt;
        }
        // else: live file already has a fresher stamp — leave unchanged
      }
    }
    fs.writeFileSync(tmpPath, JSON.stringify(schedule, null, 2));
    fs.renameSync(tmpPath, scheduleFilePath);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
```

### Step 2: Add T-14/T-14b/T-14c Tests

Add a new describe block after T-13c:

```typescript
describe("T-14: FR-4 — Concurrent different-slot writers: both slots persist after stale-base write", () => {
  test("T-14: Writer-A (stale base, owns slot-a) does NOT clobber Writer-B's slot-b", () => {
    // [Test implementation from architecture brief — see AC requirement file for full code]
    // Key assertions:
    // - expect(after.slots[0].last_fired).toBe(FIRED_A);   // slot-a: written
    // - expect(after.slots[1].last_fired).toBe(FIRED_B);   // slot-b: NOT clobbered
  });

  test("T-14b: Monotonic guard blocks explicit stale-base clobber attempt on a slot", () => {
    // [Test implementation from architecture brief]
    // Key assertion: expect(after.slots[0].last_fired).toBe(FIRED_B);  // guard blocked stale write
    // RED PROOF: Remove the guard → T-14b fails (slot reverts to STALE_A)
  });

  test("T-14c: null last_fired (first-run) → always write regardless of guard", () => {
    // [Test implementation from architecture brief]
    // Key assertion: expect(after.slots[0].last_fired).toBe(FIRED_AT);  // NFR-4: null → always write
  });
});
```

See `docs/architecture-briefs/2026-06-18-cowork-schedule-stale-base-clobber.md:111-202` for the complete test code.

### Step 3: Update Header Comment

Find line ~16 in the file header:
```
// → 13 tests: T-1..T-13c
```
Change to:
```
// → 16 tests: T-1..T-13c, T-14, T-14b, T-14c
```

### Step 4: Verify and Test

1. Save file.
2. Run `cd apps/mcp-server && bun test` → expect all 16 tests GREEN.
3. Run RED proof (see Handoff Notes).
4. Run `tsc` to verify no TypeScript errors.
5. Commit with AC trailer.

---

## Critical Notes

**DO NOT SKIP THE RED PROOF:** T-14b is only useful if it RED when the guard is removed. This is how we know the guard is load-bearing and the test is valid.

**Test isolation:** Each test creates a temp file in `os.tmpdir()` and cleans up with `fs.unlinkSync`. No test should interfere with others.

**Lexicographic comparison:** ISO-8601 UTC strings compare correctly without Date parsing (e.g., "2026-06-18T03:00:00Z" > "2026-06-18T02:00:00Z"). No special handling needed.

**Non-fatal contract:** The guard is inside the try block. Write failure returns `{ success: false, error }`. The contract is unchanged.
