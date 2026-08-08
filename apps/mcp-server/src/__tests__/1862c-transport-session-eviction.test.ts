/**
 * Task 1862c-F: SseSessionManager structured 404 + heartbeat eviction
 * Extended for FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER (T6-T12):
 * design brief docs/architecture-briefs/2026-08-07-fix-mcp-sse-session-manager-reaper.md
 *
 * AC-1: 404 returns { error: "session_not_found", sessionId }
 * AC-2: heartbeat failure evicts session from sessions Map
 * AC-3: heartbeat failure clears heartbeat interval
 * AC-4: handleMessage after eviction returns 404
 *
 * T6-T12 (2026-08-08): assert every eviction trigger (res.close, heartbeat-fail,
 * idle-reap, max-age-reap, DELETE/closeSession) also calls mcpServer.close() —
 * the bare local `mcpServer` (transport.ts:95, pre-fix) was never closed by any
 * path, which is this row's root cause. T9 is a negative control proving
 * handleMessage()'s lastActivityAt bump actually resets the idle clock.
 *
 * Mock strategy: mock.module() (bun:test) for SSEServerTransport.
 * Timer strategy: pass small _heartbeatIntervalMs/_idleTimeoutMs/_maxAgeMs/
 * _reaperIntervalMs so real timers fire fast; await a short delay to let them tick.
 */

import { describe, it, expect, mock, afterAll, beforeEach } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";

// ─────────────────────────────────────────────────────────────────────────────
// Module mock — SSEServerTransport + McpServer
//
// mock.module() is called at module scope so the mock is in place before
// transport.js is imported (Bun resolves top-level await imports at module
// evaluation time, which precedes beforeAll). The afterAll restore() tears
// down the process-level cache patch after this file's tests complete,
// preventing cascade leakage to subsequent test files. Without restore(),
// every subsequent file inherits a McpServer with no .tool() method,
// causing ~269 cascade failures (brief #2 hypothesis being tested).
// ─────────────────────────────────────────────────────────────────────────────

mock.module("@modelcontextprotocol/sdk/server/sse.js", () => ({
  SSEServerTransport: class MockSSEServerTransport {
    sessionId = "test-session-001";
    handlePostMessage = mock(async () => {});
    constructor(_endpoint: string, _res: ServerResponse) {}
  },
}));

mock.module("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class MockMcpServer {
    // Option A: make the leaked mock harmless by exposing all methods that
    // downstream test files invoke on McpServer instances.
    //
    // mock.restore() does NOT undo mock.module() ESM replacements in Bun
    // (restore() only rolls back mock() spies). This mock therefore leaks
    // into every test file loaded after 1862c in the same worker process.
    // Adding full no-op stubs ensures downstream files that call
    // server.tool() / server.registerTool() never throw "is not a function",
    // and _registeredTools is populated so callTool() helpers can invoke
    // handlers correctly.

    _registeredTools: Record<string, { handler: (...args: unknown[]) => unknown }> = {};

    // Underlying Server stub (accessed via server.server in some tool files)
    server = {
      setRequestHandler: mock((..._args: unknown[]) => {}),
    };

    connect = mock(async () => {});
    close = mock(async () => {});
    isConnected = mock(() => false);

    // server.tool(name, [description], [schema], handler) — last arg is handler
    tool = mock((...args: unknown[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as (...a: unknown[]) => unknown;
      this._registeredTools[name] = { handler };
      return { enabled: true, enable: () => {}, disable: () => {}, remove: () => {} };
    });

    // server.registerTool(name, config, handler)
    registerTool = mock((...args: unknown[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as (...a: unknown[]) => unknown;
      this._registeredTools[name] = { handler };
      return { enabled: true, enable: () => {}, disable: () => {}, remove: () => {} };
    });
  },
}));

afterAll(() => {
  mock.restore();
});

