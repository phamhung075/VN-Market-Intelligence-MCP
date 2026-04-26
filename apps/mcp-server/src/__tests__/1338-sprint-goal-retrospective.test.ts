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
    const sprintNum = parseInt(firstH2![1]!, 10);
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
