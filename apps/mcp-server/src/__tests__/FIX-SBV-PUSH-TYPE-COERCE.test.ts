// src/__tests__/FIX-SBV-PUSH-TYPE-COERCE.test.ts
// Task FIX-SBV-PUSH-TYPE-COERCE — /api/push-sbv-rates rejects string-typed numerics
//
// Root cause: typeof snapshot.usdVndOfficial !== "number" check at server.ts:692
// rejects valid payloads from the VPS script that sends numeric values as JSON strings.
//
// Fix spec: Number()-coerce usdVndOfficial + 6 optional rate fields BEFORE validation;
// preserve NaN/<=0 guard.
//
// Tests:
//   TC-01: string-typed usdVndOfficial "26135" → 200 OK (was 400 before fix)
//   TC-02: all optional fields as strings → 200 OK, correct coerced values
//   TC-03: garbage string "abc" → 400 (NaN guard preserved)
//   TC-04: negative string "-1" → 400 (<=0 guard preserved)
//   TC-05: zero string "0" → 400 (<=0 guard preserved)
//   TC-06: numeric usdVndOfficial (pre-existing correct path) → 200 (regression)
//   TC-07: empty body → 400 (unchanged branch)
//   TC-08: bad auth → 401 (unchanged branch)

Bun.env["DB_PATH"] = ":memory:";
Bun.env["VPS_PUSH_API_KEY"] = "test-key-sbv-coerce";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";

// ─── Minimal HTTP mock helpers ────────────────────────────────────────────────

function makeReq(body: string, apiKey?: string): IncomingMessage {
  const chunks: string[] = body ? [body] : [];
  let idx = 0;
  const req = {
    headers: {
      "x-api-key": apiKey !== undefined ? apiKey : "test-key-sbv-coerce",
      "content-type": "application/json",
    },
    method: "POST",
    url: "/api/push-sbv-rates",
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
    writeHead(code: number, headers?: Record<string, string>) {
      this.statusCode = code;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data?: string) {
      this.body = data ?? "";
    },
  };
  return res;
}

// ─── Handler import (lazy to pick up env before import) ──────────────────────

let handlePushSbvRates: (
  req: IncomingMessage,
  res: ServerResponse,
  db: import("bun:sqlite").Database,
  log: { info(...a: unknown[]): void; error(...a: unknown[]): void },
) => Promise<void>;

let testDb: import("bun:sqlite").Database;

const mockLog = {
  info(..._a: unknown[]) {},
  error(..._a: unknown[]) {},
};

beforeAll(async () => {
  const { initDatabase, getDb } = await import(
    "../infrastructure/db/schema.js"
  );
  initDatabase();
  testDb = getDb();

  // Import the handler — it lives inline in server.ts so we exercise via
  // a thin wrapper extracted from the same handler region.
  const mod = await import("../interface/mcp/routes/pushSbvRatesHandler.js");
  handlePushSbvRates = mod.handlePushSbvRates;
});

afterAll(() => {
  try {
    testDb?.close();
  } catch {
    // ignore
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FIX-SBV-PUSH-TYPE-COERCE — /api/push-sbv-rates string coercion", () => {
  // TC-01: string usdVndOfficial must be accepted (was broken)
  it("TC-01: string usdVndOfficial '26135' → 200 OK after coercion", async () => {
    const payload = JSON.stringify({ usdVndOfficial: "26135" });
    const req = makeReq(payload);
    const res = makeRes();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, mockLog);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.usdVnd).toBe(26135);
  });

  // TC-02: all optional fields as strings → 200, correct coerced values
  it("TC-02: all optional numeric fields as strings → 200 OK with coerced values", async () => {
    const payload = JSON.stringify({
      usdVndOfficial: "26000",
      overnightRatePct: "3.0",
      refinancingRatePct: "4.5",
      discountRatePct: "1.5",
      maxDepositRatePct: "5.0",
      maxLendingRatePct: "12.0",
      interbankOvernightPct: "4.2",
    });
    const req = makeReq(payload);
    const res = makeRes();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, mockLog);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.usdVnd).toBe(26000);
  });

  // TC-03: garbage string → 400 (NaN guard)
  it("TC-03: garbage string 'abc' for usdVndOfficial → 400 (NaN guard)", async () => {
    const payload = JSON.stringify({ usdVndOfficial: "abc" });
    const req = makeReq(payload);
    const res = makeRes();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, mockLog);

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/usdVndOfficial/);
  });

  // TC-04: negative string → 400 (<=0 guard)
  it("TC-04: negative string '-1' for usdVndOfficial → 400 (<=0 guard)", async () => {
    const payload = JSON.stringify({ usdVndOfficial: "-1" });
    const req = makeReq(payload);
    const res = makeRes();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, mockLog);

    expect(res.statusCode).toBe(400);
  });

  // TC-05: zero string → 400 (<=0 guard)
  it("TC-05: zero string '0' for usdVndOfficial → 400 (<=0 guard)", async () => {
    const payload = JSON.stringify({ usdVndOfficial: "0" });
    const req = makeReq(payload);
    const res = makeRes();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, mockLog);

    expect(res.statusCode).toBe(400);
  });

  // TC-06: numeric usdVndOfficial (pre-existing correct path) → 200 (regression guard)
  it("TC-06: numeric usdVndOfficial 26135 (original type) → 200 OK (regression)", async () => {
    const payload = JSON.stringify({ usdVndOfficial: 26135 });
    const req = makeReq(payload);
    const res = makeRes();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, mockLog);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.usdVnd).toBe(26135);
  });

  // TC-07: empty body → 400 (unchanged branch)
  it("TC-07: empty body → 400 (unchanged empty-body branch)", async () => {
    const req = makeReq("");
    const res = makeRes();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, mockLog);

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toMatch(/[Ee]mpty/);
  });

  // TC-08: bad auth → 401 (unchanged auth branch)
  it("TC-08: wrong API key → 401 (unchanged auth branch)", async () => {
    const payload = JSON.stringify({ usdVndOfficial: 26135 });
    const req = makeReq(payload, "wrong-key");
    const res = makeRes();

    await handlePushSbvRates(req, res as unknown as ServerResponse, testDb, mockLog);

    expect(res.statusCode).toBe(401);
  });
});