// Import SUT AFTER mock.module() so Bun resolves the mocked versions
const { SseSessionManager } = await import("../interface/mcp/transport.js");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeRes(capturedBody: { value: string }): ServerResponse {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    writeHead: mock(() => {}),
    end: mock((body: string) => {
      capturedBody.value = body;
    }),
    write: mock(() => true),
    getHeader: mock(() => undefined),
    setHeader: mock(() => {}),
    headersSent: false,
  }) as unknown as ServerResponse;
}

function makeWriteThrowingRes(): ServerResponse {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    writeHead: mock(() => {}),
    end: mock(() => {}),
    write: mock(() => { throw new Error("EPIPE: broken pipe"); }),
    getHeader: mock(() => undefined),
    setHeader: mock(() => {}),
    headersSent: false,
  }) as unknown as ServerResponse;
}

function makeReq(): IncomingMessage {
  return new EventEmitter() as unknown as IncomingMessage;
}

function makeLogger() {
  return {
    info: mock((..._args: unknown[]) => {}),
    warn: mock((..._args: unknown[]) => {}),
    error: mock((..._args: unknown[]) => {}),
    debug: mock((..._args: unknown[]) => {}),
  };
}

/**
 * Mock McpServerFactory that records every constructed instance so tests can
 * assert directly on `.close()` calls — the whole point of T6-T12 (the
 * pre-fix bug was that no eviction path ever called mcpServer.close() at all).
 */
interface MockMcpServerInstance {
  connect: ReturnType<typeof mock>;
  close: ReturnType<typeof mock>;
}

function makeFactory(): { factory: () => MockMcpServerInstance; instances: MockMcpServerInstance[] } {
  const instances: MockMcpServerInstance[] = [];
  const factory = () => {
    const instance: MockMcpServerInstance = {
      connect: mock(async () => {}),
      close: mock(async () => {}),
    };
    instances.push(instance);
    return instance;
  };
  return { factory, instances };
}

