/**
 * KD-OBS-01-FIX — Kinh Dich genuine-error → BUG channel notification
 *
 * KD-OBS-01 finding: kinh-dich MCP tools and HTTP handlers caught genuine
 * data errors (DB failures, upstream HTTP failures) and only sent them to
 * the structured logger — never to a human (WORK/BUG Telegram channel).
 * Benign "no data yet" / data-short states are NOT in scope (each tool
 * already returns a graceful text/JSON response for those before ever
 * reaching its catch block).
 *
 * AC-1: notifyKinhDichError() calls the injected sendBugFn with a message
 *       that contains the source, detail, and a "📋 <category>" marker
 *       (the marker sendTelegramBug() uses for its built-in 4h dedup).
 * AC-2: notifyKinhDichError() never rejects, even when sendBugFn rejects
 *       (non-fatal contract — Telegram failures must never crash the caller).
 * AC-3: notifyKinhDichError() never rejects on its default (real) sendBugFn
 *       path either (no TELEGRAM_BOT_TOKEN in test env → safe no-op).
 * AC-4 through AC-8: each of the 5 registerKinhDichTools() catch blocks
 *       (get_kinhdich_reading, get_market_hexagram, get_hexagram_history,
 *       get_transition_probabilities, run_hexagram_backtest) invokes the
 *       injected notifyError with the correct tool name + a stable category,
 *       and the tool still returns its normal graceful error text (does not
 *       throw to the MCP caller).
 * AC-9 through AC-11: each of the 3 kinh-dich HTTP route handlers
 *       (handleKinhDichReading, handleGetKinhDichSignals, handleKinhDichMarket)
 *       invokes the injected notifyError on a genuine DB error and still
 *       returns its normal 500 JSON body.
 *
 * Error-forcing strategy (deterministic, zero module mocking):
 *   - MCP tools (no injected `db` param — all call getDb()/initDatabase()
 *     internally): temporarily point DB_PATH at a directory (not a valid
 *     sqlite file) so `new Database(dbPath)` throws "unable to open
 *     database file" the moment initDatabase() re-opens the singleton.
 *     Restored to ":memory:" + closeDb() in afterEach.
 *   - HTTP route handlers (db passed in explicitly by the caller): same
 *     "capture db handle, then closeDb(), then pass the now-stale handle"
 *     trick already used by the pre-existing AC-29 test in
 *     TASK17-PAGE11-kinh-dich-signals-endpoint.test.ts.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerKinhDichTools } from "../interface/mcp/tools/kinhdich/kinhDichTools.js";
import { notifyKinhDichError, type SendBugFn } from "../interface/mcp/tools/kinhdich/kinhDichErrorNotify.js";
import { handleKinhDichReading } from "../interface/mcp/routes/kinhDichReadingHandler.js";
import { handleGetKinhDichSignals } from "../interface/mcp/routes/kinhDichSignalsHandler.js";
import { handleKinhDichMarket } from "../interface/mcp/routes/kinhDichMarketHandler.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type NotifyCall = { source: string; category: string; detail: string };

/** Builds a fake notifyError capturing every call — never throws. */
function makeNotifySpy(): { calls: NotifyCall[]; fn: typeof notifyKinhDichError } {
  const calls: NotifyCall[] = [];
  const fn = async (source: string, category: string, detail: string) => {
    calls.push({ source, category, detail });
  };
  return { calls, fn };
}

function buildServerWithSpy(): {
  server: McpServer;
  tools: Record<string, { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }>;
  calls: NotifyCall[];
} {
  const server = new McpServer(
    { name: "test-kinhdich-bug-notify", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );
  const { calls, fn } = makeNotifySpy();
  registerKinhDichTools(server, fn);

  const tools = (server as unknown as {
    _registeredTools: Record<string, { handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }>;
  })._registeredTools;

  return { server, tools, calls };
}

function makeMockRes() {
  const mock = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data: string) {
      this.body = data;
    },
  };
  return mock;
}

