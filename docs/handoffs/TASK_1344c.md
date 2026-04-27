# Developer Handoff — Task 1344c: Update Stale Assertions in Sprint Goal Retrospective Test

**Sprint:** 1344
**Date:** 2026-04-27
**Task Size:** S (Small)
**Parallel:** YES — 1344a, 1344b, 1344c run concurrently (no shared files)

---

## Summary

Update three stale test assertions in `1338-sprint-goal-retrospective.test.ts` to match current sprint context (Sprint 1344). Update `project-stats.json` to set `currentSprint: 1344` and update `sprintGoal` string.

**Failures fixed:** 3 (1338-sprint-goal-retrospective.test.ts)
**Files modified:** 2

---

## File 1: `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts`

### Change 1: Update describe block title

Find:
```typescript
describe("Sprint 1338 — documentation invariants", () => {
```

Replace with:
```typescript
describe("Sprint 1344 — documentation invariants", () => {
```

### Change 2: Update currentSprint assertion

Find:
```typescript
it("project-stats.json currentSprint equals 1338", () => {
  const stats = JSON.parse(
    readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
  );
  expect(stats.currentSprint).toBe(1338);
});
```

Replace with:
```typescript
it("project-stats.json currentSprint equals 1344", () => {
  const stats = JSON.parse(
    readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
  );
  expect(stats.currentSprint).toBe(1344);
});
```

### Change 3: Update retrospective section assertion

Find:
```typescript
it("SPRINT_GOAL.md contains retrospective section for sprint 1330-1337", () => {
  const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
  expect(content).toContain("1330");
  expect(content).toContain("1337");
});
```

Replace with:
```typescript
it("SPRINT_GOAL.md contains retrospective section for prior sprints", () => {
  const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
  // Retrospective block references the most recent completed sprint range
  // Current SPRINT_GOAL.md retrospective: "Sprint 1338–1342"
  expect(content).toContain("1338");
  expect(content).toContain("1342");
});
```

### Change 4: Update sprintGoal assertion

Find:
```typescript
it("project-stats.json sprintGoal mentions 1338", () => {
  const stats = JSON.parse(
    readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
  );
  expect(stats.sprintGoal).toContain("1338");
});
```

Replace with:
```typescript
it("project-stats.json sprintGoal mentions current sprint", () => {
  const stats = JSON.parse(
    readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
  );
  expect(stats.sprintGoal).toContain("1344");
});
```

---

## File 2: `docs/data/project-stats.json`

### Change: Update sprint values

Current state (lines 5 + 7):
```json
"currentSprint": 1343,
"sprintGoal": "Sprint 1343 — CRITICAL: Fix BCTC PDF pipeline...",
```

Replace with:
```json
"currentSprint": 1344,
"sprintGoal": "Sprint 1344 — Fix 9 pre-existing test failures",
```

**Context:** Update only these two fields. Do not modify other fields (testBaseline, toolCount, etc.). The lastUpdated timestamp may be refreshed if PM has already touched this file in sprint 1344 init; use the current value as-is if it exists.

---

## Acceptance Criteria

- [ ] `bun test --filter "1338-sprint-goal"` → 4 pass, 0 fail
- [ ] All four test assertions pass:
  - `currentSprint` assertion passes with `1344`
  - `sprintGoal` mentions `1344`
  - Retrospective assertion checks for `1338` and `1342`
  - At least one test still passes (the first check for `sprintNum >= 1338`)
- [ ] `project-stats.json`:
  - `currentSprint: 1344`
  - `sprintGoal` contains `"1344"`
  - No other fields accidentally modified
- [ ] No other test files modified

---

## Notes

- **Test semantics:** This test is being reframed as a "current sprint documentation invariant" test — it verifies that at any point in time, the SPRINT_GOAL.md and project-stats.json are synchronized and reflect the current/recent sprint context. This makes it forward-compatible across future sprints.
- **No new code logic:** This is test + data file updates only. No implementation code modified.
- **DDD layer:** Test file + data file only.

---

## Risk note

If `project-stats.json` was touched by the PM agent in parallel, this task will overwrite those changes. Coordination: PM updates the file first (sprint init), then 1344c developer runs. If truly parallel, coordinate field-level: PM owns `testBaseline`, `toolCount`, etc.; 1344c owns `currentSprint` and `sprintGoal`.

---

## Branch

`task/1344c-sprint-goal-test-fix`

---

## Return block (when done)

```
DONE: Updated 1338-sprint-goal-retrospective.test.ts assertions (describe block title, currentSprint, retrospective range, sprintGoal) + project-stats.json sprint values; 3 failures fixed (1338-stale docs)
NEXT: [qa] task verification
HANDOFF: docs/handoffs/TASK_1344c.md
PIPELINE: continue
```
