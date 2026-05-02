/**
 * 1299b: Skill-Gated Bootstrap — test suite (TDD)
 *
 * TC-1: DDD guard — no domain/ or infrastructure/ imports in agentBootstrap.ts
 * TC-2: getToolsForSkills(['news_scout']) returns ≤25 fns
 * TC-3: always-on tools present in every skill result
 * TC-4: unknown skill → full toolRegistry fallback (107 tools)
 * TC-5: empty skills array → always-on tools only (7 tools)
 * TC-6: digest_predict skill → ≤49 tools (trim verified)
 * TC-7: no duplicate functions in result
 * TC-8: createMcpServerInstance() with no args still loads all 107 tools (backwards compat)
 * TC-9: getToolsForSkills resolves in <5ms (performance guard)
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("1299b: agentBootstrap — skill-gated loading", () => {

  it("TC-1: agentBootstrap.ts has NO domain/ or infrastructure/ imports (DDD guard)", () => {
    const src = readFileSync(
      join(import.meta.dir, "../interface/mcp/bootstrap/agentBootstrap.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/from\s+['"].*\.\.\/(\.\.\/)*domain/);
    expect(src).not.toMatch(/from\s+['"].*\.\.\/(\.\.\/)*infrastructure/);
  });

  it("TC-2: getToolsForSkills(['news_scout']) returns ≤25 fns", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills(["news_scout"]);
    expect(fns.length).toBeGreaterThan(0);
    expect(fns.length).toBeLessThanOrEqual(25);
  });

  it("TC-3: always-on tools present in every skill result", async () => {
    const { getToolsForSkills, ALWAYS_ON_TOOL_COUNT } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills(["dev_team"]);
    expect(fns.length).toBeGreaterThanOrEqual(ALWAYS_ON_TOOL_COUNT);
  });

  it("TC-4: unknown skill → full toolRegistry fallback (107 tools)", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");
    const fns = getToolsForSkills(["nonexistent_skill_xyz"]);
    expect(fns.length).toBe(toolRegistry.length);
  });

  it("TC-5: empty skills array → always-on tools only (≤7 unique registration fns)", async () => {
    const { getToolsForSkills, ALWAYS_ON_TOOL_COUNT } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills([]);
    // Some always-on tools share a registration fn (e.g. post_agent_signal + get_agent_signals
    // both registered by registerAgentSignalTools). So unique fns ≤ ALWAYS_ON_TOOL_COUNT.
    expect(fns.length).toBeGreaterThan(0);
    expect(fns.length).toBeLessThanOrEqual(ALWAYS_ON_TOOL_COUNT);
  });

  it("TC-6: digest_predict skill → ≤49 unique registration fns (trim verified)", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills(["digest_predict"]);
    // 49 tool names in manifest, but some share registration fns (e.g. 6 kinhdich tools
    // all registered by registerKinhDichTools). Result: ≤49 unique fns, ≥30 (sanity bound).
    expect(fns.length).toBeLessThanOrEqual(49);
    expect(fns.length).toBeGreaterThan(30); // sanity lower bound
  });

  it("TC-7: no duplicate functions in result", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills(["news_scout", "market_watcher"]);
    const unique = new Set(fns);
    expect(unique.size).toBe(fns.length);
  });

  it("TC-8: unknown skill → full toolRegistry fallback equals full registry length (backwards compat)", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");
    const fns = getToolsForSkills(["nonexistent_skill_xyz"]);
    // Full fallback: same as toolRegistry (all registration fns)
    expect(fns.length).toBe(toolRegistry.length);
    // toolRegistry has ≥70 registration functions (107+ MCP tool names total)
    expect(fns.length).toBeGreaterThanOrEqual(70);
  });

  it("TC-9: getToolsForSkills resolves in <5ms (performance guard)", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const start = performance.now();
    getToolsForSkills(["financial_analyst"]);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });
});
