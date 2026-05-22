/**
 * Lint test: no-local-project-root — Task 1965d
 *
 * Asserts that no file under apps/mcp-server/src/scheduler/ uses the
 * anti-pattern `resolve(import.meta.dir, ...traversal...)` as a local
 * projectRoot helper.
 *
 * All callers must use the canonical:
 *   import { getProjectRoot } from "../../infrastructure/projectRoot.js"
 *
 * This test FAILS pre-fix (tasksMdJanitorJob.ts:501 still has the pattern)
 * and PASSES post-fix.
 *
 * Reference fix: commit 2f0a74e9 (dailyDashboardJob — same anti-pattern).
 */

import { describe, it, expect } from "bun:test";
import path from "node:path";
import fs from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively collect all .ts files under a directory.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Anti-pattern regex:
 *   `resolve(import.meta.dir,` followed optionally by whitespace/newline + a traversal string.
 *
 * Matches the pattern:
 *   const projectRoot = resolve(import.meta.dir, "..", "..", ...)
 *
 * Two-pass: check for resolve(import.meta.dir, on same line, OR across the full source.
 */
const ANTI_PATTERN = /resolve\(import\.meta\.dir\s*,\s*["']\.\./;

// ─────────────────────────────────────────────────────────────────────────────
// Scan zone
// ─────────────────────────────────────────────────────────────────────────────

describe("Lint: no-local-project-root anti-pattern in scheduler/", () => {
  it("AC-2: zero occurrences of resolve(import.meta.dir, '../..') in apps/mcp-server/src/scheduler/", () => {
    // Compute scheduler dir relative to this test file location:
    // __tests__/lint/ → up 2 → src/ → scheduler/
    const thisDir = import.meta.dir; // .../src/__tests__/lint
    const schedulerDir = path.resolve(thisDir, "../../scheduler");

    const tsFiles = collectTsFiles(schedulerDir);

    expect(tsFiles.length).toBeGreaterThan(0); // guard: directory must have files

    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (ANTI_PATTERN.test(line)) {
          violations.push({ file: path.relative(schedulerDir, file), line: i + 1, text: line.trim() });
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line} → ${v.text}`)
        .join("\n");
      // Fail with a descriptive message listing all offending locations
      expect(
        `Found ${violations.length} anti-pattern occurrence(s):\n${msg}`,
      ).toBe("Found 0 anti-pattern occurrences.");
    }

    expect(violations.length).toBe(0);
  });
});
