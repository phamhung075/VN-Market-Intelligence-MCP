Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1485 — Telegram mock.module isolation regression
 *
 * Proves that mock.module() is process-global in Bun:
 *   - When a file stubs telegram.js, the cached stub persists in the worker.
 *   - The fix: load real module via absolute-path+query-bust, bypassing the cache.
 *
 * GREEN phase: both tests pass after applying the isolation guard pattern.
 */

import { describe, it, expect } from "bun:test";
import { mock } from "bun:test";

// Load real telegram module via cache-bust (bypasses any prior mock.module stub)
const _realMod1485 = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1485"
);

describe("Task 1485 — mock.module isolation regression", () => {
  it("GREEN: after stub is registered, cache-busted real module returns boolean", async () => {
    // Step 1 — simulate 047 stub (CoreSendResult-shape, not boolean)
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramMarket: async (_msg: string, _opts?: unknown) => ({ ok: true, result: {} }),
      notifyTelegramAlert: async () => ({ ok: true }),
      notifyTelegramDocument: async () => ({ ok: true }),
      sendTelegramWork: async () => ({ ok: true }),
      sendTelegramBug: async () => ({ ok: true }),
    }));

    // Step 2 — confirm stub is active via normal import (receives stub due to module cache)
    const { sendTelegramMarket: stubbed } = await import(
      "../infrastructure/notifiers/telegram.js"
    );

    // Step 3 — confirm stub is active (returns object, not boolean)
    const stubResult = await stubbed("test");
    expect(typeof stubResult).toBe("object"); // stub shape

    // Step 4 — use cache-busted real module (isolation guard pattern)
    // _realMod1485 was loaded at file top BEFORE any stub was registered for this file's context
    delete (Bun.env as Record<string, string | undefined>).TELEGRAM_BOT_TOKEN;
    delete (Bun.env as Record<string, string | undefined>).TELEGRAM_INFO_MARKET_GROUP_ID;

    const result = await _realMod1485.sendTelegramMarket("hello");
    // GREEN: cache-busted module is the real implementation — returns boolean false (no token)
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });

  it("GREEN: 034-style real module via cache-bust returns boolean true on successful send", async () => {
    // Set stub again (simulates 047 running before 034 in process)
    mock.module("../infrastructure/notifiers/telegram.js", () => ({
      sendTelegramMarket: async () => ({ ok: true, result: {} }),
      notifyTelegramAlert: async () => ({ ok: true }),
      notifyTelegramDocument: async () => ({ ok: true }),
      sendTelegramWork: async () => ({ ok: true }),
      sendTelegramBug: async () => ({ ok: true }),
    }));

    // Victim fix (034-style): use _realMod directly, not await import("../telegram.js")
    const { sendTelegramMarket } = _realMod1485;

    // With token present, real impl returns boolean true
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "99999";

    const mockFetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: {} }),
        text: async () => '{"ok":true}',
      } as unknown as Response);

    const result = await sendTelegramMarket("hello", { fetchFn: mockFetch });

    // GREEN: real module returns boolean true (stub is bypassed via cache-bust)
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
  });
});