/** Wait long enough for a 5ms heartbeat interval (or other small timer) to fire. */
function waitForHeartbeat(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

/** Wait long enough for a small idle/max-age reaper window to sweep. */
function waitForReaper(ms = 40): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("1862c-F: SseSessionManager — structured 404 + heartbeat eviction", () => {
  // T1 ──────────────────────────────────────────────────────────────────────
  it("handleMessage with unknown sessionId returns 404 with {error:'session_not_found', sessionId}", async () => {
    const { factory } = makeFactory();
    const manager = new SseSessionManager(factory as any, makeLogger() as any);
    const capturedBody = { value: "" };
    const res = makeRes(capturedBody);

    await manager.handleMessage(makeReq(), res, "unknown-session");

    expect(res.writeHead).toHaveBeenCalledWith(404, { "Content-Type": "application/json" });
    const body = JSON.parse(capturedBody.value);
    expect(body).toEqual({ error: "session_not_found", sessionId: "unknown-session" });
  });

  // T2 ──────────────────────────────────────────────────────────────────────
  it("handleMessage unknown sessionId — error field is exact code 'session_not_found' (not a string interpolation)", async () => {
    const { factory } = makeFactory();
    const manager = new SseSessionManager(factory as any, makeLogger() as any);
    const capturedBody = { value: "" };
    const res = makeRes(capturedBody);

    await manager.handleMessage(makeReq(), res, "bad-id");

    const body = JSON.parse(capturedBody.value);
    expect(body.error).toBe("session_not_found");
    // Must NOT contain the old interpolated format
    expect(body.error).not.toContain("Session not found:");
    expect(body.error).not.toContain("bad-id");
  });

  // T3 ──────────────────────────────────────────────────────────────────────
  it("heartbeat failure evicts session from sessions Map", async () => {
    // Use 5ms heartbeat so the interval fires within the 30ms wait
    const { factory } = makeFactory();
    const manager = new SseSessionManager(factory as any, makeLogger() as any, "", 5);
    const sseRes = makeWriteThrowingRes();

    await manager.handleSse(makeReq(), sseRes);

    // Session should be registered before heartbeat fires
    expect(manager.sessionCount).toBe(1);

    // Wait for heartbeat to fire and evict the session
    await waitForHeartbeat();

    expect(manager.sessionCount).toBe(0);
  });

  // T4 ──────────────────────────────────────────────────────────────────────
  it("heartbeat failure clears heartbeat interval (no further log calls after eviction)", async () => {
    const log = makeLogger();
    // 5ms heartbeat — fires fast
    const { factory } = makeFactory();
    const manager = new SseSessionManager(factory as any, log as any, "", 5);
    const sseRes = makeWriteThrowingRes();

    await manager.handleSse(makeReq(), sseRes);

    // First tick — fires, throws, evicts, clears interval
    await waitForHeartbeat();

    const logCallsAfterFirstTick = (log.info as ReturnType<typeof mock>).mock.calls.length;

    // Wait another full interval window — if interval NOT cleared, heartbeat fires again
    await waitForHeartbeat();
    const logCallsAfterSecondWindow = (log.info as ReturnType<typeof mock>).mock.calls.length;

    // No additional heartbeat log calls — interval is cleared
    expect(logCallsAfterSecondWindow).toBe(logCallsAfterFirstTick);
  });

  // T5 ──────────────────────────────────────────────────────────────────────
  it("handleMessage after heartbeat eviction returns 404", async () => {
    const { factory } = makeFactory();
    const manager = new SseSessionManager(factory as any, makeLogger() as any, "", 5);
    const sseRes = makeWriteThrowingRes();

    await manager.handleSse(makeReq(), sseRes);

    // Wait for heartbeat failure to evict the session
    await waitForHeartbeat();

    // Now POST to the evicted session
    const capturedBody = { value: "" };
    const postRes = makeRes(capturedBody);

    await manager.handleMessage(makeReq(), postRes, "test-session-001");

    expect(postRes.writeHead).toHaveBeenCalledWith(404, { "Content-Type": "application/json" });
    const body = JSON.parse(capturedBody.value);
    expect(body.error).toBe("session_not_found");
  });

  // T6 ──────────────────────────────────────────────────────────────────────
  it("T6: res.on('close') firing calls mcpServer.close() — the root-cause path", async () => {
    const { factory, instances } = makeFactory();
    const manager = new SseSessionManager(factory as any, makeLogger() as any);
    const capturedBody = { value: "" };
    const res = makeRes(capturedBody);

    await manager.handleSse(makeReq(), res);
    expect(manager.sessionCount).toBe(1);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.close).not.toHaveBeenCalled();

    // Simulate the client disconnecting — fires the "close" event on res
    (res as unknown as EventEmitter).emit("close");
    await waitForReaper(10);

    expect(manager.sessionCount).toBe(0);
    expect(instances[0]!.close).toHaveBeenCalledTimes(1);
  });

  // T7 ──────────────────────────────────────────────────────────────────────
  it("T7: heartbeat write failure calls mcpServer.close() (extends T3)", async () => {
    const { factory, instances } = makeFactory();
    const manager = new SseSessionManager(factory as any, makeLogger() as any, "", 5);
    const sseRes = makeWriteThrowingRes();

    await manager.handleSse(makeReq(), sseRes);
    await waitForHeartbeat();

    expect(manager.sessionCount).toBe(0);
    expect(instances[0]!.close).toHaveBeenCalledTimes(1);
  });

  // T8 ──────────────────────────────────────────────────────────────────────
  it("T8: idle reaper evicts a session with no activity past _idleTimeoutMs, calls mcpServer.close()", async () => {
    const { factory, instances } = makeFactory();
    // heartbeat + max-age set huge (never fire); idle=15ms, reaper sweeps every 5ms
    const manager = new SseSessionManager(factory as any, makeLogger() as any, "", 999_999_999, 15, 999_999_999, 5);
    const res = makeRes({ value: "" });

    try {
      await manager.handleSse(makeReq(), res);
      expect(manager.sessionCount).toBe(1);

      // No handleMessage() calls — session sits idle
      await waitForReaper(50);

      expect(manager.sessionCount).toBe(0);
      expect(instances[0]!.close).toHaveBeenCalledTimes(1);
    } finally {
      manager.stopReaper();
    }
  });

  // T9 ──────────────────────────────────────────────────────────────────────
  it("T9 (negative control, pairs with T8): activity inside the idle window resets the clock — session survives", async () => {
    const { factory, instances } = makeFactory();
    const manager = new SseSessionManager(factory as any, makeLogger() as any, "", 999_999_999, 15, 999_999_999, 5);
    const res = makeRes({ value: "" });

    try {
      await manager.handleSse(makeReq(), res);
      expect(manager.sessionCount).toBe(1);

      // Keep bumping lastActivityAt every 5ms — faster than the 15ms idle timeout
      const bump = setInterval(() => {
        void manager.handleMessage(makeReq(), makeRes({ value: "" }), "test-session-001");
      }, 5);

      await waitForReaper(50);
      clearInterval(bump);

      // Same wait window as T8, but the session must still be resident
      expect(manager.sessionCount).toBe(1);
      expect(instances[0]!.close).not.toHaveBeenCalled();
    } finally {
      manager.stopReaper();
    }
  });

  // T10 ─────────────────────────────────────────────────────────────────────
  it("T10: max-age reaper evicts a session past _maxAgeMs even with recent activity — independent of idle clock", async () => {
    const { factory, instances } = makeFactory();
    // idle huge (never the reason), max-age=20ms, reaper sweeps every 5ms
    const manager = new SseSessionManager(factory as any, makeLogger() as any, "", 999_999_999, 999_999_999, 20, 5);
    const res = makeRes({ value: "" });

    try {
      await manager.handleSse(makeReq(), res);
      expect(manager.sessionCount).toBe(1);

      // Keep bumping activity — proves eviction is NOT the idle path
      const bump = setInterval(() => {
        void manager.handleMessage(makeReq(), makeRes({ value: "" }), "test-session-001");
      }, 5);

      await waitForReaper(50);
      clearInterval(bump);

      expect(manager.sessionCount).toBe(0);
      expect(instances[0]!.close).toHaveBeenCalledTimes(1);
    } finally {
      manager.stopReaper();
    }
  });

  // T11 ─────────────────────────────────────────────────────────────────────
  it("T11: closeSession() (DELETE) evicts an existing session (true) and calls mcpServer.close(); unknown id returns false", async () => {
    const { factory, instances } = makeFactory();
    const manager = new SseSessionManager(factory as any, makeLogger() as any);
    const res = makeRes({ value: "" });

    await manager.handleSse(makeReq(), res);
    expect(manager.sessionCount).toBe(1);

    const existed = await manager.closeSession("test-session-001");
    expect(existed).toBe(true);
    expect(manager.sessionCount).toBe(0);
    expect(instances[0]!.close).toHaveBeenCalledTimes(1);

    const unknownExisted = await manager.closeSession("no-such-session");
    expect(unknownExisted).toBe(false);
  });

  // T12 ─────────────────────────────────────────────────────────────────────
  it("T12: double-eviction idempotency — two trigger paths in sequence call mcpServer.close() exactly once, no throw", async () => {
    const { factory, instances } = makeFactory();
    const manager = new SseSessionManager(factory as any, makeLogger() as any);
    const res = makeRes({ value: "" });

    await manager.handleSse(makeReq(), res);
    expect(manager.sessionCount).toBe(1);

    // Trigger #1: simulate res.on("close") firing (e.g. idle-reap already evicted in practice)
    (res as unknown as EventEmitter).emit("close");
    await waitForReaper(10);
    expect(manager.sessionCount).toBe(0);
    expect(instances[0]!.close).toHaveBeenCalledTimes(1);

    // Trigger #2: DELETE arrives after the session is already gone — no-op, no throw
    const existed = await manager.closeSession("test-session-001");
    expect(existed).toBe(false);
    expect(instances[0]!.close).toHaveBeenCalledTimes(1); // still exactly once
  });
});
