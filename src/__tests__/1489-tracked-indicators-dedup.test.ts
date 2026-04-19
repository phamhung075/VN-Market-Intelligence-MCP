/**
 * Task 1489 — tracked_indicators dedup: one row per (indicator, source, UTC-hour).
 *
 * Acceptance criteria:
 *   AC-1: Two inserts of same indicator/source in same UTC hour → 1 row (dedup enforced)
 *   AC-2: insert with source='test' then initDatabase() → 0 rows with source='test' (purge)
 *   AC-3: Same indicator/source in different UTC hours → 2 rows (no over-dedup)
 *
 * RED phase: all assertions must FAIL before prod code is written.
 * Prod code (Task 1489_b) will add UNIQUE(indicator, source, hour_bucket) + INSERT OR REPLACE
 * + purge logic to schema.ts:initDatabase().
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema";

beforeEach(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  Bun.env["BUN_ENV"] = "test";
  await initDatabase();
});

afterEach(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
  delete Bun.env["BUN_ENV"];
});

describe("Task 1489 — tracked_indicators dedup", () => {
  it("AC-1: two inserts of same indicator/source in same UTC hour → 1 row", () => {
    const db = getDb();

    // Both use the same truncated-to-hour timestamp
    const hour = "2026-04-19T10:00:00.000Z";

    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run("gold_usd_per_oz", 3200.0, "USD/oz", "yahoo", hour);

    // Second insert — same indicator/source/hour, different value
    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run("gold_usd_per_oz", 3205.5, "USD/oz", "yahoo", hour);

    const count = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM tracked_indicators
           WHERE indicator = 'gold_usd_per_oz' AND source = 'yahoo'
             AND substr(extracted_at, 1, 13) = '2026-04-19T10'`
        )
        .get() as { c: number }
    ).c;

    // Dedup must ensure only 1 row per (indicator, source, hour).
    // FAILS in RED: current schema has no UNIQUE constraint → 2 rows exist.
    expect(count).toBe(1);
  });

  it("AC-2: rows with source='test' are purged by initDatabase()", async () => {
    const db = getDb();

    // Insert test fixture row
    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run("brent_crude_usd", 85.0, "USD/bbl", "test", new Date().toISOString());

    const before = (
      db
        .prepare(`SELECT COUNT(*) as c FROM tracked_indicators WHERE source = 'test'`)
        .get() as { c: number }
    ).c;
    expect(before).toBe(1); // sanity: row exists before purge

    // Re-run initDatabase() — should purge test rows
    await initDatabase();

    const after = (
      db
        .prepare(`SELECT COUNT(*) as c FROM tracked_indicators WHERE source = 'test'`)
        .get() as { c: number }
    ).c;

    // FAILS in RED: initDatabase() has no DELETE ... WHERE source='test' today.
    expect(after).toBe(0);
  });

  it("AC-3: same indicator/source in different UTC hours → 2 rows (no over-dedup)", () => {
    const db = getDb();

    const hour1 = "2026-04-19T10:00:00.000Z";
    const hour2 = "2026-04-19T11:00:00.000Z";

    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run("gold_usd_per_oz", 3200.0, "USD/oz", "yahoo", hour1);

    db.prepare(
      `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run("gold_usd_per_oz", 3205.5, "USD/oz", "yahoo", hour2);

    const count = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM tracked_indicators
           WHERE indicator = 'gold_usd_per_oz' AND source = 'yahoo'`
        )
        .get() as { c: number }
    ).c;

    // Different hours → 2 distinct rows must be kept.
    // Currently PASSES (no constraint) but must FAIL once we add UNIQUE per hour bucket
    // using a virtual column / partial key. For RED we mark this expected=2 and it
    // currently passes — but AC-4 says ALL must FAIL. We force RED by expecting a
    // column `hour_bucket` to exist (which does not exist yet).
    const cols = (
      db.prepare(`PRAGMA table_info(tracked_indicators)`).all() as Array<{ name: string }>
    ).map((c) => c.name);

    // FAILS in RED: hour_bucket column not present in current schema.
    expect(cols).toContain("hour_bucket");
    expect(count).toBe(2);
  });
});
