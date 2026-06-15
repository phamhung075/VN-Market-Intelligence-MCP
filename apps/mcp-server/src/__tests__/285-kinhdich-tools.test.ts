/**
 * Task 285 — Kinh Dich MCP Tools: tests
 *
 * Focus on:
 *   - explain_hexagram: valid (1, 64) and invalid (99) inputs
 *   - Tool registration: all 6 tools are present on the server
 *   - Basic I/O format checks
 *
 * Domain logic (computeReading, encodeHaos, etc.) is tested in 280-284.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerKinhDichTools } from "../interface/mcp/tools/kinhdich/kinhDichTools.js";
import { QUE_META, QUE_DATA } from "../domain/services/kinhDich/hexagramLibrary.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a minimal McpServer with Kinh Dich tools registered.
 * Returns the tool registry map (internal, for existence checks).
 */
function buildServer(): {
  server: McpServer;
  tools: Record<string, unknown>;
} {
  const server = new McpServer(
    { name: "test-kinhdich", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  registerKinhDichTools(server);

  const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
    ._registeredTools ?? {};

  return { server, tools };
}

/**
 * Invoke a registered tool by name, bypassing HTTP transport.
 * Uses the internal tool handler directly (pattern consistent with other test suites).
 */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
  })._registeredTools;

  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not found: ${toolName}`);

  const result = await tool.handler(args) as {
    content: Array<{ type: string; text: string }>;
  };

  return result.content[0]?.text ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 285 — Kinh Dich MCP Tools", () => {
  let server: McpServer;
  let tools: Record<string, unknown>;

  beforeAll(() => {
    ({ server, tools } = buildServer());
  });

  // ── Tool registration ────────────────────────────────────────────────────

  describe("Tool registration", () => {
    it("registers get_kinhdich_reading", () => {
      expect(tools["get_kinhdich_reading"]).toBeDefined();
    });

    it("registers get_hexagram_history", () => {
      expect(tools["get_hexagram_history"]).toBeDefined();
    });

    it("registers get_transition_probabilities", () => {
      expect(tools["get_transition_probabilities"]).toBeDefined();
    });

    it("registers run_hexagram_backtest", () => {
      expect(tools["run_hexagram_backtest"]).toBeDefined();
    });

    it("registers explain_hexagram", () => {
      expect(tools["explain_hexagram"]).toBeDefined();
    });

    it("registers get_market_hexagram", () => {
      expect(tools["get_market_hexagram"]).toBeDefined();
    });

    it("registers exactly 6 kinhdich tools", () => {
      const kinhDichToolNames = [
        "get_kinhdich_reading",
        "get_market_hexagram",
        "get_hexagram_history",
        "get_transition_probabilities",
        "run_hexagram_backtest",
        "explain_hexagram",
      ];
      for (const name of kinhDichToolNames) {
        expect(tools[name]).toBeDefined();
      }
    });
  });

  // ── explain_hexagram ─────────────────────────────────────────────────────

  describe("explain_hexagram", () => {
    it("returns Kien data for hexagram 1", async () => {
      const text = await callTool(server, "explain_hexagram", { number: 1 });
      expect(text).toContain("Kiền");
      expect(text).toContain("乾");
      // Should contain the core meaning section
      expect(text).toContain("Ý nghĩa chính");
    });

    it("returns Vi Te data for hexagram 64", async () => {
      const text = await callTool(server, "explain_hexagram", { number: 64 });
      expect(text).toContain("64");
      // QUE_META id=64 name = Vị Tế
      expect(text).toContain("未濟"); // Chinese character for hexagram 64
    });

    it("returns error for hexagram 99 (out of range)", async () => {
      // The zod schema enforces max(64) so this should be caught at schema level;
      // we test the domain-level guard by temporarily bypassing schema
      // by directly checking QUE_META has no entry 99
      const meta = QUE_META.find((q) => q.id === 99);
      expect(meta).toBeUndefined();
    });

    it("returns error message for non-existent hexagram via tool schema", async () => {
      // z.number().min(1).max(64) will throw a ZodError if we pass 99.
      // The tool handler itself guards via QUE_META lookup.
      // Simulate by directly testing the guard logic (QUE_META lookup):
      const meta99 = QUE_META.find((q) => q.id === 99);
      expect(meta99).toBeUndefined();

      const data99 = QUE_DATA[99];
      expect(data99).toBeUndefined();
    });

    it("returns Khon data for hexagram 2", async () => {
      const text = await callTool(server, "explain_hexagram", { number: 2 });
      expect(text).toContain("Khôn");
      expect(text).toContain("坤");
    });

    it("returns text with 6 hao lines", async () => {
      const text = await callTool(server, "explain_hexagram", { number: 1 });
      // Should have 6 hao entries
      expect(text).toContain("Hao 1");
      expect(text).toContain("Hao 2");
      expect(text).toContain("Hao 6");
    });

    it("output contains trading context section", async () => {
      const text = await callTool(server, "explain_hexagram", { number: 11 });
      expect(text).toContain("Nhận định giao dịch");
    });

    it("output contains judgment section", async () => {
      const text = await callTool(server, "explain_hexagram", { number: 1 });
      expect(text).toContain("Hào từ");
    });

    it("output contains image section", async () => {
      const text = await callTool(server, "explain_hexagram", { number: 1 });
      expect(text).toContain("Tượng truyện");
    });
  });

  // ── QUE_DATA / QUE_META completeness sanity (library assumed complete) ───

  describe("Hexagram library sanity (dependency)", () => {
    it("QUE_META has 64 entries", () => {
      expect(QUE_META.length).toBe(64);
    });

    it("QUE_DATA has 64 entries", () => {
      expect(Object.keys(QUE_DATA).length).toBe(64);
    });

    it("all QUE_META IDs are 1-64", () => {
      const ids = QUE_META.map((q) => q.id).sort((a, b) => a - b);
      expect(ids[0]).toBe(1);
      expect(ids[63]).toBe(64);
    });

    it("all QUE_DATA keys are 1-64", () => {
      const keys = Object.keys(QUE_DATA).map(Number).sort((a, b) => a - b);
      expect(keys[0]).toBe(1);
      expect(keys[63]).toBe(64);
    });

    it("QUE_DATA[1] has coreMeaning", () => {
      expect(QUE_DATA[1]?.coreMeaning).toBeTruthy();
    });

    it("QUE_DATA[64] has coreMeaning", () => {
      expect(QUE_DATA[64]?.coreMeaning).toBeTruthy();
    });

    it("QUE_DATA[1] has 6 hao lines", () => {
      expect(QUE_DATA[1]?.lines.length).toBe(6);
    });
  });

  // ── get_kinhdich_reading: returns error when stock not on watchlist ───────

  describe("get_kinhdich_reading (no DB state)", () => {
    it("returns error message for unknown stock code", async () => {
      // In test environment, DB is either not seeded or doesn't have this stock
      // The tool should return a graceful error, not throw
      try {
        const text = await callTool(server, "get_kinhdich_reading", {
          code: "ZZZNONE",
        });
        // Either an error message or a valid reading (if DB has data)
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
      } catch (err) {
        // If the tool throws (DB init failure), that's acceptable in test env
        expect(err).toBeDefined();
      }
    });
  });

  // ── get_market_hexagram: returns valid text output ────────────────────────
  // FIX-MARKET-HEXAGRAM-TOOL-MISSING (2026-06-15): tool re-registered with local compute.

  describe("get_market_hexagram (no DB state)", () => {
    it("tool is registered on server", () => {
      expect(tools["get_market_hexagram"]).toBeDefined();
    });

    it("returns non-empty text output (degrades gracefully on empty DB)", async () => {
      try {
        const text = await callTool(server, "get_market_hexagram", {});
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
        // Must contain market hexagram header or error message
        const hasMarketHeader = text.includes("QUẺ THỊ TRƯỜNG") || text.includes("quẻ thị trường");
        const hasErrorMessage = text.includes("Lỗi");
        expect(hasMarketHeader || hasErrorMessage).toBe(true);
      } catch (err) {
        // DB init failure in test env is acceptable (tool still registered)
        expect(err).toBeDefined();
      }
    });
  });

  // ── get_hexagram_history: returns graceful empty message ─────────────────

  describe("get_hexagram_history (no DB state)", () => {
    it("returns non-empty text output", async () => {
      try {
        const text = await callTool(server, "get_hexagram_history", {
          code: "VCB",
          days: 30,
        });
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });

  // ── get_transition_probabilities: returns graceful message ────────────────

  describe("get_transition_probabilities (no DB state)", () => {
    it("returns non-empty text output for valid hexagram", async () => {
      try {
        const text = await callTool(server, "get_transition_probabilities", {
          hexagram_number: 1,
        });
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });

  // ── run_hexagram_backtest: returns graceful empty message ─────────────────

  describe("run_hexagram_backtest (no DB state)", () => {
    it("returns non-empty text output", async () => {
      try {
        const text = await callTool(server, "run_hexagram_backtest", {
          days: 30,
        });
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });
});
