/**
 * Task 1168 — Market Message Digest + Batch Review (TDD red phase)
 *
 * Tests cover AC-1 through AC-12 from REQ-069:
 *
 *   AC-1:  getMarketMessageDigest returns grouped entries (date/from_agent),
 *          correct counts, ids, preview, ordering; reviewed rows excluded
 *   AC-2:  getMarketMessageDigest respects limit_days date cutoff
 *   AC-3:  getMarketMessageDigest empty state returns []
 *   AC-4:  batchReviewMarketMessages updates all ids in one transaction,
 *          sets verdict_note and reviewed_at
 *   AC-5:  batchReviewMarketMessages reports notFound ids
 *   AC-6:  batchReviewMarketMessages empty ids returns immediately
 *   AC-7:  batchReviewMarketMessages rejects invalid verdict
 *   AC-8:  get_market_message_digest MCP tool returns formatted digest text
 *   AC-9:  get_market_message_digest MCP tool empty state message
 *   AC-10: batch_review_market_messages MCP tool success — all found
 *   AC-11: batch_review_market_messages MCP tool — partial notFound
 *   AC-12: batch_review_market_messages MCP tool — with note
 *
 * Additional edge cases:
 *   - id_list with single row parses correctly
 *   - default limit_days=7 includes/excludes correctly
 *   - limit_days clamped to min=1 and max=30 at store level
 *   - idempotent overwrite (second verdict wins)
 *   - all 200 ids not found
 *   - MCP tool all not found
 *   - MCP tool invalid verdict error path
 *
 * Test isolation: Bun.env["DB_PATH"] = ":memory:" set before any import.
 * Each test resets DB via closeDb() + await initDatabase() in beforeEach/afterEach.
 */

// Must be set before importing schema module so module-level DB_PATH is picked up.
Bun.env["DB_PATH"] = ":memory:";
// Safety guard: abort immediately if DB_PATH was overridden to a real file path.
// This test seeds rows with hardcoded ids 10-14 and must never run against production.
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[1168] DB_PATH must be ':memory:' in tests, got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Type stubs for not-yet-existent exports (tasks 1169/1170 will create them).
// These allow bun tsc --noEmit to pass in the red phase.
// ─────────────────────────────────────────────────────────────────────────────

/** Stub: will be exported from marketMessageStore.ts in task 1169 */
interface MarketMessageDigestEntry {
  date: string;
  from_agent: string;
  count: number;
  ids: number[];
  preview: string;
}

/** Stub: will be exported from marketMessageStore.ts in task 1169 */
interface BatchReviewResult {
  updated: number;
  notFound: number[];
}

type GetMarketMessageDigestFn = (
  db: import("bun:sqlite").Database,
  limit_days?: number,
) => MarketMessageDigestEntry[];

type BatchReviewMarketMessagesFn = (
  db: import("bun:sqlite").Database,
  ids: number[],
  verdict: "signal" | "noise",
  note?: string | null,
) => BatchReviewResult;

/** Stub: already exported from marketMessageStore.ts (task 1164) */
type InsertMarketMessageFn = (
  db: import("bun:sqlite").Database,
  params: {
    from_agent: string;
    message_type: string;
    ticker?: string | null;
    content: string;
  },
) => number;

/** Stub: will be exported from marketMessageTools.ts in task 1170 */
type HandleGetMarketMessageDigestFn = (args: {
  limit_days?: number | undefined;
}) => Promise<{ content: Array<{ type: string; text: string }> }>;

/** Stub: will be exported from marketMessageTools.ts in task 1170 */
type HandleBatchReviewMarketMessagesFn = (args: {
  ids: number[];
  verdict: "signal" | "noise";
  note?: string | undefined;
}) => Promise<{ content: Array<{ type: string; text: string }> }>;

// ─────────────────────────────────────────────────────────────────────────────
// ESM imports — tasks 1169/1170 are done; functions are live exports.
// ─────────────────────────────────────────────────────────────────────────────

import {
  insertMarketMessage as _insertMarketMessage,
  getMarketMessageDigest,
  batchReviewMarketMessages,
} from "../infrastructure/db/marketMessageStore.js";
// insertMarketMessage used via seedRow helper; aliased to avoid unused-var lint
void _insertMarketMessage;

