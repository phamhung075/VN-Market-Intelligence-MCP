import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "../../../../");

describe("Sprint — documentation invariants", () => {
  it("project-stats.json currentSprint is a valid sprint number (>= 1344)", () => {
    const stats = JSON.parse(
      readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8")
    );
    expect(stats.currentSprint).toBeGreaterThanOrEqual(1344);
  });

  it("SPRINT_GOAL.md top active sprint header references a sprint >= 1338", () => {
    const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
    // First H2 heading must reference sprint >= 1338
    const firstH2 = content.match(/^## Sprint (\d+)/m);
    expect(firstH2).not.toBeNull();
    const sprintNum = parseInt(firstH2![1]!, 10);
    expect(sprintNum).toBeGreaterThanOrEqual(1338);
  });

  it("SPRINT_GOAL.md contains retrospective section", () => {
    const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
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
