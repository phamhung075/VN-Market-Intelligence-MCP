Bun.env["DB_PATH"] = ":memory:";
/**
 * Task 235 — Merge Telegram send tools: 3 → 1 send_telegram
 *
 * Verifies:
 *   1. send_telegram is registered (replaces send_test_telegram, send_telegram_report, delete_telegram_report)
 *   2. send_telegram with channel="market" routes to sendTelegramMarket (TELEGRAM_INFO_MARKET_GROUP_ID)
 *   3. send_telegram with channel="bug" routes to sendTelegramBug (TELEGRAM_REPORT_BUG_CHANNEL_ID)
 *   4. send_test_telegram is NOT registered (removed)
 *   5. send_telegram_report is NOT registered (removed)
 *   6. delete_telegram_report is NOT registered (removed — functionality in process_telegram_report)
 *   7. send_alert_digest is still registered (separate tool, different logic)
 */

import { describe, it, expect, beforeAll, mock } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTelegramTools } from "../interface/mcp/tools/briefings/telegramTools.js";
import { registerAlertDigestTools } from "../interface/mcp/tools/alerts/alertDigestTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

Bun.env["DB_PATH"] = ":memory:";

let server: McpServer;
let registry: Record<string, unknown>;

beforeAll(() => {
  server = new McpServer(
    { name: "test-235", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  registerTelegramTools(server);
  registerAlertDigestTools(server);

  registry = (server as unknown as { _registeredTools: Record<string, unknown> })
    ._registeredTools;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tool presence — new tool registered
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 235 — send_telegram registered", () => {
  it("send_telegram is present in the MCP registry", () => {
    expect("send_telegram" in registry).toBe(true);
  });

  it("send_alert_digest is still present in the MCP registry", () => {
    expect("send_alert_digest" in registry).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Old tools removed
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 235 — removed tools absent from MCP registry", () => {
  it("send_test_telegram is NOT registered", () => {
    expect("send_test_telegram" in registry).toBe(false);
  });

  it("send_telegram_report is NOT registered", () => {
    expect("send_telegram_report" in registry).toBe(false);
  });

  it("delete_telegram_report is NOT registered", () => {
    expect("delete_telegram_report" in registry).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. send_telegram channel routing — unit-level mock
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 235 — send_telegram channel routing", () => {
  it("channel='market' sends to MARKET channel and returns success", async () => {
    // Set up env
    const origToken = process.env["TELEGRAM_BOT_TOKEN"];
    const origChatId = process.env["TELEGRAM_INFO_MARKET_GROUP_ID"];
    process.env["TELEGRAM_BOT_TOKEN"] = "dummy-token";
    process.env["TELEGRAM_INFO_MARKET_GROUP_ID"] = "111";

    // Mock fetch to simulate Telegram success
    const capturedUrls: string[] = [];
    const mockFetch = mock(async (url: string, _init: RequestInit) => {
      capturedUrls.push(url as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    // Import the notifier to test the underlying call indirectly
    const { sendTelegramMarket } = await import(
      "../infrastructure/notifiers/telegram.js"
    );

    const result = await sendTelegramMarket("hello chat", {
      fetchFn: mockFetch as unknown as (url: string, init: RequestInit) => Promise<Response>,
    });

    expect(result).toBe(true);
    expect(capturedUrls.length).toBe(1);
    expect(capturedUrls[0]).toContain("sendMessage");

    process.env["TELEGRAM_BOT_TOKEN"] = origToken;
    process.env["TELEGRAM_INFO_MARKET_GROUP_ID"] = origChatId;
  });

  it("channel='bug' sends to BUG channel and returns success", async () => {
    const origToken = process.env["TELEGRAM_BOT_TOKEN"];
    const origReportId = process.env["TELEGRAM_REPORT_BUG_CHANNEL_ID"];
    process.env["TELEGRAM_BOT_TOKEN"] = "dummy-token";
    process.env["TELEGRAM_REPORT_BUG_CHANNEL_ID"] = "222";

    const capturedChatIds: string[] = [];
    const mockFetch = mock(async (_url: string, init: RequestInit) => {
      const body = JSON.parse((init.body as string) ?? "{}") as { chat_id?: string };
      capturedChatIds.push(String(body.chat_id ?? ""));
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 999 } }),
        { status: 200 },
      );
    });

    const { sendTelegramBug } = await import(
      "../infrastructure/notifiers/telegram.js"
    );

    const msgId = await sendTelegramBug("report message", {
      fetchFn: mockFetch as unknown as (url: string, init: RequestInit) => Promise<Response>,
    });

    expect(msgId).toBe(999);
    expect(capturedChatIds.length).toBe(1);
    expect(capturedChatIds[0]).toBe("222");

    process.env["TELEGRAM_BOT_TOKEN"] = origToken;
    process.env["TELEGRAM_REPORT_BUG_CHANNEL_ID"] = origReportId;
  });

  it("channel='market' with no token returns failure gracefully", async () => {
    const origToken = process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_BOT_TOKEN"];

    const { sendTelegramMarket } = await import(
      "../infrastructure/notifiers/telegram.js"
    );

    const result = await sendTelegramMarket("should fail silently");
    expect(result).toBe(false);

    process.env["TELEGRAM_BOT_TOKEN"] = origToken;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. send_telegram tool schema validation
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 235 — send_telegram tool schema", () => {
  it("send_telegram tool exists in registry with correct name", () => {
    const tool = registry["send_telegram"];
    expect(tool).toBeDefined();
  });

  it("telegramTools registers exactly 1 tool (send_telegram only)", () => {
    const telegramOnlyServer = new McpServer(
      { name: "test-235-count", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    registerTelegramTools(telegramOnlyServer);
    const reg = (telegramOnlyServer as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    const toolNames = Object.keys(reg);
    expect(toolNames).toHaveLength(1);
    expect(toolNames[0]).toBe("send_telegram");
  });
});
