import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../../../../");

describe("Sprint 1344 — documentation invariants", () => {
  it("project-stats.json currentSprint equals 1344", () => {
    const stats = JSON.parse(
      readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
    );
    expect(stats.currentSprint).toBe(1344);
  });

  it("SPRINT_GOAL.md top active sprint header references 1338", () => {
    const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
    // First H2 heading must reference sprint >= 1338
    const firstH2 = content.match(/^## Sprint (\d+)/m);
    expect(firstH2).not.toBeNull();
    const sprintNum = parseInt(firstH2![1]!, 10);
    expect(sprintNum).toBeGreaterThanOrEqual(1338);
  });

  it("SPRINT_GOAL.md contains retrospective section for prior sprints", () => {
    const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
    // Retrospective block references the most recent completed sprint range
    // Current SPRINT_GOAL.md retrospective: "Sprint 1338–1342"
    expect(content).toContain("1338");
    expect(content).toContain("1342");
  });

  it("project-stats.json sprintGoal mentions current sprint", () => {
    const stats = JSON.parse(
      readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
    );
    expect(stats.sprintGoal).toContain("1344");
  });
});
