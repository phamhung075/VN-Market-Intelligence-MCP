/**
 * FIX-1265 — batch_review_market_messages verdict persistence regression test
 *
 * Regression: batch_review_market_messages returned success ("N tin da duoc danh gia
 * la noise") but IDs re-appeared in the unreviewed queue next cycle with
 * verdict=null and reviewed_at=null.
 *
 * Root cause investigated: ALTER TABLE migration in schema-news.ts added
 * `reviewed_at` column with type INTEGER instead of TEXT on pre-migration DBs,
 * plus the need to verify the full round-trip (batch review → re-query unreviewed)
 * works end-to-end.
 *
 * Acceptance criteria:
 *   AC-1: After batchReview, all 3 IDs have verdict != null
 *   AC-2: After batchReview, all 3 IDs have reviewed_at != null
 *   AC-3: After batchReview, getUnreviewedMarketMessages returns 0 rows for those IDs
 *   AC-4: After batchReview, getMarketMessageDigest also excludes those IDs
 *   AC-5: reviewed_at column type persists text value correctly (TEXT not INTEGER)
 *   AC-6: Single reviewMarketMessage also sets reviewed_at correctly
 *
 * Test isolation: DB_PATH=:memory: set before any import. Fresh DB per test via
 * beforeEach/afterEach.
 */

