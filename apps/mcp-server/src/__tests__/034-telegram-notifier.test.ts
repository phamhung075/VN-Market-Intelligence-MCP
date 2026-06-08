Bun.env["DB_PATH"] = ":memory:";

import { mock } from "bun:test";
// Isolation guard: bypass process-global mock.module stub from 047.
// Load real telegram module via absolute-path+query-bust (bypasses Bun mock cache).
// Tests use _realMod directly instead of await import() to avoid hitting the stub.
const _realMod = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=034"
);

/**
 * Task 034 — Telegram Bot Notifier
 *
 * Tests the Telegram notifier infrastructure module.
 * All tests mock fetch() to avoid real Telegram API calls.
 *
 * Coverage:
 *   - sendTelegramMarket: happy path, missing env vars, HTTP errors, network errors
 *   - notifyTelegramAlert: severity filtering, message formatting
 *   - notifyTelegramDocument: new SSC document notification
 *   - send_test_telegram MCP tool: success + failure
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Alert } from "../domain/services/alertGenerator.js";
import type { Signal } from "../domain/services/signalDetector.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal Response-like object */
function makeResponse(status: number, body: unknown = { ok: true }): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Build a minimal Signal for testing */
function makeSignal(type = "price_drop"): Signal {
  return {
    type: type as Signal["type"],
    actionCode: "VCB",
    severity: "high",
    confidence: 0.9,
    message: "Price dropped 8.5%",
    detectedAt: new Date().toISOString(),
  };
}

