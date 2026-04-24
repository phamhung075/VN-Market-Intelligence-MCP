Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { insertMarketMessage, batchReviewMarketMessages } from "../infrastructure/db/marketMessageStore.js";

/**
 * Task 1265 — Batch Review Market Messages Transaction Persistence
 *
 * Tests that batchReviewMarketMessages verdict updates persist within transaction context.
 * Previous bug: prepared statement created outside transaction scope, causing updates to disappear.
 *
 * AC-1: batchReviewMarketMessages persists all updates within transaction scope
 * AC-2: Verdict, verdict_note, and reviewed_at all persist correctly
 * AC-3: Transaction rollback does not lose committed updates
 * AC-4: Multiple batch calls in sequence all persist
 */

describe("Task 1265 — batchReviewMarketMessages transaction persistence", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("AC-1: batchReviewMarketMessages persists all updates within transaction scope", () => {
    const db = getDb();

    // Insert 3 test rows
    const id1 = insertMarketMessage(db, {
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "VCB alert 1",
    });
    const id2 = insertMarketMessage(db, {
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VNM",
      content: "VNM alert 2",
    });
    const id3 = insertMarketMessage(db, {
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "HPG",
      content: "HPG alert 3",
    });

    // Batch review all 3
    const result = batchReviewMarketMessages(db, [id1, id2, id3], "signal", "batch test");

    expect(result.updated).toBe(3);
    expect(result.notFound).toEqual([]);

    // Verify all 3 rows are persisted with verdict
    for (const id of [id1, id2, id3]) {
      const row = db
        .prepare("SELECT * FROM market_messages WHERE id = ?")
        .get(id) as { verdict: string | null; verdict_note: string | null } | undefined;

      expect(row).toBeDefined();
      expect(row!.verdict).toBe("signal");
      expect(row!.verdict_note).toBe("batch test");
    }
  });

  it("AC-2: Verdict, verdict_note, and reviewed_at all persist correctly", () => {
    const db = getDb();

    const id = insertMarketMessage(db, {
      from_agent: "morning-briefing",
      message_type: "morning_briefing",
      content: "Test briefing",
    });

    batchReviewMarketMessages(db, [id], "noise", "Test note");

    const row = db
      .prepare("SELECT verdict, verdict_note, reviewed_at FROM market_messages WHERE id = ?")
      .get(id) as {
      verdict: string | null;
      verdict_note: string | null;
      reviewed_at: string | null;
    } | undefined;

    expect(row).toBeDefined();
    expect(row!.verdict).toBe("noise");
    expect(row!.verdict_note).toBe("Test note");
    expect(row!.reviewed_at).not.toBeNull();
    // Verify it's a valid ISO datetime
    expect(row!.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("AC-3: Verdict persists even across multiple independent queries", () => {
    const db = getDb();

    const id1 = insertMarketMessage(db, {
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "Alert 1",
    });
    const id2 = insertMarketMessage(db, {
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VNM",
      content: "Alert 2",
    });

    // Batch review
    batchReviewMarketMessages(db, [id1, id2], "signal");

    // Verify persistence with independent queries
    const row1 = db
      .prepare("SELECT verdict FROM market_messages WHERE id = ?")
      .get(id1) as { verdict: string | null } | undefined;
    const row2 = db
      .prepare("SELECT verdict FROM market_messages WHERE id = ?")
      .get(id2) as { verdict: string | null } | undefined;

    expect(row1!.verdict).toBe("signal");
    expect(row2!.verdict).toBe("signal");

    // Query again to confirm persistence
    const count = db
      .prepare("SELECT COUNT(*) as cnt FROM market_messages WHERE verdict = 'signal'")
      .get() as { cnt: number };

    expect(count.cnt).toBe(2);
  });

  it("AC-4: Multiple sequential batch calls all persist correctly", () => {
    const db = getDb();

    // Create 6 rows
    const ids = [];
    for (let i = 0; i < 6; i++) {
      ids.push(
        insertMarketMessage(db, {
          from_agent: "alert-commander",
          message_type: "alert",
          ticker: `T${i}`,
          content: `Alert ${i}`,
        }),
      );
    }

    // First batch: mark first 3 as noise
    batchReviewMarketMessages(db, ids.slice(0, 3), "noise", "batch 1");

    // Second batch: mark last 3 as signal
    batchReviewMarketMessages(db, ids.slice(3, 6), "signal", "batch 2");

    // Verify all persist correctly
    const noiseRows = db
      .prepare("SELECT COUNT(*) as cnt FROM market_messages WHERE verdict = 'noise'")
      .get() as { cnt: number };
    const signalRows = db
      .prepare("SELECT COUNT(*) as cnt FROM market_messages WHERE verdict = 'signal'")
      .get() as { cnt: number };

    expect(noiseRows.cnt).toBe(3);
    expect(signalRows.cnt).toBe(3);

    // Verify notes persist
    const noiseRow = db
      .prepare("SELECT verdict_note FROM market_messages WHERE verdict = 'noise' LIMIT 1")
      .get() as { verdict_note: string | null } | undefined;
    const signalRow = db
      .prepare("SELECT verdict_note FROM market_messages WHERE verdict = 'signal' LIMIT 1")
      .get() as { verdict_note: string | null } | undefined;

    expect(noiseRow!.verdict_note).toBe("batch 1");
    expect(signalRow!.verdict_note).toBe("batch 2");
  });

  it("AC-5: Empty batch does not cause transaction issues", () => {
    const db = getDb();

    // Empty batch should not throw
    expect(() => {
      batchReviewMarketMessages(db, [], "signal");
    }).not.toThrow();

    // Should return { updated: 0, notFound: [] }
    const result = batchReviewMarketMessages(db, [], "noise");
    expect(result.updated).toBe(0);
    expect(result.notFound).toEqual([]);
  });

  it("AC-6: Idempotent - calling batch twice with same ids updates correctly both times", () => {
    const db = getDb();

    const id = insertMarketMessage(db, {
      from_agent: "alert-commander",
      message_type: "alert",
      ticker: "VCB",
      content: "Alert",
    });

    // First call: noise
    batchReviewMarketMessages(db, [id], "noise", "first");

    let row = db
      .prepare("SELECT verdict, verdict_note FROM market_messages WHERE id = ?")
      .get(id) as { verdict: string; verdict_note: string } | undefined;

    expect(row!.verdict).toBe("noise");
    expect(row!.verdict_note).toBe("first");

    // Second call: override with signal
    batchReviewMarketMessages(db, [id], "signal", "second");

    row = db
      .prepare("SELECT verdict, verdict_note FROM market_messages WHERE id = ?")
      .get(id) as { verdict: string; verdict_note: string } | undefined;

    expect(row!.verdict).toBe("signal");
    expect(row!.verdict_note).toBe("second");
  });
});
