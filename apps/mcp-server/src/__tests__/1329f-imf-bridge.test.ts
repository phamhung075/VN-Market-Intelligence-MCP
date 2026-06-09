/**
 * Task 1329f — IMF Conviction Bridge
 *
 * Tests for getImfMacroScoreForConviction().
 * All tests use :memory: DB — no external dependencies.
 */
import { describe, it, expect } from "bun:test";
import Database from "bun:sqlite";
import { getImfMacroScoreForConviction } from "../application/services/imfConvictionBridge.js";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS imf_indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      published_at TEXT NOT NULL,
      age_in_days INTEGER NOT NULL DEFAULT 0,
      prev_value REAL,
      yoy_change REAL,
      source TEXT NOT NULL DEFAULT 'imf_api',
      confidence REAL NOT NULL DEFAULT 0.95,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code) ON CONFLICT REPLACE
    )
  `);
  return db;
}

describe("Task 1329f — getImfMacroScoreForConviction()", () => {
  it("AC-IMF-2: empty table returns 0", () => {
    const db = makeDb();
    expect(getImfMacroScoreForConviction(db)).toBe(0);
  });

  it("AC-IMF-3: all rows stale (fetched_at > 24h ago) returns 0", () => {
    const db = makeDb();
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 3.2, '2026-01-01', 30, 0.2, 0.95,
              datetime('now', '-25 hours'))`);
    expect(getImfMacroScoreForConviction(db)).toBe(0);
  });

  it("fresh row with positive yoy_change returns positive sentiment", () => {
    const db = makeDb();
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 3.5, '2026-04-01', 5, 0.5, 0.95,
              datetime('now', '-1 hours'))`);
    const score = getImfMacroScoreForConviction(db);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("fresh row with negative yoy_change returns negative sentiment", () => {
    const db = makeDb();
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 1.5, '2026-04-01', 5, -0.5, 0.95,
              datetime('now', '-1 hours'))`);
    const score = getImfMacroScoreForConviction(db);
    expect(score).toBeLessThan(0);
    expect(score).toBeGreaterThanOrEqual(-1);
  });

  it("result is always clamped to [-1, +1]", () => {
    const db = makeDb();
    // Insert multiple indicators with extreme positive yoy_change
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 10.0, '2026-04-01', 5, 5.0, 0.95,
              datetime('now', '-1 hours'))`);
    const score = getImfMacroScoreForConviction(db);
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("DB error returns 0 (fail-silent)", () => {
    const db = new Database(":memory:");
    db.close();
    expect(getImfMacroScoreForConviction(db)).toBe(0);
  });
});
