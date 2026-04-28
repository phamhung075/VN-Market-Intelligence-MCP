// src/__tests__/1406b-push-foreign-flow-handler.test.ts
// Task 1406b — pushForeignFlowHandler extraction unit tests
//
// TDD: 4 tests covering the extracted handler in isolation.
//
// Tests:
//   (a) 401 on bad API key
//   (b) 400 on truncated/empty payload
//   (c) 503 when circuit breaker is open
//   (d) 200 on valid items upserted

Bun.env["DB_PATH"] = ":memory:";
Bun.env["VPS_PUSH_API_KEY"] = "test-key-1406b";

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handlePushForeignFlow } from "../interface/mcp/routes/pushForeignFlowHandler.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";

// ─── Minimal HTTP mock helpers ───────────────────────────────────────────────

function makeReq(body: string, apiKey?: string): IncomingMessage {
  const chunks: string[] = body ? [body] : [];
  let idx = 0;
  const req = {
    headers: {
      "x-api-key": apiKey ?? "test-key-1406b",
      "content-type": "application/json",
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<{ value: string; done: boolean }> {
          if (idx < chunks.length) {
            return Promise.resolve({ value: chunks[idx++]!, done: false });
          }
          return Promise.resolve({ value: "", done: true });
        },
      };
    },
  } as unknown as IncomingMessage;
  return req;
}

interface MockRes {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  writeHead(code: number, headers?: Record<string, string>): void;
  end(data?: string): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: "",
    headers: {},
    writeHead(code, headers = {}) {
      res.statusCode = code;
      Object.assign(res.headers, headers);
    },
    end(data = "") {
      res.body += data;
    },
  };
  return res;
}

const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as never;

// ─── Test setup ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  // Reset circuit breaker to closed state after each test
  try {
    (breakers.foreignFlow as unknown as { _state: string })._state = "closed";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (breakers.foreignFlow as any).stats.state = "closed";
  } catch {
    // breaker structure may vary — best-effort reset
  }
  try {
    const db = getDb();
    db.exec("DELETE FROM vnstock_trading_stats");
  } catch { /* table may not exist in :memory: */ }
  try {
    const db = getDb();
    db.exec("DELETE FROM vps_push_log");
  } catch { /* table may not exist */ }
});

afterAll(() => {
  closeDb();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("1406b — handlePushForeignFlow", () => {
  it("(a) returns 401 on bad API key", async () => {
    const req = makeReq(JSON.stringify([{ code: "VIC", foreignBuyVol: 100, foreignSellVol: 50 }]), "wrong-key");
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handlePushForeignFlow(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(401);
    expect(JSON.parse(mockRes.body)).toEqual({ error: "Unauthorized" });
  });

  it("(b) returns 400 on empty/truncated body", async () => {
    const req = makeReq("");
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handlePushForeignFlow(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(400);
    const body = JSON.parse(mockRes.body);
    // Either "Empty or truncated body" or any 400 error is acceptable
    expect(body).toHaveProperty("error");
  });

  it("(c) returns 503 when circuit breaker is open", async () => {
    // Force the foreignFlow breaker into open state
    // CircuitBreaker exposes stats.state — we set it via the internal _state property
    const cb = breakers.foreignFlow as unknown as Record<string, unknown>;
    // Try different property names used by the CircuitBreaker implementation
    if (typeof cb["_state"] !== "undefined") {
      cb["_state"] = "open";
    }
    // Also patch stats.state directly (read by the handler)
    const stats = cb["stats"] as Record<string, unknown>;
    if (stats) stats["state"] = "open";

    const payload = JSON.stringify([{
      code: "VIC",
      foreignBuyVol: 1000,
      foreignSellVol: 500,
      foreignRoom: 5000000,
    }]);
    const req = makeReq(payload);
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handlePushForeignFlow(req, res, getDb(), silentLog);

    // Reset before assertion so teardown is clean
    if (stats) stats["state"] = "closed";
    if (typeof cb["_state"] !== "undefined") cb["_state"] = "closed";

    expect(mockRes.statusCode).toBe(503);
    expect(JSON.parse(mockRes.body)).toEqual({ error: "Service temporarily unavailable" });
  });

  it("(d) returns 200 and upserts valid foreign flow items", async () => {
    const payload = JSON.stringify([
      { code: "VIC", foreignBuyVol: 1000, foreignSellVol: 500, foreignRoom: 5000000 },
      { code: "VHM", foreignBuyVol: 2000, foreignSellVol: 1000, foreignRoom: 3000000 },
    ]);
    const req = makeReq(payload);
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handlePushForeignFlow(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(200);
    const body = JSON.parse(mockRes.body);
    expect(body.ok).toBe(true);
    expect(typeof body.upserted).toBe("number");
    expect(body.upserted).toBeGreaterThanOrEqual(1);
  });
});
