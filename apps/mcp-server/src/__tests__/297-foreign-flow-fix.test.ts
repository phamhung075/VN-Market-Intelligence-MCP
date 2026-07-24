/**
 * Task 297 — computeForeignFlowScore fix
 *
 * Root cause: query used non-existent columns `date` and `total_volume`.
 * Fix: ORDER BY fetched_at DESC, use avg_volume_2w as denominator.
 *
 * NOTE: DB_PATH must be set BEFORE any imports that transitively call getDb().
 * Setting it here at module top ensures the singleton is not yet open.
 */
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { computeForeignFlowScore } from "../application/services/kinhDich/kinhDichScoring.js";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Setup: in-memory SQLite with required tables
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  closeDb();
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM vnstock_trading_stats");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 297 — computeForeignFlowScore fix", () => {
  it("returns 0.2 when foreign_volume=1000, avg_volume_2w=5000", () => {
    const db = getDb();
    db.exec(`
      INSERT INTO vnstock_trading_stats (code, date, foreign_volume, avg_volume_2w, fetched_at)
      VALUES ('VCB', '2026-04-05', 1000, 5000, datetime('now'))
    `);

    const score = computeForeignFlowScore("VCB");
    expect(score).toBeCloseTo(0.2, 5);
  });

  it("uses the most recent row (ORDER BY fetched_at DESC)", () => {
    const db = getDb();
    // Older row: ratio 0.5
    db.exec(`
      INSERT INTO vnstock_trading_stats (code, date, foreign_volume, avg_volume_2w, fetched_at)
      VALUES ('VCB', '2026-04-03', 5000, 10000, '2026-04-03T10:00:00')
    `);
    // Newer row: ratio 0.1
    db.exec(`
      INSERT INTO vnstock_trading_stats (code, date, foreign_volume, avg_volume_2w, fetched_at)
      VALUES ('VCB', '2026-04-05', 1000, 10000, '2026-04-05T10:00:00')
    `);

    const score = computeForeignFlowScore("VCB");
    // Should use newer row (0.1), not older (0.5)
    expect(score).toBeCloseTo(0.1, 5);
  });

  it("returns 0.0 when avg_volume_2w is 0 (no division by zero)", () => {
    const db = getDb();
    db.exec(`
      INSERT INTO vnstock_trading_stats (code, date, foreign_volume, avg_volume_2w, fetched_at)
      VALUES ('VCB', '2026-04-05', 1000, 0, datetime('now'))
    `);

    const score = computeForeignFlowScore("VCB");
    expect(score).toBe(0.0);
  });

  it("returns 0.0 when no rows exist for code", () => {
    const score = computeForeignFlowScore("VCB");
    expect(score).toBe(0.0);
  });

  it("clamps high ratio to +1.0", () => {
    const db = getDb();
    db.exec(`
      INSERT INTO vnstock_trading_stats (code, date, foreign_volume, avg_volume_2w, fetched_at)
      VALUES ('VCB', '2026-04-05', 9999999, 100, datetime('now'))
    `);

    const score = computeForeignFlowScore("VCB");
    expect(score).toBe(1.0);
  });
});
