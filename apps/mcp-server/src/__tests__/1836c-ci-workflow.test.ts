// apps/mcp-server/src/__tests__/1836c-ci-workflow.test.ts
// Task 1836c — GitHub Actions CI Pipeline
// Tests verify .github/workflows/ci.yml exists and contains required configuration.

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Resolve repo root (git worktree root): from apps/mcp-server/src/__tests__/, go up 4 levels
// __tests__ -> src -> mcp-server -> apps -> [worktree root]
const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const CI_WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "ci.yml");

function readWorkflow(): string {
  return readFileSync(CI_WORKFLOW_PATH, "utf-8");
}

describe("Task 1836c — GitHub Actions CI Pipeline", () => {
  // AC-1: .github/workflows/ci.yml file exists
  it("AC-1: .github/workflows/ci.yml exists at repo root", () => {
    expect(existsSync(CI_WORKFLOW_PATH)).toBe(true);
  });

  // AC-2: workflow file contains bun-version-file: .tool-versions
  it("AC-2: workflow uses bun-version-file: .tool-versions (not hardcoded version)", () => {
    const content = readWorkflow();
    expect(content).toContain("bun-version-file: .tool-versions");
  });

  // AC-3: workflow file contains timeout-minutes: 15
  it("AC-3: workflow has timeout-minutes: 15 at job level", () => {
    const content = readWorkflow();
    expect(content).toContain("timeout-minutes: 15");
  });

  // AC-4: workflow file triggers on push and pull_request
  it("AC-4: workflow triggers on push to main", () => {
    const content = readWorkflow();
    expect(content).toContain("push");
    expect(content).toContain("branches: [main]");
  });

  it("AC-4: workflow triggers on pull_request targeting main", () => {
    const content = readWorkflow();
    expect(content).toContain("pull_request");
  });

  // AC-5: workflow file contains --frozen-lockfile
  it("AC-5: workflow uses bun install --frozen-lockfile", () => {
    const content = readWorkflow();
    expect(content).toContain("--frozen-lockfile");
  });
});