function makeFakeReq(url = "/"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/** Points DB_PATH at a directory — forces the next getDb()/initDatabase() to throw. */
function forceNextGetDbThrow(): void {
  closeDb();
  Bun.env["DB_PATH"] = "/tmp"; // a real directory — new Database("/tmp") throws
}

function restoreDb(): void {
  closeDb();
  Bun.env["DB_PATH"] = ":memory:";
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 .. AC-3 — notifyKinhDichError() unit contract
// ─────────────────────────────────────────────────────────────────────────────

describe("KD-OBS-01-FIX — notifyKinhDichError()", () => {
  it("AC-1: calls sendBugFn with source, detail, and a 📋 <category> marker", async () => {
    const captured: string[] = [];
    const sendBugFn: SendBugFn = async (text: string) => {
      captured.push(text);
      return 123;
    };

    await notifyKinhDichError("get_kinhdich_reading", "kinhdich-reading-error", "VCB: boom", sendBugFn);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toContain("get_kinhdich_reading");
    expect(captured[0]).toContain("VCB: boom");
    expect(captured[0]).toContain("📋 kinhdich-reading-error");
  });

  it("AC-2: never rejects even when sendBugFn rejects", async () => {
    const sendBugFn: SendBugFn = async () => {
      throw new Error("telegram is down");
    };

    // Must resolve, not throw — non-fatal contract.
    await expect(
      notifyKinhDichError("run_hexagram_backtest", "kinhdich-backtest-error", "VNINDEX: boom", sendBugFn),
    ).resolves.toBeUndefined();
  });

  it("AC-3: default (real) sendBugFn path resolves without throwing in test env", async () => {
    // No TELEGRAM_BOT_TOKEN set in test env → sendTelegramBug() short-circuits
    // internally and never makes a real network call.
    await expect(
      notifyKinhDichError("get_market_hexagram", "kinhdich-market-hexagram-error", "boom"),
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4 .. AC-8 — registerKinhDichTools() catch-block wiring
// ─────────────────────────────────────────────────────────────────────────────

describe("KD-OBS-01-FIX — MCP tool catch blocks notify on genuine DB error", () => {
  afterEach(() => {
    restoreDb();
  });

  it("AC-4: get_kinhdich_reading notifies with source=get_kinhdich_reading", async () => {
    const { tools, calls } = buildServerWithSpy();
    forceNextGetDbThrow();

    const result = await tools["get_kinhdich_reading"]!.handler({ code: "VCB" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.source).toBe("get_kinhdich_reading");
    expect(calls[0]!.category).toBe("kinhdich-reading-error");
    expect(calls[0]!.detail).toContain("VCB");
    expect(result.content[0]!.text).toContain("Lỗi");
  });

  it("AC-5: get_market_hexagram notifies with source=get_market_hexagram", async () => {
    const { tools, calls } = buildServerWithSpy();
    forceNextGetDbThrow();

    const result = await tools["get_market_hexagram"]!.handler({});

    expect(calls).toHaveLength(1);
    expect(calls[0]!.source).toBe("get_market_hexagram");
    expect(calls[0]!.category).toBe("kinhdich-market-hexagram-error");
    expect(result.content[0]!.text).toContain("Lỗi");
  });

  it("AC-6: get_hexagram_history notifies with source=get_hexagram_history", async () => {
    const { tools, calls } = buildServerWithSpy();
    forceNextGetDbThrow();

    const result = await tools["get_hexagram_history"]!.handler({ code: "VCB", days: 30 });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.source).toBe("get_hexagram_history");
    expect(calls[0]!.category).toBe("kinhdich-history-error");
    expect(result.content[0]!.text).toContain("Lỗi");
  });

  it("AC-7: get_transition_probabilities notifies with source=get_transition_probabilities", async () => {
    const { tools, calls } = buildServerWithSpy();
    forceNextGetDbThrow();

    const result = await tools["get_transition_probabilities"]!.handler({ hexagram_number: 1 });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.source).toBe("get_transition_probabilities");
    expect(calls[0]!.category).toBe("kinhdich-transitions-error");
    expect(result.content[0]!.text).toContain("Lỗi");
  });

  it("AC-8: run_hexagram_backtest notifies with source=run_hexagram_backtest", async () => {
    const { tools, calls } = buildServerWithSpy();
    forceNextGetDbThrow();

    const result = await tools["run_hexagram_backtest"]!.handler({ days: 30 });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.source).toBe("run_hexagram_backtest");
    expect(calls[0]!.category).toBe("kinhdich-backtest-error");
    expect(result.content[0]!.text).toContain("Lỗi");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9 .. AC-11 — HTTP route handler catch-block wiring
// ─────────────────────────────────────────────────────────────────────────────

describe("KD-OBS-01-FIX — HTTP route handlers notify on genuine DB error", () => {
  beforeEach(async () => {
    Bun.env["DB_PATH"] = ":memory:";
    closeDb();
    await initDatabase();
  });
  afterEach(() => {
    closeDb();
  });

  it("AC-9: handleKinhDichReading notifies + still returns 500 JSON on DB error", () => {
    const db = getDb();
    closeDb(); // force DB error on the stale handle passed below
    const { calls, fn } = makeNotifySpy();
    const res = makeMockRes();

    handleKinhDichReading(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      db,
      "VCB",
      fn,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.source).toBe("handleKinhDichReading");
    expect(calls[0]!.category).toBe("kinhdich-reading-route-error");
    expect(calls[0]!.detail).toContain("VCB");
  });

  it("AC-10: handleGetKinhDichSignals notifies + still returns 500 JSON on DB error", () => {
    const db = getDb();
    closeDb();
    const { calls, fn } = makeNotifySpy();
    const res = makeMockRes();

    handleGetKinhDichSignals(
      makeFakeReq("/api/kinh-dich-signals"),
      res as unknown as import("node:http").ServerResponse,
      db,
      fn,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.source).toBe("handleGetKinhDichSignals");
    expect(calls[0]!.category).toBe("kinhdich-signals-route-error");
  });

  it("AC-11: handleKinhDichMarket notifies + still returns 500 JSON on DB error", () => {
    const db = getDb();
    closeDb();
    const { calls, fn } = makeNotifySpy();
    const res = makeMockRes();

    handleKinhDichMarket(
      makeFakeReq("/mcp/api/kinh-dich/market"),
      res as unknown as import("node:http").ServerResponse,
      db,
      fn,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.source).toBe("handleKinhDichMarket");
    expect(calls[0]!.category).toBe("kinhdich-market-route-error");
  });
});
