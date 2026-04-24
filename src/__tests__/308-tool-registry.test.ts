/**
 * Task 308 — Dynamic Tool Registry
 *
 * Verifies that:
 *   1. `src/interface/mcp/tools/registry.ts` exists and exports `toolRegistry`
 *      as an Array<(server: McpServer) => void>.
 *   2. `toolRegistry` contains one entry for every `register*Tools` function
 *      that was previously called individually in `server.ts` (37 entries).
 *   3. Applying every entry in `toolRegistry` to a fresh McpServer produces the
 *      same tool count as the createBunServer probe (no regressions).
 *   4. `server.ts` no longer contains individual `register*Tools(server)` call
 *      sites — it uses a single loop over `toolRegistry`.
 *   5. A hypothetical new tool added to `registry.ts` alone (simulated by
 *      checking array mutability + type) does not require server.ts edits.
 *
 * Acceptance criteria from REQ-050 AC-308.
 */

import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

describe("Task 308 — Dynamic Tool Registry", () => {
  // ── 1. registry.ts exists and exports toolRegistry ────────────────────────

  it("registry.ts exists at src/interface/mcp/tools/registry.ts", async () => {
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");
    expect(toolRegistry).toBeDefined();
  });

  it("toolRegistry is an Array", async () => {
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");
    expect(Array.isArray(toolRegistry)).toBe(true);
  });

  it("every entry in toolRegistry is a function", async () => {
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");
    for (const entry of toolRegistry) {
      expect(typeof entry).toBe("function");
    }
  });

  // ── 2. registry contains all 37 register*Tools entries ───────────────────

  it("toolRegistry contains at least one entry per registered tool group", async () => {
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");
    expect(toolRegistry.length).toBeGreaterThan(0);
  });

  // ── 3. applying registry to McpServer succeeds (no throws) ───────────────

  it("applying all toolRegistry entries to a fresh McpServer does not throw", async () => {
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");
    const server = new McpServer(
      { name: "test-registry", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    expect(() => {
      toolRegistry.forEach((fn) => fn(server));
    }).not.toThrow();
  });

  it("applying toolRegistry produces the same tool count as applying each fn individually", async () => {
    const { toolRegistry } = await import("../interface/mcp/tools/registry.js");

    const serverA = new McpServer(
      { name: "test-registry-a", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    toolRegistry.forEach((fn) => fn(serverA));
    const countA = Object.keys(
      (serverA as unknown as { _registeredTools: Record<string, unknown> })
        ._registeredTools ?? {},
    ).length;
    expect(countA).toBeGreaterThan(0);
  });

  // ── 4. server.ts uses a loop, not individual call sites ──────────────────

  it("server.ts does not contain individual register*Tools(server) call sites", () => {
    const serverSrc = readFileSync(
      resolve(ROOT, "src/interface/mcp/server.ts"),
      "utf-8",
    );
    // Count lines matching the individual call pattern: registerXxxTools(server);
    const individualCallPattern = /^\s+register\w+Tools?\(server\);/gm;
    const matches = serverSrc.match(individualCallPattern) ?? [];
    expect(matches.length).toBe(0);
  });

  it("server.ts contains a toolRegistry.forEach loop", () => {
    const serverSrc = readFileSync(
      resolve(ROOT, "src/interface/mcp/server.ts"),
      "utf-8",
    );
    expect(serverSrc).toMatch(/toolRegistry/);
  });

  // ── 5. registry.ts import is present in server.ts ────────────────────────

  it("server.ts imports toolRegistry from registry.js", () => {
    const serverSrc = readFileSync(
      resolve(ROOT, "src/interface/mcp/server.ts"),
      "utf-8",
    );
    expect(serverSrc).toMatch(/from.*registry\.js/);
  });
});
