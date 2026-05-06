Bun.env["DB_PATH"] = ":memory:";
Bun.env["TELEGRAM_BOT_TOKEN"] = "test-token";
Bun.env["TELEGRAM_REPORT_BUG_CHANNEL_ID"] = "-1001234567890";

/**
 * Hotfix — deleteTelegramBug: Telegram API response body must be parsed
 *
 * Root cause: the function only checks response.ok (HTTP status).
 * When Telegram returns HTTP 200 with {"ok":false,...}, the function
 * incorrectly returns true. When Telegram returns a non-2xx, the error
 * is silently swallowed with no log, making diagnosis impossible.
 *
 * Fix: parse the JSON body and check body.ok (Telegram API field).
 *      Log the error description on failure.
 */

import { describe, it, expect } from "bun:test";
import { deleteTelegramBug } from "../infrastructure/notifiers/telegram.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type MockFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function makeFetch(status: number, body: object): MockFetchFn {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Hotfix — deleteTelegramBug: parses Telegram API response body", () => {
  it("returns true when HTTP 200 AND body.ok=true", async () => {
    const fetchFn = makeFetch(200, { ok: true, result: true });
    const result = await deleteTelegramBug(42, { fetchFn });
    expect(result).toBe(true);
  });

  it("returns false when HTTP 200 BUT body.ok=false (Telegram API error)", async () => {
    // This is the bug: HTTP 200 with {"ok":false} was previously returning true
    const fetchFn = makeFetch(200, {
      ok: false,
      error_code: 400,
      description: "Bad Request: message to delete not found",
    });
    const result = await deleteTelegramBug(42, { fetchFn });
    expect(result).toBe(false);
  });

  it("returns false when HTTP 403 (bot lacks delete permissions)", async () => {
    const fetchFn = makeFetch(403, {
      ok: false,
      error_code: 403,
      description: "Forbidden: bot is not a member of the channel chat",
    });
    const result = await deleteTelegramBug(42, { fetchFn });
    expect(result).toBe(false);
  });

  it("returns false when HTTP 400 (bad message_id format)", async () => {
    const fetchFn = makeFetch(400, {
      ok: false,
      error_code: 400,
      description: "Bad Request: message_id is empty",
    });
    const result = await deleteTelegramBug(42, { fetchFn });
    expect(result).toBe(false);
  });

  it("returns false when messageId <= 0 (guard unchanged)", async () => {
    const calls: string[] = [];
    const fetchFn: MockFetchFn = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const result = await deleteTelegramBug(0, { fetchFn });
    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("returns false when fetch throws (network error)", async () => {
    const fetchFn: MockFetchFn = async () => {
      throw new Error("Network timeout");
    };
    const result = await deleteTelegramBug(42, { fetchFn });
    expect(result).toBe(false);
  });

  it("sends correct chat_id and message_id in request body", async () => {
    let captured: { chat_id: string; message_id: number } | null = null;
    const fetchFn: MockFetchFn = async (_url, init) => {
      captured = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    };
    await deleteTelegramBug(999, { fetchFn });
    expect(captured).not.toBeNull();
    expect(captured!.chat_id).toBe("-1001234567890");
    expect(captured!.message_id).toBe(999);
  });
});