// Must be set before importing schema module so module-level DB_PATH is picked up.
Bun.env["DB_PATH"] = ":memory:";
// Safety guard: abort immediately if DB_PATH was overridden to a real file path.
// This test inserts rows with hardcoded ids 10-13 and must never run against production.
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[FIX-1265] DB_PATH must be ':memory:' in tests, got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  insertMarketMessage,
  batchReviewMarketMessages,
  reviewMarketMessage,
  getUnreviewedMarketMessages,
  getMarketMessageDigest,
} from "../infrastructure/db/marketMessageStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle — fresh in-memory DB per test
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await initDatabase();
});
afterEach(() => {
  closeDb();
});
afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Select the raw DB row for assertion — bypasses all store filtering. */
function selectRaw(id: number): {
  id: number;
  verdict: string | null;
  reviewed_at: string | null;
} | null {
  const db = getDb();
  return (
    db
      .prepare<
        { id: number; verdict: string | null; reviewed_at: string | null },
        [number]
      >("SELECT id, verdict, reviewed_at FROM market_messages WHERE id = ?")
      .get(id) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX-1265 — core persistence tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-1265 — batch_review_market_messages persistence", () => {
  it("AC-1: batchReview sets verdict != null for all 3 IDs in the DB", () => {
    const db = getDb();

    const id1 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 1" });
    const id2 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 2" });
    const id3 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 3" });

    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(0);
    expect(id3).toBeGreaterThan(0);

    const result = batchReviewMarketMessages(db, [id1, id2, id3], "noise");
    expect(result.updated).toBe(3);
    expect(result.notFound).toEqual([]);

    for (const id of [id1, id2, id3]) {
      const row = selectRaw(id);
      expect(row).not.toBeNull();
      expect(row!.verdict).not.toBeNull();
      expect(row!.verdict).toBe("noise");
    }
  });

  it("AC-2: batchReview sets reviewed_at != null for all 3 IDs", () => {
    const db = getDb();

    const id1 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 1" });
    const id2 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 2" });
    const id3 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 3" });

    batchReviewMarketMessages(db, [id1, id2, id3], "noise");

    for (const id of [id1, id2, id3]) {
      const row = selectRaw(id);
      expect(row).not.toBeNull();
      expect(row!.reviewed_at).not.toBeNull();
      // reviewed_at must be a TEXT datetime string, not a number
      expect(typeof row!.reviewed_at).toBe("string");
      expect(row!.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it("AC-3: after batchReview, getUnreviewedMarketMessages returns 0 rows for those IDs — they do NOT re-appear", () => {
    const db = getDb();

    const id1 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 1" });
    const id2 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 2" });
    const id3 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 3" });

    // Verify all 3 are in the unreviewed queue before review
    const before = getUnreviewedMarketMessages(db, 50);
    const beforeIds = before.map((r) => r.id);
    expect(beforeIds).toContain(id1);
    expect(beforeIds).toContain(id2);
    expect(beforeIds).toContain(id3);

    batchReviewMarketMessages(db, [id1, id2, id3], "noise");

    // After review — NONE of the 3 IDs should re-appear in unreviewed queue
    const after = getUnreviewedMarketMessages(db, 50);
    const afterIds = after.map((r) => r.id);
    expect(afterIds).not.toContain(id1);
    expect(afterIds).not.toContain(id2);
    expect(afterIds).not.toContain(id3);
  });

  it("AC-4: after batchReview, getMarketMessageDigest also excludes those IDs", () => {
    const db = getDb();

    const id1 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 1" });
    const id2 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 2" });
    const id3 = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "msg 3" });

    // Verify digest includes them before review
    const digestBefore = getMarketMessageDigest(db, 7);
    const allIdsBefore = digestBefore.flatMap((e) => e.ids);
    expect(allIdsBefore).toContain(id1);
    expect(allIdsBefore).toContain(id2);
    expect(allIdsBefore).toContain(id3);

    batchReviewMarketMessages(db, [id1, id2, id3], "noise");

    // After review — digest must exclude all 3
    const digestAfter = getMarketMessageDigest(db, 7);
    const allIdsAfter = digestAfter.flatMap((e) => e.ids);
    expect(allIdsAfter).not.toContain(id1);
    expect(allIdsAfter).not.toContain(id2);
    expect(allIdsAfter).not.toContain(id3);
  });

  it("AC-5: reviewed_at column stores TEXT datetime value, not a numeric coercion", () => {
    const db = getDb();

    const id = insertMarketMessage(db, { from_agent: "alert-commander", message_type: "alert", content: "type check" });
    batchReviewMarketMessages(db, [id], "signal");

    const row = selectRaw(id);
    expect(row).not.toBeNull();

    // reviewed_at must be a string (TEXT), not a number (INTEGER coercion)
    expect(typeof row!.reviewed_at).toBe("string");
    // Must look like a datetime string: YYYY-MM-DD HH:MM:SS
    expect(row!.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("AC-6: single reviewMarketMessage also sets reviewed_at as TEXT datetime", () => {
    const db = getDb();

    const id = insertMarketMessage(db, { from_agent: "morning-briefing", message_type: "morning_briefing", content: "single review" });

    const updated = reviewMarketMessage(db, id, "signal", "verified");
    expect(updated).toBe(true);

    const row = selectRaw(id);
    expect(row).not.toBeNull();
    expect(row!.verdict).toBe("signal");
    expect(row!.reviewed_at).not.toBeNull();
    expect(typeof row!.reviewed_at).toBe("string");
    expect(row!.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    // Must also be gone from unreviewed queue
    const unreviewed = getUnreviewedMarketMessages(db, 50);
    const ids = unreviewed.map((r) => r.id);
    expect(ids).not.toContain(id);
  });

  it("simulates the exact production bug: IDs 10/11/12/13 reviewed then re-queried", () => {
    const db = getDb();

    // Simulate the exact IDs mentioned in the bug report
    for (const id of [10, 11, 12, 13]) {
      db
        .prepare(
          "INSERT OR REPLACE INTO market_messages (id, from_agent, message_type, content) VALUES (?, ?, ?, ?)",
        )
        .run(id, "alert-commander", "alert", `Alert content ${id}`);
    }

    // Confirm all 4 are unreviewed before batch review
    const before = getUnreviewedMarketMessages(db, 50);
    expect(before.map((r) => r.id)).toEqual(expect.arrayContaining([10, 11, 12, 13]));

    // Simulate the batch review call that "returned success"
    const result = batchReviewMarketMessages(db, [10, 11, 12, 13], "noise");
    expect(result.updated).toBe(4);

    // Next cycle: re-query — IDs must NOT re-appear
    const nextCycle = getUnreviewedMarketMessages(db, 50);
    const nextIds = nextCycle.map((r) => r.id);
    expect(nextIds).not.toContain(10);
    expect(nextIds).not.toContain(11);
    expect(nextIds).not.toContain(12);
    expect(nextIds).not.toContain(13);

    // Verify reviewed_at is set (not null) for all 4
    for (const id of [10, 11, 12, 13]) {
      const row = selectRaw(id);
      expect(row!.verdict).toBe("noise");
      expect(row!.reviewed_at).not.toBeNull();
    }
  });
});
