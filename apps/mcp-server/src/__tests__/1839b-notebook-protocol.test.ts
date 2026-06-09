// apps/mcp-server/src/__tests__/1839b-notebook-protocol.test.ts
// Task 1839b — U-7 Agent Notebook Population Protocol
// Verifies: notebooks exist, have content, and are .md format
import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "../../../..");
const NOTEBOOKS_DIR = join(REPO_ROOT, "docs/agent-memory/notebooks");

describe("Task 1839b — Agent Notebook Population Protocol", () => {
  it("AC-1: at least 5 notebook files exist in docs/agent-memory/notebooks/", () => {
    const files = readdirSync(NOTEBOOKS_DIR).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it("AC-2: seeded notebooks (developer, qa, ops, architect, fixer) have content > 50 chars", () => {
    const seeded = ["developer.md", "qa.md", "ops.md", "architect.md", "fixer.md"];
    for (const filename of seeded) {
      const filePath = join(NOTEBOOKS_DIR, filename);
      const content = readFileSync(filePath, "utf-8");
      expect(content.length).toBeGreaterThan(50);
    }
  });

  it("AC-3: notebook files are .md format (gitkeep and .bak excluded)", () => {
    const files = readdirSync(NOTEBOOKS_DIR).filter(
      (f) => f !== ".gitkeep" && !f.endsWith(".bak")
    );
    for (const file of files) {
      const fullPath = join(NOTEBOOKS_DIR, file);
      const stat = statSync(fullPath);
      if (stat.isFile()) {
        expect(file).toMatch(/\.md$/);
      }
    }
  });

  it("AC-4: developer.md notebook has required sections", () => {
    const content = readFileSync(join(NOTEBOOKS_DIR, "developer.md"), "utf-8");
    expect(content).toContain("Last updated:");
    expect(content).toMatch(/^## /m);        // at least one real section heading
    expect(content.length).toBeGreaterThan(200); // substantive content, not scaffold
  });

  it("AC-5: ops.md, architect.md, fixer.md contain real content (not just scaffold placeholders)", () => {
    const toCheck = ["ops.md", "architect.md", "fixer.md"];
    for (const filename of toCheck) {
      const content = readFileSync(join(NOTEBOOKS_DIR, filename), "utf-8");
      // Must not be only scaffold (no "(none recorded)" in patterns section as only content)
      expect(content).not.toMatch(/^# .* — Notebook\n\n\*\*Last updated:\*\* — \| \*\*Sprint:\*\* —/);
      expect(content.length).toBeGreaterThan(100);
    }
  });
});
