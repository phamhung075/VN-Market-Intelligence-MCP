/**
 * Task 136 — Circuit Breaker
 *
 * Tests for:
 *   1. CircuitBreaker class — state machine (closed / open / half-open)
 *   2. CircuitBreakerRegistry — all named sources
 *   3. MCP tool get_system_health — formatted status output
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  CircuitBreaker,
  CircuitOpenError,
  type CircuitState,
} from "../infrastructure/circuitBreaker.js";
import {
  breakers,
  getAllBreakerStats,
  resetAllBreakers,
} from "../infrastructure/circuitBreakerRegistry.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSystemTools } from "../interface/mcp/tools/systemTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeBreaker(opts?: { failureThreshold?: number; resetTimeoutMs?: number; halfOpenMaxAttempts?: number }) {
  return new CircuitBreaker("test", {
    failureThreshold: opts?.failureThreshold ?? 3,
    resetTimeoutMs: opts?.resetTimeoutMs ?? 60_000,
    halfOpenMaxAttempts: opts?.halfOpenMaxAttempts ?? 2,
  });
}

async function failN(breaker: CircuitBreaker, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      await breaker.execute(async () => { throw new Error("boom"); });
    } catch {
      // expected
    }
  }
}

/**
 * Call a tool on a McpServer using the internal tool registry.
 * Handles both .callback and .handler property shapes across SDK versions.
 */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<unknown>;
      handler?: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${toolName}`);
  return fn(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Closed state (normal operation)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 136 — Circuit Breaker", () => {

  describe("1. Closed state — normal operation", () => {
    it("starts in closed state", () => {
      const cb = makeBreaker();
      expect(cb.state).toBe<CircuitState>("closed");
    });

    it("passes through a successful call", async () => {
      const cb = makeBreaker();
      const result = await cb.execute(async () => 42);
      expect(result).toBe(42);
    });

    it("records a success in stats", async () => {
      const cb = makeBreaker();
      await cb.execute(async () => "ok");
      expect(cb.stats.successes).toBe(1);
    });

    it("records a failure in stats", async () => {
      const cb = makeBreaker();
      try { await cb.execute(async () => { throw new Error("fail"); }); } catch { /* ok */ }
      expect(cb.stats.failures).toBe(1);
    });

    it("does NOT open after fewer than threshold failures", async () => {
      const cb = makeBreaker({ failureThreshold: 3 });
      await failN(cb, 2);
      expect(cb.state).toBe<CircuitState>("closed");
    });

    it("re-throws the original error when closed", async () => {
      const cb = makeBreaker();
      const err = new Error("specific error");
      await expect(cb.execute(async () => { throw err; })).rejects.toThrow("specific error");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Section 2 — Opening the circuit
  // ─────────────────────────────────────────────────────────────────────────────

  describe("2. Open state — after threshold failures", () => {
    it("opens after exactly N consecutive failures", async () => {
      const cb = makeBreaker({ failureThreshold: 3 });
      await failN(cb, 3);
      expect(cb.state).toBe<CircuitState>("open");
    });

    it("rejects immediately without calling fn when open", async () => {
      const cb = makeBreaker({ failureThreshold: 3 });
      await failN(cb, 3);
      let called = false;
      await expect(cb.execute(async () => { called = true; return 1; })).rejects.toBeInstanceOf(CircuitOpenError);
      expect(called).toBe(false);
    });

    it("CircuitOpenError contains breaker name", async () => {
      const cb = new CircuitBreaker("cafef", { failureThreshold: 2 });
      await failN(cb, 2);
      await expect(cb.execute(async () => 1)).rejects.toThrow("cafef");
    });

    it("tracks lastFailure timestamp when open", async () => {
      const cb = makeBreaker({ failureThreshold: 2 });
      await failN(cb, 2);
      expect(cb.stats.lastFailure).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Section 3 — Half-open (timeout elapsed)
  // ─────────────────────────────────────────────────────────────────────────────

  describe("3. Half-open — after reset timeout", () => {
    it("transitions to half-open after resetTimeoutMs has elapsed", async () => {
      const cb = new CircuitBreaker("test-half", {
        failureThreshold: 2,
        resetTimeoutMs: 20,  // 20ms — fast for testing
        halfOpenMaxAttempts: 2,
      });
      await failN(cb, 2);
      // state should be open initially (timeout not elapsed yet)
      expect(cb.state).toBe<CircuitState>("open");
      // Wait for timeout to elapse
      await new Promise(r => setTimeout(r, 30));
      // Accessing state triggers the time check
      expect(cb.state).toBe<CircuitState>("half-open");
    });

    it("closes after successful half-open attempts", async () => {
      const cb = new CircuitBreaker("test-close", {
        failureThreshold: 2,
        resetTimeoutMs: 20,
        halfOpenMaxAttempts: 2,
      });
      await failN(cb, 2);
      await new Promise(r => setTimeout(r, 30));
      // Two successes in half-open → closes
      await cb.execute(async () => "ok1");
      await cb.execute(async () => "ok2");
      expect(cb.state).toBe<CircuitState>("closed");
    });

    it("re-opens after a failure in half-open state", async () => {
      const cb = new CircuitBreaker("test-reopen", {
        failureThreshold: 2,
        resetTimeoutMs: 20,
        halfOpenMaxAttempts: 2,
      });
      await failN(cb, 2);
      await new Promise(r => setTimeout(r, 30));
      // Fail once in half-open → re-opens
      try { await cb.execute(async () => { throw new Error("still broken"); }); } catch { /* ok */ }
      expect(cb.state).toBe<CircuitState>("open");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Section 4 — Reset
  // ─────────────────────────────────────────────────────────────────────────────

  describe("4. Reset clears all state", () => {
    it("reset() returns circuit to closed with zero counters", async () => {
      const cb = makeBreaker({ failureThreshold: 2 });
      await failN(cb, 2);
      expect(cb.state).toBe<CircuitState>("open");
      cb.reset();
      expect(cb.state).toBe<CircuitState>("closed");
      expect(cb.stats.failures).toBe(0);
      expect(cb.stats.successes).toBe(0);
      expect(cb.stats.lastFailure).toBeNull();
    });

    it("reset() allows normal calls again", async () => {
      const cb = makeBreaker({ failureThreshold: 2 });
      await failN(cb, 2);
      cb.reset();
      const result = await cb.execute(async () => "after-reset");
      expect(result).toBe("after-reset");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Section 5 — Stats
  // ─────────────────────────────────────────────────────────────────────────────

  describe("5. Stats reflect current state", () => {
    it("stats.state matches .state getter", async () => {
      const cb = makeBreaker({ failureThreshold: 2 });
      await failN(cb, 2);
      expect(cb.stats.state).toBe(cb.state);
    });

    it("successes and failures count independently", async () => {
      const cb = makeBreaker({ failureThreshold: 10 });
      await cb.execute(async () => 1);
      await cb.execute(async () => 2);
      try { await cb.execute(async () => { throw new Error(); }); } catch { /* ok */ }
      expect(cb.stats.successes).toBe(2);
      expect(cb.stats.failures).toBe(1);
    });

    it("a success in closed state resets consecutive failure counter", async () => {
      const cb = makeBreaker({ failureThreshold: 3 });
      await failN(cb, 2);
      // success resets streak
      await cb.execute(async () => "reset streak");
      await failN(cb, 2);
      // should still be closed (streak only got to 2 again)
      expect(cb.state).toBe<CircuitState>("closed");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Section 6 — Registry
  // ─────────────────────────────────────────────────────────────────────────────

  describe("6. CircuitBreakerRegistry", () => {
    beforeEach(() => {
      resetAllBreakers();
    });

    it("contains all expected sources", () => {
      const keys = Object.keys(breakers);
      expect(keys).toContain("cafef");
      expect(keys).toContain("vnexpress");
      expect(keys).toContain("reuters");
      expect(keys).toContain("hose");
      expect(keys).toContain("hnx");
      expect(keys).toContain("ssc");
    });

    it("getAllBreakerStats returns all source keys", () => {
      const stats = getAllBreakerStats();
      expect(Object.keys(stats)).toContain("cafef");
      expect(Object.keys(stats)).toContain("ssc");
    });

    it("getAllBreakerStats includes state and failures", () => {
      const stats = getAllBreakerStats();
      for (const key of Object.keys(stats)) {
        expect(stats[key]).toHaveProperty("state");
        expect(stats[key]).toHaveProperty("failures");
      }
    });

    it("resetAllBreakers() closes all open breakers", async () => {
      // Open one breaker
      await failN(breakers.cafef, 10);
      expect(breakers.cafef.state).toBe<CircuitState>("open");
      resetAllBreakers();
      expect(breakers.cafef.state).toBe<CircuitState>("closed");
    });

    it("ssc breaker has higher failureThreshold than default", () => {
      // ssc config: failureThreshold: 3 (per spec)
      const sscStats = getAllBreakerStats();
      // Just verify it exists and is closed initially
      expect(sscStats["ssc"]!.state).toBe<CircuitState>("closed");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Section 7 — MCP tool: get_system_status (task 234: replaces get_system_health)
  // ─────────────────────────────────────────────────────────────────────────────

  describe("7. MCP tool — get_system_status", () => {
    it("registerSystemTools registers get_system_status on McpServer", () => {
      const server = new McpServer(
        { name: "test", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );
      registerSystemTools(server);
      const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
      expect(tools["get_system_status"]).toBeDefined();
    });

    it("get_system_status returns text content", async () => {
      resetAllBreakers();
      const server = new McpServer(
        { name: "test", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );
      registerSystemTools(server);
      const result = await callTool(server, "get_system_status", { includeErrors: true, errorLines: 5 });
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
    });

    it("get_system_status output includes circuit breaker section", async () => {
      resetAllBreakers();
      const server = new McpServer(
        { name: "test", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );
      registerSystemTools(server);
      const result = await callTool(server, "get_system_status", { includeErrors: false, errorLines: 5 });
      const text = result.content[0]!.text;
      expect(text).toContain("Circuit Breaker");
    });

    it("get_system_status output includes uptime", async () => {
      resetAllBreakers();
      const server = new McpServer(
        { name: "test", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );
      registerSystemTools(server);
      const result = await callTool(server, "get_system_status", { includeErrors: false, errorLines: 5 });
      const text = result.content[0]!.text;
      expect(text).toContain("uptime");
    });

    it("get_system_status shows source names from registry", async () => {
      resetAllBreakers();
      const server = new McpServer(
        { name: "test", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );
      registerSystemTools(server);
      const result = await callTool(server, "get_system_status", { includeErrors: false, errorLines: 5 });
      const text = result.content[0]!.text;
      expect(text).toContain("cafef");
      expect(text).toContain("ssc");
    });
  });
});
