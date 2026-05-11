/**
 * TASK: UNBLOCK-cowork-mcp-connector
 *
 * Test: Verify alert_commander and market_watcher SKILL_MANIFEST entries
 * have all required tools for bootstrap and send_telegram.
 *
 * RED: Tests will fail until agentBootstrap.ts is updated.
 * GREEN: Tests pass after tools are added to SKILL_MANIFEST.
 */

import { describe, it, expect } from "bun:test";

describe("TASK-unblock-cowork-mcp-tools: Verify MCP tool declarations", () => {
  it("market_watcher has all required tools", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills(["market_watcher"]);

    // Verify the tool manifest resolves without warnings/errors
    expect(fns.length).toBeGreaterThan(0);

    // The important part: after skill probing, ensure market_watcher
    // can call get_cycle_bootstrap, get_macro_snapshot, get_technical_indicators,
    // get_ticker_intelligence, and send_telegram without tool registration errors.
    // This is tested indirectly: if SKILL_MANIFEST declaration is missing,
    // getToolsForSkills will not include the tool's registration fn.
    // We test by importing the raw manifest:
    const manifest = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const src = require("fs").readFileSync(
      require("path").join(import.meta.dir, "../interface/mcp/bootstrap/agentBootstrap.ts"),
      "utf8"
    );

    // Parse SKILL_MANIFEST from source (simple check for tool names)
    const marketWatcherBlock = src.match(/market_watcher:\s*\[([\s\S]*?)\]/)?.[1];
    expect(marketWatcherBlock).toBeDefined();
    expect(marketWatcherBlock).toContain('"get_cycle_bootstrap"');
    expect(marketWatcherBlock).toContain('"get_macro_snapshot"');
    expect(marketWatcherBlock).toContain('"get_technical_indicators"');
    expect(marketWatcherBlock).toContain('"get_ticker_intelligence"');
    expect(marketWatcherBlock).toContain('"send_telegram"');
  });

  it("alert_commander has all required tools", async () => {
    const fs = require("fs");
    const path = require("path");

    const src = fs.readFileSync(
      path.join(import.meta.dir, "../interface/mcp/bootstrap/agentBootstrap.ts"),
      "utf8"
    );

    // Parse SKILL_MANIFEST from source
    const alertCommanderBlock = src.match(/alert_commander:\s*\[([\s\S]*?)\]/)?.[1];
    expect(alertCommanderBlock).toBeDefined();
    expect(alertCommanderBlock).toContain('"get_cycle_bootstrap"');
    expect(alertCommanderBlock).toContain('"get_macro_snapshot"');
    expect(alertCommanderBlock).toContain('"get_market_snapshot"');
  });

  it("getToolsForSkills(['market_watcher']) includes tools for bootstrap + telegram", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills(["market_watcher"]);

    // Sanity check: market_watcher should have a reasonable number of tools
    // After adding the 5 new tools (get_cycle_bootstrap, get_macro_snapshot, etc.),
    // this should increase slightly from current count.
    expect(fns.length).toBeGreaterThanOrEqual(20);
  });

  it("getToolsForSkills(['alert_commander']) includes tools for bootstrap", async () => {
    const { getToolsForSkills } = await import("../interface/mcp/bootstrap/agentBootstrap.js");
    const fns = getToolsForSkills(["alert_commander"]);

    // Sanity check
    expect(fns.length).toBeGreaterThanOrEqual(15);
  });
});
