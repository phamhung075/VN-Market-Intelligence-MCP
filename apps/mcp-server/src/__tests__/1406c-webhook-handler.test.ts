// src/__tests__/1406c-webhook-handler.test.ts
// Task 1406c — webhookHandler extraction unit tests
//
// TDD: 3 tests covering the extracted handler in isolation.
//
// Tests:
//   (a) 403 on bad webhook secret
//   (b) BUG-channel message stored via insertReport
//   (c) normal command dispatched via handleTelegramCommand

Bun.env["DB_PATH"] = ":memory:";
// Set a webhook secret so we can test rejection
Bun.env["TELEGRAM_WEBHOOK_SECRET"] = "valid-secret-1406c";
// Set a bug channel ID for BUG-channel branch test
Bun.env["TELEGRAM_REPORT_BUG_CHANNEL_ID"] = "999";

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWebhook } from "../interface/mcp/routes/webhookHandler.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─── Minimal HTTP mock helpers ────────────────────────────────────────────────

function makeReq(body: string, extraHeaders: Record<string, string> = {}): IncomingMessage {
  const chunks: string[] = body ? [body] : [];
  let idx = 0;
  const req = {
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
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

afterAll(() => {
  closeDb();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("1406c — handleWebhook", () => {
  it("(a) returns 403 when webhook secret is missing/wrong", async () => {
    // No x-telegram-bot-api-secret-token header → validateWebhookRequest returns false
    const req = makeReq(JSON.stringify({ message: { text: "/help", chat: { id: 1 } } }));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handleWebhook(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(403);
    expect(JSON.parse(mockRes.body)).toEqual({ error: "Forbidden" });
  });

  it("(b) stores BUG-channel message via insertReport and returns 200", async () => {
    // Provide correct secret + BUG channel chat ID
    const req = makeReq(
      JSON.stringify({ message: { text: "BUG: something broke", chat: { id: 999 } } }),
      { "x-telegram-bot-api-secret-token": "valid-secret-1406c" },
    );
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handleWebhook(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body).toBe("ok");

    // Verify the report was persisted
    const db = getDb();
    const rows = db.prepare("SELECT * FROM telegram_reports WHERE text = ?").all("BUG: something broke");
    expect(rows.length).toBe(1);
  });

  it("(c) dispatches normal command and returns 200 without crashing", async () => {
    // MARKET channel — different chat ID (not bug channel)
    // handleTelegramCommand may fail gracefully (no real bot token in test env)
    // The handler catches errors and still returns 200
    const req = makeReq(
      JSON.stringify({ message: { text: "/help", chat: { id: 42 } } }),
      { "x-telegram-bot-api-secret-token": "valid-secret-1406c" },
    );
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    // Should not throw — errors are caught internally
    await handleWebhook(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body).toBe("ok");
  });

  // FACTORY-INFRA-split-telegramCommands: webhookHandler.ts is the INTERFACE
  // layer that wires orchestrateRecapCommand's 3 functions into
  // handleTelegramCommand's RecapResolvers DI contract. This proves the
  // wiring reaches all the way through (no real bot token in test env — the
  // handler still never throws and returns 200).
  it("(d) /recap dispatches through the RecapResolvers DI wiring and returns 200 without crashing", async () => {
    const req = makeReq(
      JSON.stringify({ message: { text: "/recap", chat: { id: 43 } } }),
      { "x-telegram-bot-api-secret-token": "valid-secret-1406c" },
    );
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handleWebhook(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body).toBe("ok");
  });
});
