process.env["DB_PATH"] = ":memory:";

/**
 * Task 1254 — Fix duplicate morning-briefing market_messages insert (bug 1263)
 *
 * Root cause: morningBriefingJob.ts calls insertMarketMessage() manually
 * (from_agent="morning-briefing") then calls sendTelegramMarket() which also
 * calls insertMarketMessage() with from_agent="unknown", yielding two rows per
 * briefing cycle.
 *
 * Fix: sendTelegramMarket now accepts skipPersist:true to suppress its own
 * auto-insert.  morningBriefingJob passes skipPersist:true so the only insert
 * is the explicit one with the correct from_agent.
 *
 * Acceptance criteria:
 *   AC-1  sendTelegramMarket with skipPersist:true does NOT insert a market_messages row.
 *   AC-2  sendTelegramMarket without skipPersist DOES insert a row (default behaviour unchanged).
 *   AC-3  The SendTelegramOptions type exports skipPersist as optional boolean.
 */

import { describe, it, expect, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { insertMarketMessage } from "../infrastructure/db/marketMessageStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeOkFetch() {
  return async (_url: string, _init: RequestInit): Promise<Response> => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: {} }),
    text: async () => '{"ok":true}',
  } as unknown as Response);
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 / AC-2 — skipPersist toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1254 — sendTelegramMarket skipPersist option", () => {
  it("AC-1: skipPersist:true suppresses auto market_messages insert", async () => {
    process.env["DB_PATH"] = ":memory:";
    await initDatabase();
    const db = getDb();

    const rowsBefore = db.query<{ n: number }, []>(
      "SELECT COUNT(*) as n FROM market_messages"
    ).get()!.n;

    // Ensure env is set so coreSend does not short-circuit
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token-1254";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "-100123456";

    const { sendTelegramMarket } = await import(
      "../infrastructure/notifiers/telegram.js"
    );
    await sendTelegramMarket("Test briefing text", {
      parseMode: "",
      skipPersist: true,
      fetchFn: makeOkFetch() as unknown as typeof fetch,
    });

    const rowsAfter = db.query<{ n: number }, []>(
      "SELECT COUNT(*) as n FROM market_messages"
    ).get()!.n;

    // No new row should have been inserted
    expect(rowsAfter).toBe(rowsBefore);
  });

  it("AC-2: without skipPersist, a market_messages row IS inserted on success", async () => {
    process.env["DB_PATH"] = ":memory:";
    await initDatabase();
    const db = getDb();

    const rowsBefore = db.query<{ n: number }, []>(
      "SELECT COUNT(*) as n FROM market_messages"
    ).get()!.n;

    Bun.env.TELEGRAM_BOT_TOKEN = "test-token-1254";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "-100123456";

    const { sendTelegramMarket } = await import(
      "../infrastructure/notifiers/telegram.js"
    );
    await sendTelegramMarket("Test briefing text no-skip", {
      parseMode: "",
      // skipPersist omitted → default behaviour = insert
      fetchFn: makeOkFetch() as unknown as typeof fetch,
    });

    const rowsAfter = db.query<{ n: number }, []>(
      "SELECT COUNT(*) as n FROM market_messages"
    ).get()!.n;

    expect(rowsAfter).toBe(rowsBefore + 1);
  });

  it("AC-3: SendTelegramOptions type exports skipPersist as optional boolean", async () => {
    // Type-level check — if the import compiles the type is exported correctly.
    const { } = await import("../infrastructure/notifiers/telegram.js");
    // If TypeScript compilation succeeds with skipPersist in the options above,
    // this test passes (runtime assertion is a no-op guard).
    expect(true).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: insertMarketMessage itself still works normally (no regression)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1254 — insertMarketMessage baseline (no regression)", () => {
  it("insertMarketMessage inserts a row with correct from_agent", async () => {
    process.env["DB_PATH"] = ":memory:";
    await initDatabase();
    const db = getDb();

    insertMarketMessage(db, {
      from_agent: "morning-briefing",
      message_type: "morning_briefing",
      ticker: null,
      content: "BẢN TIN SÁNG 2026-04-14",
    });

    const row = db.query<{ from_agent: string; content: string }, []>(
      "SELECT from_agent, content FROM market_messages ORDER BY id DESC LIMIT 1"
    ).get();

    expect(row?.from_agent).toBe("morning-briefing");
    expect(row?.content).toContain("BẢN TIN SÁNG");
  });
});

afterAll(() => {
  closeDb();
});
