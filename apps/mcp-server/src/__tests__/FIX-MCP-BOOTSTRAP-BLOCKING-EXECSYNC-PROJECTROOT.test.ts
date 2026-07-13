/**
 * FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT
 *
 * projectRoot.ts previously resolved the monorepo root via a synchronous
 * `execSync("git rev-parse --show-toplevel")` child_process shell-out —
 * a blocking call on the MCP server bootstrap hot path (probed synchronously
 * by agentBootstrap.ts's buildToolNameMap() for every registryFn, including
 * registerAgentMemoryTools/registerAgentMemoryUpdateTools, which call
 * getProjectRoot() during registration).
 *
 * This suite asserts:
 *   AC-1: no child_process/execSync/git dependency remains in the source
 *         (regression guard — the whole point of the fix).
 *   AC-2: getProjectRoot() resolves to the true monorepo root (same absolute
 *         path `git rev-parse --show-toplevel` would have produced in a
 *         normal checkout), verified independently via this test file's own
 *         on-disk location plus the presence of root-only sentinels.
 *   AC-3: repeated calls return the identical value and complete near-
 *         instantly — proxy for "memoized, no per-call blocking work"
 *         (a real execSync child_process spawn would make N repeated calls
 *         measurably slow; a memoized fs walk-up does not).
 */

import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { getProjectRoot } from "../infrastructure/projectRoot.js";

const PROJECT_ROOT_SRC = path.resolve(import.meta.dir, "../infrastructure/projectRoot.ts");

describe("FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT", () => {
  it("AC-1: source no longer imports child_process / execSync (no blocking shell-out)", () => {
    const source = fs.readFileSync(PROJECT_ROOT_SRC, "utf8");
    // Check actual import/call syntax (not prose in the doc-comment explaining
    // what used to be here) — regression guard against reintroducing the
    // blocking shell-out this task removed.
    expect(source).not.toMatch(/from\s+["']node:?child_process["']/);
    expect(source).not.toMatch(/execSync\s*\(/);
  });

  it("AC-2: getProjectRoot() resolves to the monorepo root (matches git rev-parse --show-toplevel in a normal checkout)", () => {
    // Independent expectation computed from THIS test file's own location:
    // __tests__ → src → mcp-server → apps → monorepo root = 4 levels up.
    const expectedRoot = path.resolve(import.meta.dir, "../../../..");

    const resolved = getProjectRoot();

    expect(resolved).toBe(expectedRoot);
    expect(resolved).not.toBe("/");

    // Root-only sentinels — only present at the true monorepo root, never
    // inside apps/mcp-server/ (which only has symlinks to these).
    expect(fs.existsSync(path.join(resolved, "pnpm-workspace.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(resolved, ".git"))).toBe(true);
    expect(fs.existsSync(path.join(resolved, "docs/data/project-stats.json"))).toBe(true);
  });

  it("AC-3: repeated calls are memoized — identical value, no per-call blocking work", () => {
    const first = getProjectRoot();

    const start = performance.now();
    let last = first;
    for (let i = 0; i < 5000; i++) {
      last = getProjectRoot();
    }
    const elapsedMs = performance.now() - start;

    expect(last).toBe(first);
    // A real execSync child_process spawn takes single-to-double-digit
    // milliseconds EACH; 5000 of them would take seconds. A memoized fs
    // walk-up (or even a fresh cheap walk) completes in low single-digit ms.
    expect(elapsedMs).toBeLessThan(200);
  });
});
