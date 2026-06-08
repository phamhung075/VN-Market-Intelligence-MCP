Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1379 — HTML strip before Telegram send
 *
 * Confirms that raw HTML tags (e.g. <br/>, <b>, &amp;) are stripped from
 * the text before it reaches the Telegram API.
 *
 * Confirmed bug: market message id 324 (GAS user_ask_reply, 2026-04-28)
 * contained literal "<br/>" in the user-visible text.
 */

import { describe, it, expect } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
// Isolate from other test modules that mock telegram.
const mod = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) +
    "?isolate=1379"
);

const { sendTelegramMarket } = mod as typeof import("../infrastructure/notifiers/telegram.js");

function makeFetch(capture: { body: string }): (_url: string, init?: RequestInit) => Promise<Response> {
  return async (_url: string, init?: RequestInit) => {
    capture.body = init?.body as string ?? "";
    return new Response(JSON.stringify({ result: { message_id: 1 } }), {
      status: 200,
    });
  };
}

describe("Task 1379 — HTML strip before Telegram send", () => {
  it("strips <br/> tags from message text", async () => {
    Bun.env["TELEGRAM_BOT_TOKEN"] = "test-token";
    Bun.env["TELEGRAM_INFO_MARKET_GROUP_ID"] = "-100123";

    const capture = { body: "" };
    await sendTelegramMarket("Line1<br/>Line2", {
      fetchFn: makeFetch(capture) as never,
    });

    const sent = JSON.parse(capture.body) as { text: string };
    expect(sent.text).not.toContain("<br/>");
    expect(sent.text).toContain("Line1");
    expect(sent.text).toContain("Line2");
  });

  it("strips <br> and <b> tags", async () => {
    Bun.env["TELEGRAM_BOT_TOKEN"] = "test-token";
    Bun.env["TELEGRAM_INFO_MARKET_GROUP_ID"] = "-100123";

    const capture = { body: "" };
    await sendTelegramMarket("<b>Bold</b> text<br>next", {
      fetchFn: makeFetch(capture) as never,
    });

    const sent = JSON.parse(capture.body) as { text: string };
    expect(sent.text).not.toMatch(/<[^>]+>/);
    expect(sent.text).toContain("Bold");
    expect(sent.text).toContain("text");
    expect(sent.text).toContain("next");
  });

  it("leaves plain text unchanged", async () => {
    Bun.env["TELEGRAM_BOT_TOKEN"] = "test-token";
    Bun.env["TELEGRAM_INFO_MARKET_GROUP_ID"] = "-100123";

    const capture = { body: "" };
    await sendTelegramMarket("GAS tăng 5% khối lượng bất thường", {
      fetchFn: makeFetch(capture) as never,
    });

    const sent = JSON.parse(capture.body) as { text: string };
    expect(sent.text).toBe("GAS tăng 5% khối lượng bất thường");
  });
});
