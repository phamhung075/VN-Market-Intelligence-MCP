/**
 * Task 1862c-F: SseSessionManager structured 404 + heartbeat eviction
 *
 * AC-1: 404 returns { error: "session_not_found", sessionId }
 * AC-2: heartbeat failure evicts session from sessions Map
 * AC-3: heartbeat failure clears heartbeat interval
 * AC-4: handleMessage after eviction returns 404
 *
 * Mock strategy: mock.module() (bun:test) for SSEServerTransport.
 * Timer strategy: pass _heartbeatIntervalMs=5 to SseSessionManager so real
 * timers fire fast; await a short delay to let the heartbeat tick.
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
    connect = mock(async () => {});
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

function makeFactory() {
  return () => ({ connect: mock(async () => {}) }) as any;
}

/** Wait long enough for a 5ms heartbeat interval to fire. */
function waitForHeartbeat(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("1862c-F: SseSessionManager — structured 404 + heartbeat eviction", () => {
  // T1 ──────────────────────────────────────────────────────────────────────
  it("handleMessage with unknown sessionId returns 404 with {error:'session_not_found', sessionId}", async () => {
    const manager = new SseSessionManager(makeFactory(), makeLogger() as any);
    const capturedBody = { value: "" };
    const res = makeRes(capturedBody);

    await manager.handleMessage(makeReq(), res, "unknown-session");

    expect(res.writeHead).toHaveBeenCalledWith(404, { "Content-Type": "application/json" });
    const body = JSON.parse(capturedBody.value);
    expect(body).toEqual({ error: "session_not_found", sessionId: "unknown-session" });
  });

  // T2 ──────────────────────────────────────────────────────────────────────
  it("handleMessage unknown sessionId — error field is exact code 'session_not_found' (not a string interpolation)", async () => {
    const manager = new SseSessionManager(makeFactory(), makeLogger() as any);
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
    const manager = new SseSessionManager(makeFactory(), makeLogger() as any, "", 5);
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
    const manager = new SseSessionManager(makeFactory(), log as any, "", 5);
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
    const manager = new SseSessionManager(makeFactory(), makeLogger() as any, "", 5);
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
});
