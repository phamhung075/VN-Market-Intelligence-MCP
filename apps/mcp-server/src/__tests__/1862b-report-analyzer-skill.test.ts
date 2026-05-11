// apps/mcp-server/src/__tests__/1862b-report-analyzer-skill.test.ts
// Task 1862b — FIX: report-analyzer agent missing from SKILL_MANIFEST enum
//
// Acceptance criteria:
//   AC-1: SKILL_MANIFEST has a "report_analyzer" key
//   AC-2: getToolsForSkills(["report_analyzer"]) returns non-empty fns (not fallback)
//   AC-3: report_analyzer skill includes get_cycle_bootstrap (always-on), get_bctc_full,
//          get_earnings_calendar, post_agent_signal, log_agent_work
//   AC-4: unknown-skill fallback NOT triggered for "report_analyzer"
//         (fallback = full toolRegistry length; known skill = smaller set)
//   AC-5: no duplicate functions in result

import { describe, it, expect } from "bun:test";

describe("Task 1862b — report_analyzer in SKILL_MANIFEST", () => {

  it("AC-1: SKILL_MANIFEST contains report_analyzer key (source guard)", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const src = readFileSync(
      join(import.meta.dir, "../interface/mcp/bootstrap/agentBootstrap.ts"),
      "utf8"
    );
    expect(src).toContain("report_analyzer:");
  });

  it("AC-2: getToolsForSkills(['report_analyzer']) returns non-empty result", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills(["report_analyzer"]);
    expect(fns.length).toBeGreaterThan(0);
  });

  it("AC-3: result is smaller than full toolRegistry (not unknown-skill fallback)", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");
    const fns = getToolsForSkills(["report_analyzer"]);
    // If report_analyzer were unknown, it would equal toolRegistry.length (fallback)
    expect(fns.length).toBeLessThan(toolRegistry.length);
  });

  it("AC-4: no duplicate registration functions in report_analyzer result", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills(["report_analyzer"]);
    const unique = new Set(fns);
    expect(unique.size).toBe(fns.length);
  });

  it("AC-5: report_analyzer skill tools resolve correctly via probing (key tools present)", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");

    const fns = getToolsForSkills(["report_analyzer"]);

    // Probe what tool names are registered
    const registeredNames: string[] = [];
    const fakeServer = {
      tool(name: string, _desc: string, _schema: unknown, _handler?: unknown) {
        registeredNames.push(name);
      },
      registerTool(name: string, _opts: unknown) {
        registeredNames.push(name);
      },
    } as unknown as InstanceType<typeof McpServer>;

    for (const fn of fns) {
      try { void fn(fakeServer); } catch {}
    }

    // Core tools from the report-analyzer tools package must be registered
    expect(registeredNames).toContain("get_cycle_bootstrap");
    expect(registeredNames).toContain("get_bctc_full");
    expect(registeredNames).toContain("get_earnings_calendar");
    expect(registeredNames).toContain("post_agent_signal");
    expect(registeredNames).toContain("log_agent_work");
    expect(registeredNames).toContain("submit_feedback");
  });
});
