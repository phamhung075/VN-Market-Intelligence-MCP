/**
 * 1338-sprint-goal-retrospective.test.ts — OSC-2 migration
 *
 * OSC-2: re-pointed from docs/SPRINT_GOAL.md → docs/data/orch/orch-state.json .sprint_goal.
 *
 * Tests verify docs/data/orch/orch-state.json .sprint_goal section exists and
 * has at least one entry with a non-empty sprint_id — the structural invariant
 * previously enforced by the SPRINT_GOAL.md header regex.
 *
 * Tests operate on the REAL committed orch-state.json (read-only, no mutation).
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../../../../");

interface SprintGoalEntry {
  sprint_id: string;
  vision?: string;
  status?: string;
}

interface OrchStateSprint {
  sprint_goal?: {
    entries?: SprintGoalEntry[];
  };
}

describe("Sprint — documentation invariants", () => {
  it("project-stats.json currentSprint is a valid sprint number (>= 1344)", () => {
    const stats = JSON.parse(
      readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
    );
    // currentSprint may be a plain number OR an object with a .number field
    // (the latter was introduced when the field was expanded with sprint metadata)
    const sprintNum =
      typeof stats.currentSprint === "number"
        ? stats.currentSprint
        : typeof stats.currentSprint === "object" && stats.currentSprint !== null
          ? (stats.currentSprint as { number?: number }).number ?? 0
          : 0;
    expect(sprintNum).toBeGreaterThanOrEqual(1344);
  });

  it("orch-state.json .sprint_goal has at least one entry with a non-empty sprint_id", () => {
    // OSC-2: replaces SPRINT_GOAL.md ## Sprint N header check
    const orchState = JSON.parse(
      readFileSync(join(ROOT, "docs/data/orch/orch-state.json"), "utf-8")
    ) as OrchStateSprint;

    const entries = orchState.sprint_goal?.entries ?? [];
    expect(entries.length).toBeGreaterThanOrEqual(1);

    // First entry must have a non-empty sprint_id
    const firstEntry = entries[0];
    expect(firstEntry).toBeDefined();
    expect(typeof firstEntry!.sprint_id).toBe("string");
    expect(firstEntry!.sprint_id.length).toBeGreaterThan(0);
  });

  it.skip("SPRINT_GOAL.md contains retrospective section", () => {
    // SKIPPED: SPRINT_GOAL.md deleted in OSC-2 — completed sprints are marked
    // CLOSED in orch-state.json .sprint_goal.entries[].status without a separate
    // retrospective block. This invariant reflects an older doc format that was retired.
    const content = readFileSync(join(ROOT, "docs/SPRINT_GOAL.md"), "utf-8");
    expect(content).toContain("Retrospective");
  });

  it("project-stats.json sprintGoal is a non-empty string", () => {
    const stats = JSON.parse(
      readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
    );
    expect(typeof stats.sprintGoal).toBe("string");
    expect(stats.sprintGoal.length).toBeGreaterThan(0);
  });
});