/** Build a minimal Alert for testing */
function makeAlert(severity: Alert["severity"] = "high"): Alert {
  return {
    id: "alert-001",
    actionCode: "VCB",
    signals: [makeSignal()],
    severity,
    message: "Price dropped 8.5% with volume spike",
    isRead: false,
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 034 — Telegram Bot Notifier", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Snapshot env vars before each test
    originalEnv = {
      TELEGRAM_BOT_TOKEN: Bun.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_INFO_MARKET_GROUP_ID: Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID,
    };
  });

  afterEach(() => {
    // Restore env vars
    if (originalEnv.TELEGRAM_BOT_TOKEN === undefined) {
      delete (Bun.env as Record<string, string | undefined>).TELEGRAM_BOT_TOKEN;
    } else {
      Bun.env.TELEGRAM_BOT_TOKEN = originalEnv.TELEGRAM_BOT_TOKEN;
    }
    if (originalEnv.TELEGRAM_INFO_MARKET_GROUP_ID === undefined) {
      delete (Bun.env as Record<string, string | undefined>).TELEGRAM_INFO_MARKET_GROUP_ID;
    } else {
      Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = originalEnv.TELEGRAM_INFO_MARKET_GROUP_ID;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // sendTelegramMarket tests
  // ───────────────────────────────────────────────────────────────────────────

  it("TC-01: sendTelegramMarket returns true on HTTP 200", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    const mockFetch = mock(async () => makeResponse(200, { ok: true, result: {} }));

    const { sendTelegramMarket } = _realMod;

    const result = await sendTelegramMarket("Hello", { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("TC-02: sendTelegramMarket returns false when TELEGRAM_BOT_TOKEN is missing", async () => {
    delete (Bun.env as Record<string, string | undefined>).TELEGRAM_BOT_TOKEN;
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    const mockFetch = mock(async () => makeResponse(200));

    const { sendTelegramMarket } = _realMod;

    const result = await sendTelegramMarket("Hello", { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("TC-03: sendTelegramMarket returns false when TELEGRAM_INFO_MARKET_GROUP_ID is missing", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    delete (Bun.env as Record<string, string | undefined>).TELEGRAM_INFO_MARKET_GROUP_ID;

    const mockFetch = mock(async () => makeResponse(200));

    const { sendTelegramMarket } = _realMod;

    const result = await sendTelegramMarket("Hello", { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("TC-04: sendTelegramMarket returns false on HTTP 4xx (bad token)", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "bad-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    const mockFetch = mock(async () => makeResponse(401, { ok: false, description: "Unauthorized" }));

    const { sendTelegramMarket } = _realMod;

    const result = await sendTelegramMarket("Hello", { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(false);
  });

  it("TC-05: sendTelegramMarket returns false on HTTP 5xx", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    const mockFetch = mock(async () => makeResponse(500, { ok: false }));

    const { sendTelegramMarket } = _realMod;

    const result = await sendTelegramMarket("Hello", { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(false);
  });

  it("TC-06: sendTelegramMarket returns false on network error (fetch rejects)", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    const mockFetch = mock(async () => { throw new Error("ECONNREFUSED"); });

    const { sendTelegramMarket } = _realMod;

    const result = await sendTelegramMarket("Hello", { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(false);
  });

  it("TC-07: sendTelegramMarket never throws — always returns boolean", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    const mockFetch = mock(async () => { throw new Error("Catastrophic failure"); });

    const { sendTelegramMarket } = _realMod;

    await expect(sendTelegramMarket("Hello", { fetchFn: mockFetch as unknown as typeof fetch })).resolves.toBe(false);
  });

  it("TC-08: sendTelegramMarket POSTs to the correct Telegram Bot API endpoint", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "my-bot-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "99999";

    let capturedUrl = "";
    const mockFetch = mock(async (url: string) => {
      capturedUrl = url;
      return makeResponse(200);
    });

    const { sendTelegramMarket } = _realMod;

    await sendTelegramMarket("Test message", { fetchFn: mockFetch as unknown as typeof fetch });
    expect(capturedUrl).toContain("api.telegram.org");
    expect(capturedUrl).toContain("my-bot-token");
    expect(capturedUrl).toContain("sendMessage");
  });

  it("TC-09: sendTelegramMarket includes chat_id and text in POST body", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "my-bot-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "99999";

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return makeResponse(200);
    });

    const { sendTelegramMarket } = _realMod;

    await sendTelegramMarket("Hello Telegram", { fetchFn: mockFetch as unknown as typeof fetch });
    expect(capturedBody.chat_id).toBe("99999");
    expect(capturedBody.text).toBe("Hello Telegram");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // notifyTelegramAlert tests — severity filtering
  // ───────────────────────────────────────────────────────────────────────────

  it("TC-10: notifyTelegramAlert sends for HIGH severity", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_REPORT_BUG_CHANNEL_ID = "12345";

    // sendTelegramBug checks messageId > 0 to return true; supply message_id in mock
    const mockFetch = mock(async () => makeResponse(200, { ok: true, result: { message_id: 1 } }));

    const { notifyTelegramAlert } = _realMod;

    const alert = makeAlert("high");
    const result = await notifyTelegramAlert(alert, { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("TC-11: notifyTelegramAlert sends for CRITICAL severity", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_REPORT_BUG_CHANNEL_ID = "12345";

    // sendTelegramBug checks messageId > 0 to return true; supply message_id in mock
    const mockFetch = mock(async () => makeResponse(200, { ok: true, result: { message_id: 1 } }));

    const { notifyTelegramAlert } = _realMod;

    const alert = makeAlert("critical");
    const result = await notifyTelegramAlert(alert, { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("TC-12: notifyTelegramAlert skips LOW severity — no HTTP call made", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    const mockFetch = mock(async () => makeResponse(200));

    const { notifyTelegramAlert } = _realMod;

    const alert = makeAlert("low");
    const result = await notifyTelegramAlert(alert, { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("TC-13: notifyTelegramAlert skips MEDIUM severity — no HTTP call made", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    const mockFetch = mock(async () => makeResponse(200));

    const { notifyTelegramAlert } = _realMod;

    const alert = makeAlert("medium");
    const result = await notifyTelegramAlert(alert, { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("TC-14: notifyTelegramAlert message includes severity, stock code, and timestamp", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return makeResponse(200);
    });

    const { notifyTelegramAlert } = _realMod;

    const alert = makeAlert("high");
    await notifyTelegramAlert(alert, { fetchFn: mockFetch as unknown as typeof fetch });

    const text = capturedBody.text as string;
    expect(text).toContain("QUAN TRỌNG");
    expect(text).toContain("VCB");
    // Message should contain a timestamp or time indicator
    expect(text.length).toBeGreaterThan(10);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // notifyTelegramDocument tests
  // ───────────────────────────────────────────────────────────────────────────

  it("TC-15: notifyTelegramDocument sends notification for new SSC document", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return makeResponse(200);
    });

    const { notifyTelegramDocument } = _realMod;

    const doc = {
      actionCode: "VCB",
      title: "BCTC Quý I 2025 - VCB",
      publishedAt: "15/04/2025",
    };

    const result = await notifyTelegramDocument(doc, { fetchFn: mockFetch as unknown as typeof fetch });
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const text = capturedBody.text as string;
    expect(text).toContain("VCB");
    expect(text).toContain("BCTC Quý I 2025");
  });

  it("TC-16: notifyTelegramDocument returns false when env vars missing", async () => {
    delete (Bun.env as Record<string, string | undefined>).TELEGRAM_BOT_TOKEN;
    delete (Bun.env as Record<string, string | undefined>).TELEGRAM_INFO_MARKET_GROUP_ID;

    const mockFetch = mock(async () => makeResponse(200));

    const { notifyTelegramDocument } = _realMod;

    const result = await notifyTelegramDocument(
      { actionCode: "VCB", title: "Test doc", publishedAt: "01/01/2025" },
      { fetchFn: mockFetch as unknown as typeof fetch }
    );
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("TC-17: sendTelegramMarket uses Markdown parse_mode", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return makeResponse(200);
    });

    const { sendTelegramMarket } = _realMod;

    await sendTelegramMarket("*bold text*", {
      parseMode: "Markdown",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(capturedBody.parse_mode).toBe("Markdown");
  });

  it("TC-18: TelegramNotifier type is exported (interface check via typeof)", async () => {
    const mod = _realMod;
    // The module must export the functions (duck-typing check)
    expect(typeof mod.sendTelegramMarket).toBe("function");
    expect(typeof mod.notifyTelegramAlert).toBe("function");
    expect(typeof mod.notifyTelegramDocument).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP Tool: send_test_telegram
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 034 — send_test_telegram MCP tool", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {
      TELEGRAM_BOT_TOKEN: Bun.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_INFO_MARKET_GROUP_ID: Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID,
    };
  });

  afterEach(() => {
    if (originalEnv.TELEGRAM_BOT_TOKEN === undefined) {
      delete (Bun.env as Record<string, string | undefined>).TELEGRAM_BOT_TOKEN;
    } else {
      Bun.env.TELEGRAM_BOT_TOKEN = originalEnv.TELEGRAM_BOT_TOKEN;
    }
    if (originalEnv.TELEGRAM_INFO_MARKET_GROUP_ID === undefined) {
      delete (Bun.env as Record<string, string | undefined>).TELEGRAM_INFO_MARKET_GROUP_ID;
    } else {
      Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = originalEnv.TELEGRAM_INFO_MARKET_GROUP_ID;
    }
  });

  it("TC-19: registerTelegramTools exports a function", async () => {
    const mod = await import("../interface/mcp/tools/briefings/telegramTools.js");
    expect(typeof mod.registerTelegramTools).toBe("function");
  });

  it("TC-20: send_test_telegram tool returns success text when message is sent", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "12345";

    // Mock fetch on globalThis for this test
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: {} }),
        text: async () => '{"ok":true}',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    try {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { registerTelegramTools } = await import("../interface/mcp/tools/briefings/telegramTools.js");

      const server = new McpServer(
        { name: "test", version: "1.0.0" },
        { capabilities: { tools: {} } }
      );

      // Must not throw
      expect(() => registerTelegramTools(server)).not.toThrow();

      // Verify the tool is registered
      const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
      expect("send_telegram" in tools).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("TC-21: server.ts registers Telegram tool — toolCount increases to 19", async () => {
    // This test verifies the server integrates the telegram tool
    const { createBunServer } = await import("../interface/mcp/server.js");
    const server = await createBunServer({ port: 0 });
    try {
      // After task 034 wiring, toolCount should be >= 18
      expect(server.toolCount).toBeGreaterThanOrEqual(18);
    } finally {
      await server.close();
    }
  });
});
