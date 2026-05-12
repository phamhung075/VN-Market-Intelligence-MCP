// src/__tests__/1892a-pushNewsHandler.test.ts
// Task 1892a — pushNewsHandler extraction unit tests (AC-8)
//
// Tests:
//   (a) 401 on missing API key
//   (b) 401 on bad API key
//   (c) 400 on empty body (with safeLogVpsPush called)
//   (d) 400 on non-array JSON
//   (e) 200 happy path — safeLogVpsPush called with ok status

Bun.env["DB_PATH"] = ":memory:";
Bun.env["VPS_PUSH_API_KEY"] = "test-key-1892a";

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handlePushNews } from "../interface/mcp/routes/pushNewsHandler.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─── Minimal HTTP mock helpers ───────────────────────────────────────────────

function makeReq(body: string, apiKey?: string | null): IncomingMessage {
  const chunks: string[] = body ? [body] : [];
  let idx = 0;
  const headers: Record<string, string | undefined> = {};
  if (apiKey !== null) {
    headers["x-api-key"] = apiKey ?? "test-key-1892a";
  }
  const req = {
    headers,
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

const silentLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

// ─── Test setup ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  const db = getDb();
  try { db.exec("DELETE FROM vps_push_log"); } catch { /* best effort */ }
});

afterAll(() => {
  closeDb();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("1892a — handlePushNews (AC-8)", () => {
  it("(a) returns 401 when x-api-key header is missing", async () => {
    const req = makeReq(JSON.stringify([{ title: "t", url: "u", publishedAt: "p", content: "c", source: "cafef" }]), null);
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handlePushNews(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(401);
    expect(JSON.parse(mockRes.body)).toEqual({ error: "Unauthorized" });
  });

  it("(b) returns 401 on bad API key", async () => {
    const req = makeReq(JSON.stringify([{ title: "t", url: "u", publishedAt: "p", content: "c", source: "cafef" }]), "wrong-key");
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handlePushNews(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(401);
    expect(JSON.parse(mockRes.body)).toEqual({ error: "Unauthorized" });
  });

  it("(c) returns 400 on empty body and logs error to vps_push_log", async () => {
    const req = makeReq("");
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    const db = getDb();
    await handlePushNews(req, res, db, silentLog);
    expect(mockRes.statusCode).toBe(400);
    expect(JSON.parse(mockRes.body)).toMatchObject({ error: "Empty request body" });
    // safeLogVpsPush should have inserted an error row
    const row = db.prepare(
      "SELECT status, error_msg FROM vps_push_log WHERE service = 'news' ORDER BY pushed_at DESC LIMIT 1"
    ).get() as { status: string; error_msg: string } | null;
    expect(row?.status).toBe("error");
    expect(row?.error_msg).toBe("Empty request body");
  });

  it("(d) returns 400 on non-array JSON payload", async () => {
    const req = makeReq(JSON.stringify({ not: "an array" }));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    await handlePushNews(req, res, getDb(), silentLog);
    expect(mockRes.statusCode).toBe(400);
    expect(JSON.parse(mockRes.body)).toMatchObject({ error: "Expected non-empty JSON array of RssItem" });
  });

  it("(e) returns 200 on valid payload and safeLogVpsPush called with ok status", async () => {
    const items = [
      { title: "Article 1", url: "https://cafef.vn/a1", publishedAt: new Date().toISOString(), content: "nội dung", source: "cafef" },
      { title: "Article 2", url: "https://vnexpress.net/a1", publishedAt: new Date().toISOString(), content: "content", source: "vnexpress" },
    ];
    const req = makeReq(JSON.stringify(items));
    const res = makeRes() as unknown as ServerResponse;
    const mockRes = res as unknown as MockRes;
    const db = getDb();
    await handlePushNews(req, res, db, silentLog);
    expect(mockRes.statusCode).toBe(200);
    const body = JSON.parse(mockRes.body);
    expect(body.ok).toBe(true);
    expect(body.received).toBe(2);
    // safeLogVpsPush should have logged an ok row
    const row = db.prepare(
      "SELECT status, items_count FROM vps_push_log WHERE service = 'news' AND status = 'ok' ORDER BY pushed_at DESC LIMIT 1"
    ).get() as { status: string; items_count: number } | null;
    expect(row?.status).toBe("ok");
    expect(row?.items_count).toBe(2);
  });
});
