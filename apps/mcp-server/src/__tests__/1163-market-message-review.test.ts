Bun.env["DB_PATH"] = ":memory:";
// Isolation guard: load real telegram module bypassing Bun mock cache.
// 1485/047 register a process-global stub; this cache-busts it via absolute path+query.
const _telegramRealMod = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1163"
);
/**
 * Task 1163 — MARKET Message Quality Review System (TDD red phase)
 *
 * Tests cover AC-1 through AC-12 from REQ-068:
 *
 *   AC-1:  market_messages table + 4 indexes created by initDatabase()
 *   AC-2:  insertMarketMessage persists a row with correct fields
 *   AC-3:  sendTelegramMarket inserts a row on successful send
 *   AC-4:  sendTelegramMarket does NOT insert on failed send
 *   AC-5:  get_unreviewed_market_messages returns unreviewed rows newest first
 *   AC-6:  get_unreviewed_market_messages filters by ticker
 *   AC-7:  get_unreviewed_market_messages empty state
 *   AC-8:  review_market_message sets verdict and reviewed_at
 *   AC-9:  review_market_message is idempotent
 *   AC-10: review_market_message handles unknown id
 *   AC-11: backward compatibility — existing callers without persist option
 *   AC-12: full test suite green (TypeScript compilation + all tests)
 *
 * Test isolation: Bun.env["DB_PATH"] = ":memory:" set before any import.
 * Each describe block resets the DB via closeDb() + initDatabase() in beforeEach.
 */

// Must be set before importing schema module so the module-level DB_PATH is picked up.
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Type stubs for not-yet-existent modules (task 1164/1165/1166 will create them)
// These type declarations allow bun tsc --noEmit to pass in the red phase.
// The actual imports below will fail at runtime because the modules don't exist.
// ─────────────────────────────────────────────────────────────────────────────

/** Stub: will be exported from marketMessageStore.ts in task 1164 */
type MarketMessageAgent =
  | "morning-briefing"
  | "evening-summary"
  | "alert-commander"
  | "alert-digest"
  | "france-summary"
  | "pattern-watch"
  | "calibration-report"
  | "prediction-market"
  | "weather-check"
  | "weekly-portfolio"
  | "mcp-user"
  | "unknown";

/** Stub: will be exported from marketMessageStore.ts in task 1164 */
type MarketMessageType =
  | "morning_briefing"
  | "evening_summary"
  | "alert"
  | "alert_digest"
  | "france_summary"
  | "pattern_watch"
  | "calibration_report"
  | "prediction_signal"
  | "weather"
  | "weekly_portfolio"
  | "user_ask_reply"
  | "unknown";

/** Stub: will be exported from marketMessageStore.ts in task 1164 */
interface MarketMessageRow {
  id: number;
  from_agent: string;
  message_type: string;
  ticker: string | null;
  content: string;
  sent_at: string;
  verdict: string | null;
  verdict_note: string | null;
  reviewed_at: string | null;
}

/** Stub: will be exported from marketMessageStore.ts in task 1164 */
type InsertMarketMessageFn = (
  db: import("bun:sqlite").Database,
  params: {
    from_agent: MarketMessageAgent | string;
    message_type: MarketMessageType | string;
    ticker?: string | null;
    content: string;
  },
) => number;

/** Stub: will be exported from marketMessageStore.ts in task 1164 */
type GetUnreviewedMarketMessagesFn = (
  db: import("bun:sqlite").Database,
  limit?: number,
  ticker?: string | null,
) => MarketMessageRow[];

/** Stub: will be exported from marketMessageStore.ts in task 1164 */
type ReviewMarketMessageFn = (
  db: import("bun:sqlite").Database,
  id: number,
  verdict: "signal" | "noise",
  note?: string | null,
) => boolean;

/** Stub: will be exported from marketMessageTools.ts in task 1166 */
type HandleGetUnreviewedFn = (args: {
  limit?: number;
  ticker?: string;
}) => Promise<{ content: Array<{ type: string; text: string }> }>;

/** Stub: will be exported from marketMessageTools.ts in task 1166 */
type HandleReviewFn = (args: {
  id: number;
  verdict: "signal" | "noise";
  note?: string;
}) => Promise<{ content: Array<{ type: string; text: string }> }>;

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic imports — will throw MODULE_NOT_FOUND at runtime (red phase)
// Using dynamic require pattern so TypeScript sees the typed stubs above.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const storeModule = require("../infrastructure/db/marketMessageStore.js") as {
  insertMarketMessage: InsertMarketMessageFn;
  getUnreviewedMarketMessages: GetUnreviewedMarketMessagesFn;
  reviewMarketMessage: ReviewMarketMessageFn;
};
const { insertMarketMessage, getUnreviewedMarketMessages, reviewMarketMessage } = storeModule;

