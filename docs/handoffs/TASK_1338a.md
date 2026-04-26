# TASK 1338a — RED Phase: Failing Validation Tests for Sprint 1338

## Objective

Write failing tests that enforce two invariants before Sprint 1338 documentation is finalized:
1. `SPRINT_GOAL.md` references sprint number >= 1338 in its active section header
2. `docs/data/project-stats.json` has `currentSprint === 1338`

These tests must FAIL on the current state (currentSprint=1336 in stats, SPRINT_GOAL.md top sprint=1327) and PASS only after Task 1338b ships.

---

## Test File

**Location:** `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts`

---

## Test Specification

```typescript
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../../../../");

describe("Sprint 1338 — documentation invariants", () => {
  it("project-stats.json currentSprint equals 1338", () => {
    const stats = JSON.parse(
      readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
    );
    expect(stats.currentSprint).toBe(1338);
  });

  it("SPRINT_GOAL.md top active sprint header references 1338", () => {
    const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
    // First H2 heading must reference sprint >= 1338
    const firstH2 = content.match(/^## Sprint (\d+)/m);
    expect(firstH2).not.toBeNull();
    const sprintNum = parseInt(firstH2![1], 10);
    expect(sprintNum).toBeGreaterThanOrEqual(1338);
  });

  it("SPRINT_GOAL.md contains retrospective section for sprint 1330-1337", () => {
    const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
    // Retrospective block must reference sprints 1330 through 1337
    expect(content).toContain("1330");
    expect(content).toContain("1337");
  });

  it("project-stats.json sprintGoal mentions 1338", () => {
    const stats = JSON.parse(
      readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
    );
    expect(stats.sprintGoal).toContain("1338");
  });
});
```

---

## RED Confirmation

Before Task 1338b runs, `bun test 1338-sprint-goal-retrospective.test.ts` must output 4 failures:
- `currentSprint` will be 1336, not 1338
- first H2 in SPRINT_GOAL.md will be `## Sprint 1327`, sprintNum=1327 < 1338
- SPRINT_GOAL.md will not contain both "1330" and "1337" in a retrospective block
- `sprintGoal` string will not mention "1338"

---

## Handoff

After RED phase confirmed → Developer executes `TASK_1338b.md`.