import {
  handleGetMarketMessageDigest,
  handleBatchReviewMarketMessages,
} from "../interface/mcp/tools/briefings/marketMessageTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // closeDb() first to guard against contamination: if another test file in the
  // same Bun worker left _db non-null with rows, initDatabase() would reuse it.
  closeDb();
  await initDatabase();
});
afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers — relative to today so tests never drift with calendar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns "YYYY-MM-DD HH:MM:SS" for N calendar days ago at the given time.
 * Defaults to "08:00:00" when no time is supplied.
 */
function daysAgo(n: number, time = "08:00:00"): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${time}`;
}

/**
 * Returns "YYYY-MM-DD" for N calendar days ago.
 */
function dateOnly(n: number): string {
  return daysAgo(n).slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seed a market_messages row with explicit sent_at and optional verdict.
 * Uses parameterized SQL — no string interpolation of user data.
 */
function seedRow(params: {
  from_agent: string;
  message_type: string;
  ticker?: string | null;
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
      params.ticker ?? null,
      params.content,
      params.sent_at,
      params.verdict ?? null,
      params.verdict_note ?? null,
      params.reviewed_at ?? null,
    );
  return Number(result.lastInsertRowid);
}

/**
 * Seed a market_messages row with an explicit id using INSERT OR REPLACE.
 * Allows AC-1 scenario to control specific row ids for assertion clarity.
 */
function seedRowWithId(id: number, params: {
  from_agent: string;
  message_type: string;
  ticker?: string | null;
  content: string;
  sent_at: string;
  verdict?: string | null;
  verdict_note?: string | null;
  reviewed_at?: string | null;
}): void {
  const db = getDb();
  db
    .prepare(
      `INSERT OR REPLACE INTO market_messages
         (id, from_agent, message_type, ticker, content, sent_at,
          verdict, verdict_note, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      params.from_agent,
      params.message_type,
      params.ticker ?? null,
      params.content,
      params.sent_at,
      params.verdict ?? null,
      params.verdict_note ?? null,
      params.reviewed_at ?? null,
    );
}

/**
 * Select a raw market_messages row by id for assertion.
 */
