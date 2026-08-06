/**
 * FIX-AGENTBOOTSTRAP-EAGER-EXECSYNC-COLDSTART
 *
 * agentBootstrap.ts used to build its toolName -> registryFn map (probing
 * ~107 tool-registration functions) eagerly and synchronously as a bare
 * top-level `const toolNameMap = buildToolNameMap()` statement — i.e. on
 * EVERY import of this module, including the live MCP server cold-start
 * path (server.ts imports getToolsForSkills) and ~30 test files that
 * transitively import this module for unrelated reasons.
 *
 * The specific blocking call that made this dangerous (registerAgentMemoryTools
 * -> getProjectRoot() -> execSync('git rev-parse --show-toplevel')) was
 * removed in FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT — see
 * projectRoot.test coverage there. This suite guards the OTHER half of the
 * defect class: the eager top-level probe itself, which put the whole
 * module's ES-module Evaluate() step at risk from ANY slow/blocking
 * registryFn (present or future) — a mid-flight failure during that
 * top-level evaluation permanently half-initializes the module for the rest
 * of the process (bun per-file isolation bounds the blast radius to one
 * file; without it, every other importer in the same process is affected).
 *
 * AC-1: agentBootstrap.ts contains no execSync / child_process usage.
 * AC-2: the ~107-fn registry probe (buildToolNameMap) is NOT invoked as a
 *       bare top-level statement — only from inside a function body — so
 *       importing this module can never block on it.
 * AC-3: a bare top-level `const <name> = buildToolNameMap()` pattern is
 *       structurally absent (regression guard against reintroducing the
 *       eager form under a different variable name).
 * AC-4: importing this module resolves near-instantly (cold-start
 *       non-regression guard — proxy for "no expensive work happens at
 *       module-eval time"). Meaningful under bun's per-file CI isolation
 *       (scripts/ci-per-file-isolation.sh — one process per test file),
 *       where this is genuinely the first touch of the module.
 * AC-5: functional correctness preserved — the lazy, memoized probe still
 *       resolves the full ~107-fn registry and repeated calls are stable
 *       (same reference set), matching pre-fix behavior.
 */

import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const AGENT_BOOTSTRAP_SRC = path.resolve(
  import.meta.dir,
  "../interface/mcp/bootstrap/agentBootstrap.ts",
);

/**
 * Strip `/* ... *\/` block comments and `// ...` line comments so source-text
 * guards below assert against actual code, not doc-comment prose that merely
 * *mentions* the pattern being guarded against (this file's own header
 * comment documents the historical execSync call and the removed eager
 * call-site pattern in prose — both would otherwise false-positive).
 * Safe here: agentBootstrap.ts has no "//" inside string literals.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("FIX-AGENTBOOTSTRAP-EAGER-EXECSYNC-COLDSTART", () => {
  it("AC-1: agentBootstrap.ts has no execSync / child_process usage", () => {
    const code = stripComments(fs.readFileSync(AGENT_BOOTSTRAP_SRC, "utf8"));
    expect(code).not.toMatch(/from\s+["']node:?child_process["']/);
    expect(code).not.toMatch(/execSync\s*\(/);
    expect(code).not.toMatch(/spawnSync\s*\(/);
  });

  it("AC-2: buildToolNameMap() is called only from inside a function body, never as a bare top-level statement", () => {
    const code = stripComments(fs.readFileSync(AGENT_BOOTSTRAP_SRC, "utf8"));
    const lines = code.split("\n");
    // Call sites only — exclude the `function buildToolNameMap(...) {` declaration line itself.
    const callSites = lines.filter(
      (l) => l.includes("buildToolNameMap()") && !/^\s*(export\s+)?function\s+buildToolNameMap\b/.test(l),
    );

    // The probe fn must still be called somewhere (functionally required).
    expect(callSites.length).toBeGreaterThan(0);

    // Every call site line must be indented (i.e. nested inside a function/
    // block) — a module top-level statement in this file's style always
    // starts at column 0.
    for (const line of callSites) {
      expect(line).toMatch(/^\s+\S/);
    }
  });

  it("AC-3: no bare top-level `const <name> = buildToolNameMap()` initializer exists (regression guard)", () => {
    const code = stripComments(fs.readFileSync(AGENT_BOOTSTRAP_SRC, "utf8"));
    expect(code).not.toMatch(/^const\s+\w+[^=\n]*=\s*buildToolNameMap\(\)/m);
    expect(code).not.toMatch(/^export\s+const\s+\w+[^=\n]*=\s*buildToolNameMap\(\)/m);
  });

  it("AC-4: importing agentBootstrap.js resolves near-instantly (cold-start non-regression guard)", async () => {
    // Meaningful as a true cold-start measurement under CI's per-file
    // isolation (one bun process per test file — see
    // scripts/ci-per-file-isolation.sh), where this import is the first
    // touch of the module in the process. A budget of 500ms is enormous
    // headroom over the actual cost (module parse + define ~10 functions,
    // no I/O) while still catching a reintroduced blocking call of any
    // real-world magnitude (a shell-out is single-to-double-digit ms at
    // best, seconds at worst under contention).
    const start = performance.now();
    await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(500);
  });

  it("AC-5: lazy probe still resolves the full registry correctly and is stable across repeated calls", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");

    const first = getToolsForSkills(["nonexistent_skill_xyz"]);
    const second = getToolsForSkills(["nonexistent_skill_xyz"]);

    expect(first.length).toBe(toolRegistry.length);
    expect(second.length).toBe(toolRegistry.length);
    // Memoized map -> identical fn references across calls, not just equal length.
    expect(first).toEqual(second);
  });
});