// Extended sendTelegramMarket options type (persist field added in task 1165)
interface SendTelegramMarketOptions {
  parseMode?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  chatId?: number;
  persist?: {
    from_agent?: MarketMessageAgent | string;
    message_type?: MarketMessageType | string;
    ticker?: string | null;
  };
}

// Use real sendTelegramMarket from cache-busted module (bypasses 047/1485 stub)
const _sendTelegramMarketBase = _telegramRealMod.sendTelegramMarket;
const sendTelegramMarket = _sendTelegramMarketBase as (
  text: string,
  options?: SendTelegramMarketOptions,
) => Promise<boolean>;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const toolsModule = require("../interface/mcp/tools/briefings/marketMessageTools.js") as {
  handleGetUnreviewedMarketMessages: HandleGetUnreviewedFn;
  handleReviewMarketMessage: HandleReviewFn;
};
const { handleGetUnreviewedMarketMessages, handleReviewMarketMessage } = toolsModule;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seed a market_messages row directly using parameterized SQL.
 * Used in tests that need pre-existing rows without going through the store.
 */
function seedRow(params: {
  from_agent: string;
  message_type: string;
  ticker: string | null;
  content: string;
  sent_at: string;
  verdict?: string | null;
  verdict_note?: string | null;
  reviewed_at?: string | null;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO market_messages
         (from_agent, message_type, ticker, content, sent_at,
          verdict, verdict_note, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.from_agent,
      params.message_type,
      params.ticker,
      params.content,
      params.sent_at,
      params.verdict ?? null,
      params.verdict_note ?? null,
      params.reviewed_at ?? null,
    );
  return Number(result.lastInsertRowid);
}

/**
 * Mock fetch factory — returns a Response-like object.
 */
function makeMockFetch(ok: boolean, status = 200) {
  return async (_url: string, _init: RequestInit): Promise<Response> => {
    const body = ok
      ? JSON.stringify({ result: { message_id: 99 } })
      : JSON.stringify({ description: "Bad Request" });
    return {
      ok,
      status,
      json: async () => JSON.parse(body) as unknown,
      text: async () => body,
    } as unknown as Response;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. market_messages table creation (AC-1)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 1. market_messages table creation (AC-1)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("market_messages table exists after initDatabase()", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='market_messages'",
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("market_messages");
  });

  it("market_messages table has all 12 columns", () => {
    const db = getDb();
    const cols = db
      .prepare("PRAGMA table_info(market_messages)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("from_agent");
    expect(names).toContain("message_type");
    expect(names).toContain("ticker");
    expect(names).toContain("content");
    expect(names).toContain("sent_at");
    expect(names).toContain("verdict");
    expect(names).toContain("verdict_note");
    expect(names).toContain("reviewed_at");
    // Sprint 191 — impact tracking cols
    expect(names).toContain("impact_score");
    expect(names).toContain("price_at_message");
    expect(names).toContain("price_3d_after");
    expect(names).toHaveLength(12);
  });

  it("market_messages table has 4 required indexes", () => {
    const db = getDb();
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='market_messages'",
      )
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_mm_sent_at");
    expect(indexNames).toContain("idx_mm_from_agent");
    expect(indexNames).toContain("idx_mm_verdict");
    expect(indexNames).toContain("idx_mm_ticker");
  });

  it("initDatabase() is idempotent — second call does not throw", async () => {
    await expect(initDatabase()).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. insertMarketMessage (AC-2)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 2. insertMarketMessage (AC-2)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns an integer id >= 1 on insert", () => {
    const db = getDb();
    const id = insertMarketMessage(db, {
      from_agent: "alert-commander" as MarketMessageAgent,
      message_type: "alert" as MarketMessageType,
      ticker: "VCB",
      content: "test alert",
    });
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThanOrEqual(1);
  });

  it("persisted row has correct from_agent, message_type, ticker, content", () => {
    const db = getDb();
    insertMarketMessage(db, {
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "test alert",
    });

    const row = db
      .prepare("SELECT * FROM market_messages WHERE from_agent = ?")
      .get("alert-commander") as MarketMessageRow | undefined;

    expect(row).toBeDefined();
    expect(row!.from_agent).toBe("alert-commander");
    expect(row!.message_type).toBe("alert");
    expect(row!.ticker).toBe("VCB");
    expect(row!.content).toBe("test alert");
  });

  it("persisted row has verdict = null and reviewed_at = null", () => {
    const db = getDb();
    insertMarketMessage(db, {
      from_agent: "morning-briefing",
      message_type: "morning_briefing",
      ticker: null,
      content: "Buoi sang tot lanh",
    });

    const row = db
      .prepare("SELECT * FROM market_messages WHERE from_agent = ?")
      .get("morning-briefing") as MarketMessageRow | undefined;

    expect(row!.verdict).toBeNull();
    expect(row!.reviewed_at).toBeNull();
  });

  it("persisted row has a valid ISO datetime string in sent_at", () => {
    const db = getDb();
    insertMarketMessage(db, {
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VNM",
      content: "VNM price drop",
    });

    const row = db
      .prepare("SELECT * FROM market_messages WHERE ticker = ?")
      .get("VNM") as MarketMessageRow | undefined;

    expect(row!.sent_at).toBeTruthy();
    // SQLite datetime('now') returns ISO-like string e.g. "2026-04-13 02:00:00"
    expect(row!.sent_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("returns 0 (not throws) when called with missing required fields", () => {
    const db = getDb();
    // Pass empty content — should not throw, returns 0 on internal validation
    // (This is the best-effort / never-throws contract)
    let id: number;
    expect(() => {
      id = insertMarketMessage(db, {
        from_agent: "unknown",
        message_type: "unknown",
        content: "", // empty content is still valid SQL, but tests the try/catch path
      });
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. getUnreviewedMarketMessages — ordering (AC-5)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 3. getUnreviewedMarketMessages ordering (AC-5)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns only unreviewed rows, newest first", () => {
    // Row A — older, unreviewed
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "row A",
      sent_at: "2026-04-13 01:00:00",
      verdict: null,
    });
    // Row B — newer, unreviewed
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VNM",
      content: "row B",
      sent_at: "2026-04-13 02:00:00",
      verdict: null,
    });
    // Row C — newest, already reviewed
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "HPG",
      content: "row C",
      sent_at: "2026-04-13 03:00:00",
      verdict: "signal",
      reviewed_at: "2026-04-13 03:30:00",
    });

    const db = getDb();
    const rows = getUnreviewedMarketMessages(db);

    // Only A and B, not C
    expect(rows).toHaveLength(2);
    // Newest first: B before A
    expect(rows[0]!.content).toBe("row B");
    expect(rows[1]!.content).toBe("row A");
  });

  it("excludes reviewed rows from results", () => {
    seedRow({
      from_agent: "morning-briefing",
      message_type: "morning_briefing",
      ticker: null,
      content: "reviewed",
      sent_at: "2026-04-13 06:00:00",
      verdict: "noise",
      reviewed_at: "2026-04-13 07:00:00",
    });

    const db = getDb();
    const rows = getUnreviewedMarketMessages(db);
    expect(rows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. getUnreviewedMarketMessages — ticker filter (AC-6)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 4. getUnreviewedMarketMessages ticker filter (AC-6)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("filters by ticker — returns only matching ticker row", () => {
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB alert",
      sent_at: "2026-04-13 01:00:00",
    });
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VNM",
      content: "VNM alert",
      sent_at: "2026-04-13 01:01:00",
    });
    seedRow({
      from_agent: "morning-briefing",
      message_type: "morning_briefing",
      ticker: null,
      content: "general briefing",
      sent_at: "2026-04-13 06:00:00",
    });

    const db = getDb();
    const rows = getUnreviewedMarketMessages(db, 20, "VCB");

    expect(rows).toHaveLength(1);
    expect(rows[0]!.ticker).toBe("VCB");
    expect(rows[0]!.content).toBe("VCB alert");
  });

  it("no filter returns all unreviewed rows regardless of ticker", () => {
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB alert",
      sent_at: "2026-04-13 01:00:00",
    });
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VNM",
      content: "VNM alert",
      sent_at: "2026-04-13 01:01:00",
    });
    seedRow({
      from_agent: "morning-briefing",
      message_type: "morning_briefing",
      ticker: null,
      content: "general briefing",
      sent_at: "2026-04-13 06:00:00",
    });

    const db = getDb();
    const rows = getUnreviewedMarketMessages(db);
    expect(rows).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. getUnreviewedMarketMessages — empty state (AC-7)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 5. getUnreviewedMarketMessages empty state (AC-7)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns empty array when all rows are reviewed", () => {
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB alert reviewed",
      sent_at: "2026-04-13 01:00:00",
      verdict: "signal",
      reviewed_at: "2026-04-13 02:00:00",
    });

    const db = getDb();
    const rows = getUnreviewedMarketMessages(db);
    expect(rows).toEqual([]);
  });

  it("returns empty array on completely empty table", () => {
    const db = getDb();
    const rows = getUnreviewedMarketMessages(db);
    expect(rows).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. reviewMarketMessage — success (AC-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 6. reviewMarketMessage success (AC-8)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("sets verdict, verdict_note, and reviewed_at on the target row", () => {
    const id = seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB drop 3%",
      sent_at: "2026-04-13 01:00:00",
      verdict: null,
    });

    const db = getDb();
    const updated = reviewMarketMessage(db, id, "noise", "VCB recovered same day");

    expect(updated).toBe(true);

    const row = db
      .prepare("SELECT * FROM market_messages WHERE id = ?")
      .get(id) as MarketMessageRow | undefined;

    expect(row!.verdict).toBe("noise");
    expect(row!.verdict_note).toBe("VCB recovered same day");
    expect(row!.reviewed_at).toBeTruthy();
    expect(row!.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("returns true when row found and updated", () => {
    const id = seedRow({
      from_agent: "morning-briefing",
      message_type: "morning_briefing",
      ticker: null,
      content: "briefing",
      sent_at: "2026-04-13 06:00:00",
    });

    const db = getDb();
    const result = reviewMarketMessage(db, id, "signal");
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. reviewMarketMessage — idempotent (AC-9)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 7. reviewMarketMessage idempotent (AC-9)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("second call overwrites previous verdict — no error thrown", () => {
    const id = seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB drop",
      sent_at: "2026-04-13 01:00:00",
      verdict: "noise",
      reviewed_at: "2026-04-13 02:00:00",
    });

    const db = getDb();

    // Overwrite noise → signal
    expect(() => {
      reviewMarketMessage(db, id, "signal");
    }).not.toThrow();

    const row = db
      .prepare("SELECT * FROM market_messages WHERE id = ?")
      .get(id) as MarketMessageRow | undefined;

    expect(row!.verdict).toBe("signal");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. reviewMarketMessage — unknown id (AC-10)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 8. reviewMarketMessage unknown id (AC-10)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns false for an id that does not exist", () => {
    const db = getDb();
    const result = reviewMarketMessage(db, 999, "signal");
    expect(result).toBe(false);
  });

  it("does not throw when id is not found", () => {
    const db = getDb();
    expect(() => {
      reviewMarketMessage(db, 99999, "noise");
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. reviewMarketMessage — invalid verdict (edge case)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 9. reviewMarketMessage invalid verdict (edge case)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("throws Error('Invalid verdict') for value outside signal/noise", () => {
    const id = seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "test",
      sent_at: "2026-04-13 01:00:00",
    });

    const db = getDb();
    expect(() => {
      // Cast to bypass TypeScript — tests runtime guard
      reviewMarketMessage(db, id, "maybe" as "signal" | "noise");
    }).toThrow("Invalid verdict");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. sendTelegramMarket — persist on success (AC-3)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 10. sendTelegramMarket persist on success (AC-3)", () => {
  beforeEach(async () => {
    closeDb();
    // Set minimal env vars so coreSend() proceeds past the early-exit guards
    process.env["TELEGRAM_BOT_TOKEN"] = "test-token";
    process.env["TELEGRAM_INFO_MARKET_GROUP_ID"] = "123456";
    await initDatabase();
  });

  afterEach(() => {
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_INFO_MARKET_GROUP_ID"];
    closeDb();
  });

  it("returns true and inserts one row on successful send", async () => {
    const mockFetch = makeMockFetch(true, 200);

    const result = await sendTelegramMarket("hello morning briefing", {
      fetchFn: mockFetch,
      persist: {
        from_agent: "morning-briefing" as MarketMessageAgent,
        message_type: "morning_briefing" as MarketMessageType,
      },
    });

    expect(result).toBe(true);

    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM market_messages WHERE from_agent = ?")
      .all("morning-briefing") as MarketMessageRow[];

    expect(rows).toHaveLength(1);
    expect(rows[0]!.content).toBe("hello morning briefing");
    expect(rows[0]!.from_agent).toBe("morning-briefing");
    expect(rows[0]!.message_type).toBe("morning_briefing");
  });

  it("inserted row has null ticker when persist.ticker is omitted", async () => {
    const mockFetch = makeMockFetch(true, 200);

    await sendTelegramMarket("briefing text", {
      fetchFn: mockFetch,
      persist: {
        from_agent: "evening-summary",
        message_type: "evening_summary",
      },
    });

    const db = getDb();
    const row = db
      .prepare("SELECT * FROM market_messages WHERE from_agent = ?")
      .get("evening-summary") as MarketMessageRow | undefined;

    expect(row).toBeDefined();
    expect(row!.ticker).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. sendTelegramMarket — no persist on failed send (AC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 11. sendTelegramMarket no persist on failure (AC-4)", () => {
  beforeEach(async () => {
    closeDb();
    process.env["TELEGRAM_BOT_TOKEN"] = "test-token";
    process.env["TELEGRAM_INFO_MARKET_GROUP_ID"] = "123456";
    await initDatabase();
  });

  afterEach(() => {
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_INFO_MARKET_GROUP_ID"];
    closeDb();
  });

  it("returns false and inserts zero rows on failed send", async () => {
    const mockFetch = makeMockFetch(false, 400);

    const result = await sendTelegramMarket("hello", {
      fetchFn: mockFetch,
      persist: {
        from_agent: "morning-briefing",
        message_type: "morning_briefing",
      },
    });

    expect(result).toBe(false);

    const db = getDb();
    const count = db
      .prepare("SELECT COUNT(*) as cnt FROM market_messages")
      .get() as { cnt: number };

    expect(count.cnt).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. sendTelegramMarket — backward compat without persist option (AC-11)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 12. sendTelegramMarket backward compat without persist (AC-11)", () => {
  beforeEach(async () => {
    closeDb();
    process.env["TELEGRAM_BOT_TOKEN"] = "test-token";
    process.env["TELEGRAM_INFO_MARKET_GROUP_ID"] = "123456";
    await initDatabase();
  });

  afterEach(() => {
    delete process.env["TELEGRAM_BOT_TOKEN"];
    delete process.env["TELEGRAM_INFO_MARKET_GROUP_ID"];
    closeDb();
  });

  it("compiles and returns true when called without persist option", async () => {
    const mockFetch = makeMockFetch(true, 200);

    // TypeScript must accept this call without error (no persist field)
    const result = await sendTelegramMarket("some message", {
      fetchFn: mockFetch,
    });

    expect(result).toBe(true);
  });

  it("inserts row with from_agent='unknown', message_type='unknown', ticker=null when persist omitted", async () => {
    const mockFetch = makeMockFetch(true, 200);

    await sendTelegramMarket("backward compat message", {
      fetchFn: mockFetch,
    });

    const db = getDb();
    const row = db
      .prepare(
        "SELECT * FROM market_messages WHERE content = ?",
      )
      .get("backward compat message") as MarketMessageRow | undefined;

    expect(row).toBeDefined();
    expect(row!.from_agent).toBe("unknown");
    expect(row!.message_type).toBe("unknown");
    expect(row!.ticker).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. get_unreviewed_market_messages MCP tool — rows exist (AC-5)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 13. get_unreviewed_market_messages tool rows exist (AC-5)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns JSON array with correct structure, newest first", async () => {
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB older alert",
      sent_at: "2026-04-13 01:00:00",
    });
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VNM",
      content: "VNM newer alert",
      sent_at: "2026-04-13 02:00:00",
    });

    const result = await handleGetUnreviewedMarketMessages({ limit: 20 });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");

    const parsed = JSON.parse(result.content[0]!.text) as MarketMessageRow[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    // Newest first
    expect(parsed[0]!.ticker).toBe("VNM");
    expect(parsed[1]!.ticker).toBe("VCB");
  });

  it("each row has the expected shape with id, verdict=null, reviewed_at=null", async () => {
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "HPG",
      content: "HPG alert",
      sent_at: "2026-04-13 03:00:00",
    });

    const result = await handleGetUnreviewedMarketMessages({ limit: 20 });
    const parsed = JSON.parse(result.content[0]!.text) as MarketMessageRow[];
    const row = parsed[0]!;

    expect(typeof row.id).toBe("number");
    expect(row.id).toBeGreaterThanOrEqual(1);
    expect(row.from_agent).toBe("alert-commander");
    expect(row.message_type).toBe("alert");
    expect(row.ticker).toBe("HPG");
    expect(row.verdict).toBeNull();
    expect(row.reviewed_at).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. get_unreviewed_market_messages MCP tool — empty state (AC-7)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 14. get_unreviewed_market_messages tool empty state (AC-7)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns bilingual plain-text message when no unreviewed rows", async () => {
    const result = await handleGetUnreviewedMarketMessages({ limit: 20 });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toBe(
      "Không có tin nhắn chưa review. Tất cả đã được đánh giá.",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. get_unreviewed_market_messages MCP tool — ticker filter (AC-6)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 15. get_unreviewed_market_messages tool ticker filter (AC-6)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns only rows matching the requested ticker", async () => {
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB alert",
      sent_at: "2026-04-13 01:00:00",
    });
    seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VNM",
      content: "VNM alert",
      sent_at: "2026-04-13 01:01:00",
    });

    const result = await handleGetUnreviewedMarketMessages({
      limit: 20,
      ticker: "VCB",
    });

    const parsed = JSON.parse(result.content[0]!.text) as MarketMessageRow[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.ticker).toBe("VCB");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. review_market_message MCP tool — success with note (AC-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 16. review_market_message tool success with note (AC-8)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns correct success message with note line", async () => {
    const id = seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB drop 3%",
      sent_at: "2026-04-13 01:00:00",
    });

    const result = await handleReviewMarketMessage({
      id,
      verdict: "noise",
      note: "VCB recovered same day",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toBe(
      `Message ${id} labelled as 'noise'. Note saved.`,
    );
  });

  it("row has verdict, verdict_note, and non-null reviewed_at after tool call", async () => {
    const id = seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB drop",
      sent_at: "2026-04-13 01:00:00",
    });

    await handleReviewMarketMessage({
      id,
      verdict: "noise",
      note: "VCB recovered same day",
    });

    const db = getDb();
    const row = db
      .prepare("SELECT * FROM market_messages WHERE id = ?")
      .get(id) as MarketMessageRow | undefined;

    expect(row!.verdict).toBe("noise");
    expect(row!.verdict_note).toBe("VCB recovered same day");
    expect(row!.reviewed_at).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. review_market_message MCP tool — success without note (AC-8)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 17. review_market_message tool success without note (AC-8)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns success message without trailing note line when no note provided", async () => {
    const id = seedRow({
      from_agent: "morning-briefing",
      message_type: "morning_briefing",
      ticker: null,
      content: "morning briefing text",
      sent_at: "2026-04-13 06:00:00",
    });

    const result = await handleReviewMarketMessage({
      id,
      verdict: "signal",
    });

    expect(result.content[0]!.text).toBe(
      `Message ${id} labelled as 'signal'.`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. review_market_message MCP tool — idempotent (AC-9)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 18. review_market_message tool idempotent (AC-9)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("second call overwrites verdict and returns success without error", async () => {
    const id = seedRow({
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB drop",
      sent_at: "2026-04-13 01:00:00",
      verdict: "noise",
      reviewed_at: "2026-04-13 02:00:00",
    });

    // Overwrite noise → signal
    const result = await handleReviewMarketMessage({
      id,
      verdict: "signal",
    });

    expect(result.content[0]!.text).toBe(
      `Message ${id} labelled as 'signal'.`,
    );

    const db = getDb();
    const row = db
      .prepare("SELECT * FROM market_messages WHERE id = ?")
      .get(id) as MarketMessageRow | undefined;

    expect(row!.verdict).toBe("signal");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. review_market_message MCP tool — unknown id (AC-10)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1163 — 19. review_market_message tool unknown id (AC-10)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns 'Message 999 not found.' for missing id", async () => {
    const result = await handleReviewMarketMessage({
      id: 999,
      verdict: "signal",
    });

    expect(result.content[0]!.text).toBe("Message 999 not found.");
  });

  it("does not throw when id is not found", async () => {
    await expect(
      handleReviewMarketMessage({ id: 99999, verdict: "noise" }),
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Global afterAll — final cleanup
// ─────────────────────────────────────────────────────────────────────────────

afterAll(() => {
  closeDb();
});