function selectRow(id: number): {
  id: number;
  verdict: string | null;
  verdict_note: string | null;
  reviewed_at: string | null;
} | null {
  const db = getDb();
  return (
    db
      .prepare<
        { id: number; verdict: string | null; verdict_note: string | null; reviewed_at: string | null },
        [number]
      >(
        `SELECT id, verdict, verdict_note, reviewed_at
         FROM market_messages
         WHERE id = ?`,
      )
      .get(id) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// getMarketMessageDigest — store-level tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1168 — getMarketMessageDigest", () => {
  it("AC-1: returns 3 grouped entries from 5 seeded rows (one already reviewed)", () => {
    const db = getDb();

    // 5 rows per AC-1 scenario. All dates are within 7-day window.
    // ids 10,11 from alert-commander 6 days ago — unreviewed
    // id 12 from morning-briefing 6 days ago — unreviewed
    // id 13 from alert-commander 7 days ago — unreviewed
    // id 14 from alert-commander 7 days ago — already reviewed (verdict signal)
    seedRowWithId(10, { from_agent: "alert-commander", message_type: "alert", content: "Alert content 10", sent_at: daysAgo(6, "08:00:00") });
    seedRowWithId(11, { from_agent: "alert-commander", message_type: "alert", content: "Alert content 11", sent_at: daysAgo(6, "09:00:00") });
    seedRowWithId(12, { from_agent: "morning-briefing", message_type: "morning_briefing", content: "Briefing 13/04 content", sent_at: daysAgo(6, "06:00:00") });
    seedRowWithId(13, { from_agent: "alert-commander", message_type: "alert", content: "Alert content 13", sent_at: daysAgo(7, "10:00:00") });
    seedRowWithId(14, { from_agent: "alert-commander", message_type: "alert", content: "Alert content 14 already reviewed", sent_at: daysAgo(7, "11:00:00"), verdict: "signal", reviewed_at: daysAgo(6, "12:00:00") });

    const entries = getMarketMessageDigest(db, 7);

    // 3 entries total: id 14 excluded (verdict = "signal")
    expect(entries).toHaveLength(3);

    // Entries ordered date DESC, then agent ASC
    expect(entries[0]!.date).toBe(dateOnly(6));
    expect(entries[0]!.from_agent).toBe("alert-commander");
    expect(entries[1]!.date).toBe(dateOnly(6));
    expect(entries[1]!.from_agent).toBe("morning-briefing");
    expect(entries[2]!.date).toBe(dateOnly(7));
    expect(entries[2]!.from_agent).toBe("alert-commander");
  });

  it("AC-1: alert-commander 6-days-ago entry has count=2 and ids containing 10 and 11", () => {
    const db = getDb();

    seedRowWithId(10, { from_agent: "alert-commander", message_type: "alert", content: "Content for id 10", sent_at: daysAgo(6, "08:00:00") });
    seedRowWithId(11, { from_agent: "alert-commander", message_type: "alert", content: "Content for id 11", sent_at: daysAgo(6, "09:00:00") });

    const entries = getMarketMessageDigest(db, 7);
    const entry = entries.find(e => e.date === dateOnly(6) && e.from_agent === "alert-commander");

    expect(entry).toBeDefined();
    expect(entry!.count).toBe(2);
    expect(entry!.ids).toContain(10);
    expect(entry!.ids).toContain(11);
  });

  it("AC-1: morning-briefing 6-days-ago entry has count=1 and ids=[12]", () => {
    const db = getDb();

    seedRowWithId(12, { from_agent: "morning-briefing", message_type: "morning_briefing", content: "Briefing content 12", sent_at: daysAgo(6, "06:00:00") });

    const entries = getMarketMessageDigest(db, 7);
    const entry = entries.find(e => e.date === dateOnly(6) && e.from_agent === "morning-briefing");

    expect(entry).toBeDefined();
    expect(entry!.count).toBe(1);
    expect(entry!.ids).toEqual([12]);
  });

  it("AC-1: excludes rows where verdict is not null", () => {
    const db = getDb();

    seedRowWithId(14, { from_agent: "alert-commander", message_type: "alert", content: "Already reviewed", sent_at: daysAgo(7, "11:00:00"), verdict: "signal", reviewed_at: daysAgo(6, "00:00:00") });

    const entries = getMarketMessageDigest(db, 7);
    const match = entries.find(e => e.ids.includes(14));
    expect(match).toBeUndefined();
  });

  it("AC-2: row 8 days ago with limit_days=7 is excluded", () => {
    const db = getDb();

    db.prepare(
      `INSERT INTO market_messages
         (from_agent, message_type, ticker, content, sent_at, verdict, verdict_note, reviewed_at)
       VALUES (?, ?, ?, ?, datetime('now', '-8 days'), ?, ?, ?)`,
    ).run("morning-briefing", "morning_briefing", null, "Old briefing 8 days ago", null, null, null);

    const entries = getMarketMessageDigest(db, 7);
    expect(entries).toHaveLength(0);
  });

  it("AC-2: row 1 day ago is included with limit_days=7", () => {
    const db = getDb();

    db.prepare(
      `INSERT INTO market_messages
         (from_agent, message_type, ticker, content, sent_at, verdict, verdict_note, reviewed_at)
       VALUES (?, ?, ?, ?, datetime('now', '-1 day'), ?, ?, ?)`,
    ).run("alert-commander", "alert", null, "Recent alert 1 day ago", null, null, null);

    const entries = getMarketMessageDigest(db, 7);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.from_agent).toBe("alert-commander");
  });

  it("AC-3: empty state — no unreviewed rows returns []", () => {
    const db = getDb();
    const entries = getMarketMessageDigest(db, 7);
    expect(entries).toEqual([]);
  });

  it("edge: single row in group — ids is an array of exactly one number", () => {
    const db = getDb();

    seedRowWithId(42, { from_agent: "alert-commander", message_type: "alert", content: "Single row content", sent_at: daysAgo(6, "10:00:00") });

    const entries = getMarketMessageDigest(db, 7);
    const entry = entries.find(e => e.from_agent === "alert-commander");

    expect(entry).toBeDefined();
    expect(Array.isArray(entry!.ids)).toBe(true);
    expect(entry!.ids).toHaveLength(1);
    expect(entry!.ids[0]).toBe(42);
  });

  it("edge: default limit_days=7 — row 6 days ago included, row 8 days ago excluded", () => {
    const db = getDb();

    db.prepare(
      `INSERT INTO market_messages
         (from_agent, message_type, ticker, content, sent_at, verdict, verdict_note, reviewed_at)
       VALUES (?, ?, ?, ?, datetime('now', '-6 days'), ?, ?, ?)`,
    ).run("alert-commander", "alert", null, "6 days ago — in range", null, null, null);

    db.prepare(
      `INSERT INTO market_messages
         (from_agent, message_type, ticker, content, sent_at, verdict, verdict_note, reviewed_at)
       VALUES (?, ?, ?, ?, datetime('now', '-8 days'), ?, ?, ?)`,
    ).run("morning-briefing", "morning_briefing", null, "8 days ago — out of range", null, null, null);

    // Call with no limit_days argument — default 7
    const entries = getMarketMessageDigest(db);

    // Only alert-commander 6-days-ago row should appear
    expect(entries).toHaveLength(1);
    expect(entries[0]!.from_agent).toBe("alert-commander");
  });

  it("edge: limit_days=0 treated as 1 at store level (clamping) — today's row included", () => {
    const db = getDb();

    db.prepare(
      `INSERT INTO market_messages
         (from_agent, message_type, ticker, content, sent_at, verdict, verdict_note, reviewed_at)
       VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
    ).run("alert-commander", "alert", null, "Today row", null, null, null);

    // limit_days=0 clamped to 1 — should still include today's row
    const entries = getMarketMessageDigest(db, 0);
    expect(entries).toHaveLength(1);
  });

  it("edge: limit_days=50 treated as 30 at store level (clamping) — 29-day row included, 31-day row excluded", () => {
    const db = getDb();

    // Row 29 days ago should be included when clamped to 30
    db.prepare(
      `INSERT INTO market_messages
         (from_agent, message_type, ticker, content, sent_at, verdict, verdict_note, reviewed_at)
       VALUES (?, ?, ?, ?, datetime('now', '-29 days'), ?, ?, ?)`,
    ).run("alert-commander", "alert", null, "29 days ago row", null, null, null);

    // Row 31 days ago should be excluded even with limit_days=50 (clamped to 30)
    db.prepare(
      `INSERT INTO market_messages
         (from_agent, message_type, ticker, content, sent_at, verdict, verdict_note, reviewed_at)
       VALUES (?, ?, ?, ?, datetime('now', '-31 days'), ?, ?, ?)`,
    ).run("morning-briefing", "morning_briefing", null, "31 days ago row", null, null, null);

    const entries = getMarketMessageDigest(db, 50);
    // Only the 29-days-ago row; 31-days-ago excluded by clamp to 30
    expect(entries).toHaveLength(1);
    expect(entries[0]!.from_agent).toBe("alert-commander");
  });

  it("AC-1: preview field contains at most 120 chars of message content", () => {
    const db = getDb();
    const longContent = "A".repeat(200);

    seedRowWithId(55, { from_agent: "alert-commander", message_type: "alert", content: longContent, sent_at: daysAgo(6, "08:00:00") });

    const entries = getMarketMessageDigest(db, 7);
    const entry = entries.find(e => e.from_agent === "alert-commander");

    expect(entry).toBeDefined();
    expect(entry!.preview.length).toBeLessThanOrEqual(120);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// batchReviewMarketMessages — store-level tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1168 — batchReviewMarketMessages", () => {
  it("AC-4: updates all 3 ids in one transaction — returns { updated: 3, notFound: [] }", () => {
    const db = getDb();

    const id20 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 20", sent_at: daysAgo(6, "08:00:00") });
    const id21 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 21", sent_at: daysAgo(6, "08:01:00") });
    const id22 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 22", sent_at: daysAgo(6, "08:02:00") });

    const result = batchReviewMarketMessages(db, [id20, id21, id22], "noise", "overnight noise batch");

    expect(result.updated).toBe(3);
    expect(result.notFound).toEqual([]);
  });

  it("AC-4: sets verdict='noise', verdict_note, and reviewed_at on all 3 updated rows", () => {
    const db = getDb();

    const id20 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 20", sent_at: daysAgo(6, "08:00:00") });
    const id21 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 21", sent_at: daysAgo(6, "08:01:00") });
    const id22 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 22", sent_at: daysAgo(6, "08:02:00") });

    batchReviewMarketMessages(db, [id20, id21, id22], "noise", "overnight noise batch");

    for (const id of [id20, id21, id22]) {
      const row = selectRow(id);
      expect(row).not.toBeNull();
      expect(row!.verdict).toBe("noise");
      expect(row!.verdict_note).toBe("overnight noise batch");
      expect(row!.reviewed_at).not.toBeNull();
    }
  });

  it("AC-5: reports notFound ids — ids [id20, id21] exist, id 999 does not", () => {
    const db = getDb();

    const id20 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 20", sent_at: daysAgo(6, "08:00:00") });
    const id21 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 21", sent_at: daysAgo(6, "08:01:00") });

    const result = batchReviewMarketMessages(db, [id20, id21, 999], "noise");

    expect(result.updated).toBe(2);
    expect(result.notFound).toEqual([999]);
  });

  it("AC-5: no exception thrown when some ids are not found", () => {
    const db = getDb();

    const id20 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 20", sent_at: daysAgo(6, "08:00:00") });

    expect(() => {
      batchReviewMarketMessages(db, [id20, 888, 999], "noise");
    }).not.toThrow();
  });

  it("AC-6: empty ids array returns immediately — { updated: 0, notFound: [] }", () => {
    const db = getDb();

    const result = batchReviewMarketMessages(db, [], "noise");

    expect(result.updated).toBe(0);
    expect(result.notFound).toEqual([]);
  });

  it("AC-7: invalid verdict throws Error('Invalid verdict')", () => {
    const db = getDb();

    expect(() => {
      batchReviewMarketMessages(db, [1], "maybe" as "signal" | "noise");
    }).toThrow("Invalid verdict");
  });

  it("edge: idempotent overwrite — second call with different verdict wins", () => {
    const db = getDb();

    const id = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "overwrite me", sent_at: daysAgo(6, "08:00:00") });

    batchReviewMarketMessages(db, [id], "noise");
    batchReviewMarketMessages(db, [id], "signal", "correction");

    const row = selectRow(id);
    expect(row!.verdict).toBe("signal");
    expect(row!.verdict_note).toBe("correction");
  });

  it("edge: all 200 non-existent ids — returns { updated: 0, notFound: all 200 }", () => {
    const db = getDb();

    const nonExistentIds = Array.from({ length: 200 }, (_, i) => 90000 + i);
    const result = batchReviewMarketMessages(db, nonExistentIds, "noise");

    expect(result.updated).toBe(0);
    expect(result.notFound).toHaveLength(200);
    expect(result.notFound).toEqual(nonExistentIds);
  });

  it("edge: note is optional — null note stores null in verdict_note", () => {
    const db = getDb();

    const id = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "no note", sent_at: daysAgo(6, "08:00:00") });

    batchReviewMarketMessages(db, [id], "noise");

    const row = selectRow(id);
    expect(row!.verdict).toBe("noise");
    expect(row!.verdict_note).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// get_market_message_digest MCP tool — handler tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1168 — get_market_message_digest MCP tool handler", () => {
  it("AC-8: formatted output contains date header, agent names, counts, ids, and footer", async () => {
    // 3 unreviewed rows: ids 42,41 from alert-commander, id 39 from morning-briefing
    // All on dateOnly(6) (6 days ago)
    seedRowWithId(42, { from_agent: "alert-commander", message_type: "alert", content: "VCB alert content", sent_at: daysAgo(6, "10:00:00") });
    seedRowWithId(41, { from_agent: "alert-commander", message_type: "alert", content: "HPG alert content", sent_at: daysAgo(6, "09:00:00") });
    seedRowWithId(39, { from_agent: "morning-briefing", message_type: "morning_briefing", content: "Briefing 13/04 content", sent_at: daysAgo(6, "06:00:00") });

    const response = await handleGetMarketMessageDigest({ limit_days: 7 });

    expect(response.content).toHaveLength(1);
    expect(response.content[0]!.type).toBe("text");

    const text = response.content[0]!.text;
    expect(text).toContain(`[${dateOnly(6)}]`);
    expect(text).toContain("alert-commander");
    expect(text).toContain("2 tin");
    expect(text).toContain("ids: [");
    expect(text).toContain("morning-briefing");
    expect(text).toContain("1 tin");
    expect(text).toContain("Tổng: 3 tin chưa review");
  });

  it("AC-8: formatted text contains both ids 41 and 42 for the alert-commander group", async () => {
    seedRowWithId(42, { from_agent: "alert-commander", message_type: "alert", content: "Content 42", sent_at: daysAgo(6, "10:00:00") });
    seedRowWithId(41, { from_agent: "alert-commander", message_type: "alert", content: "Content 41", sent_at: daysAgo(6, "09:00:00") });

    const response = await handleGetMarketMessageDigest({ limit_days: 7 });
    const text = response.content[0]!.text;

    // Both ids 41 and 42 must appear somewhere in the output
    expect(text).toContain("41");
    expect(text).toContain("42");
  });

  it("AC-9: empty state returns 'Khong co tin nhan chua review trong 7 ngay qua.'", async () => {
    const response = await handleGetMarketMessageDigest({ limit_days: 7 });

    expect(response.content).toHaveLength(1);
    expect(response.content[0]!.text).toBe("Không có tin nhắn chưa review trong 7 ngày qua.");
  });

  it("edge: empty state with default (no limit_days arg) uses 7 in the empty message", async () => {
    const response = await handleGetMarketMessageDigest({});

    expect(response.content[0]!.text).toContain("7 ngày qua");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// batch_review_market_messages MCP tool — handler tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1168 — batch_review_market_messages MCP tool handler", () => {
  it("AC-10: all found — returns \"3 tin da duoc danh gia la 'noise'.\"", async () => {
    const id20 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 20", sent_at: daysAgo(6, "08:00:00") });
    const id21 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 21", sent_at: daysAgo(6, "08:01:00") });
    const id22 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 22", sent_at: daysAgo(6, "08:02:00") });

    const response = await handleBatchReviewMarketMessages({
      ids: [id20, id21, id22],
      verdict: "noise",
    });

    expect(response.content).toHaveLength(1);
    expect(response.content[0]!.text).toBe("3 tin đã được đánh giá là 'noise'.");
  });

  it("AC-10: all 3 rows have verdict='noise' after tool call", async () => {
    const id20 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 20", sent_at: daysAgo(6, "08:00:00") });
    const id21 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 21", sent_at: daysAgo(6, "08:01:00") });
    const id22 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 22", sent_at: daysAgo(6, "08:02:00") });

    await handleBatchReviewMarketMessages({ ids: [id20, id21, id22], verdict: "noise" });

    for (const id of [id20, id21, id22]) {
      const row = selectRow(id);
      expect(row!.verdict).toBe("noise");
    }
  });

  it("AC-11: partial notFound — text contains '2 tin', '1 ID khong tim thay', and '999'", async () => {
    const id20 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 20", sent_at: daysAgo(6, "08:00:00") });
    const id21 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 21", sent_at: daysAgo(6, "08:01:00") });

    const response = await handleBatchReviewMarketMessages({
      ids: [id20, id21, 999],
      verdict: "signal",
    });

    const text = response.content[0]!.text;
    expect(text).toContain("2 tin đã được đánh giá là 'signal'");
    expect(text).toContain("1 ID không tìm thấy");
    expect(text).toContain("999");
  });

  it("AC-12: with note — text ends with 'Note saved.', row has verdict_note='false alarm'", async () => {
    const id20 = seedRow({ from_agent: "alert-commander", message_type: "alert", content: "msg 20", sent_at: daysAgo(6, "08:00:00") });

    const response = await handleBatchReviewMarketMessages({
      ids: [id20],
      verdict: "noise",
      note: "false alarm",
    });

    const text = response.content[0]!.text;
    expect(text.endsWith("Note saved.")).toBe(true);

    const row = selectRow(id20);
    expect(row!.verdict_note).toBe("false alarm");
  });

  it("edge: all ids not found — returns 'Khong tim thay bat ky tin nhan nao.'", async () => {
    const response = await handleBatchReviewMarketMessages({
      ids: [88888, 99999],
      verdict: "noise",
    });

    expect(response.content[0]!.text).toContain("Không tìm thấy bất kỳ tin nhắn nào.");
  });

  it("edge: invalid verdict propagates as error message from handler", async () => {
    // The store throws Error("Invalid verdict") — the handler catches and formats it.
    // Note: Zod validation at the MCP tool layer prevents this in production,
    // but the handler exports are called directly here bypassing Zod.
    const response = await handleBatchReviewMarketMessages({
      ids: [1],
      verdict: "maybe" as "signal" | "noise",
    });

    expect(response.content[0]!.text).toContain("Error in batch review: Invalid verdict");
  });
});
