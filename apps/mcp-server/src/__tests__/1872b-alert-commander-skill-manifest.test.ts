/**
 * Task 1872b — alert_commander skill manifest includes write_alert_verdict
 *
 * Root cause: SKILL_MANIFEST["alert_commander"] was missing "write_alert_verdict"
 * so skill-gated sessions never received the tool, causing BUG telegram at 06:04 UTC.
 *
 * Two scenarios:
 *   (a) write_alert_verdict present in alert_commander manifest
 *   (b) getToolsForSkills(["alert_commander"]) resolves a registration fn for it
 */

import { describe, it, expect } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getToolsForSkills } from "../interface/mcp/bootstrap/agentBootstrap.js";

describe("1872b — alert_commander skill manifest includes write_alert_verdict", () => {
  // (a) The resolved fns for alert_commander include one that registers write_alert_verdict
  it("(a) getToolsForSkills(['alert_commander']) resolves write_alert_verdict registration fn", () => {
    const fns = getToolsForSkills(["alert_commander"]);

    // Probe each fn with a fake server to collect registered tool names
    const registeredNames: string[] = [];
    const fakeServer = {
      tool(name: string) {
        registeredNames.push(name);
      },
      registerTool(name: string) {
        registeredNames.push(name);
      },
    } as unknown as McpServer;

    for (const fn of fns) {
      try {
        fn(fakeServer);
      } catch {
        // ignore side-effect errors in probe mode
      }
    }

    expect(registeredNames).toContain("write_alert_verdict");
  });

  // (b) write_alert_verdict appears alongside core alert_commander tools
  it("(b) alert_commander skill also retains record_signal_outcome + mark_alert_read", () => {
    const fns = getToolsForSkills(["alert_commander"]);

    const registeredNames: string[] = [];
    const fakeServer = {
      tool(name: string) {
        registeredNames.push(name);
      },
      registerTool(name: string) {
        registeredNames.push(name);
      },
    } as unknown as McpServer;

    for (const fn of fns) {
      try {
        fn(fakeServer);
      } catch {
        // ignore
      }
    }

    expect(registeredNames).toContain("record_signal_outcome");
    expect(registeredNames).toContain("mark_alert_read");
    expect(registeredNames).toContain("write_alert_verdict");
  });
});
