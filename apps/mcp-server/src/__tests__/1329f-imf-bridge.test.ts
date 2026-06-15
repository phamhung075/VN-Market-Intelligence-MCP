/**
 * Task 1329f — IMF Conviction Bridge
 *
 * FIX-ERRAUDIT-W2-MCP-DATALAYER: updated tests to match new discriminated contract.
 * getImfMacroScoreForConviction() now returns number|undefined (never fabricates 0).
 *   - DB error    → undefined  (drop-dimension, logged via failLoud)
 *   - Empty table → undefined  (legit no-rows — dimension unavailable)
 *   - Stale rows  → undefined  (all rows outside staleness window)
 *   - Fresh rows  → number in [-1, +1]
 *
 * FORCED-FAILURE test: closed DB → undefined (NEVER 0 / neutral fabrication).
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

describe("Task 1329f / FIX-ERRAUDIT-W2 — getImfMacroScoreForConviction()", () => {
  // ── Legit-empty path ────────────────────────────────────────────────────────
  it("AC-IMF-2: empty table returns undefined (drop-dimension — no fabricated neutral)", () => {
    const db = makeDb();
    expect(getImfMacroScoreForConviction(db)).toBeUndefined();
  });

  it("AC-IMF-3: all rows stale (fetched_at > 24h ago) returns undefined (genuine no-rows)", () => {
    const db = makeDb();
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 3.2, '2026-01-01', 30, 0.2, 0.95,
              datetime('now', '-25 hours'))`);
    expect(getImfMacroScoreForConviction(db)).toBeUndefined();
  });

  // ── Forced-failure test (db-error path) ────────────────────────────────────
  it("[FORCED-FAILURE] DB error (closed DB) returns undefined — NEVER fabricated 0", () => {
    // Simulate a broken/closed DB — the classic fabricated-neutral anti-pattern was: return 0.
    // With safeQuery: db-error → failLoud + reason:'db-error' → caller gets undefined.
    const db = new Database(":memory:");
    db.close();
    const result = getImfMacroScoreForConviction(db);
    expect(result).toBeUndefined();
    // Explicitly assert it is NOT the fabricated-neutral 0
    expect(result).not.toBe(0);
  });

  // ── Happy-path (fresh data) ────────────────────────────────────────────────
  it("fresh row with positive yoy_change returns positive sentiment (number in (0,1])", () => {
    const db = makeDb();
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 3.5, '2026-04-01', 5, 0.5, 0.95,
              datetime('now', '-1 hours'))`);
    const score = getImfMacroScoreForConviction(db);
    expect(score).not.toBeUndefined();
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("fresh row with negative yoy_change returns negative sentiment (number in [-1,0))", () => {
    const db = makeDb();
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 1.5, '2026-04-01', 5, -0.5, 0.95,
              datetime('now', '-1 hours'))`);
    const score = getImfMacroScoreForConviction(db);
    expect(score).not.toBeUndefined();
    expect(score).toBeLessThan(0);
    expect(score).toBeGreaterThanOrEqual(-1);
  });

  it("result is always clamped to [-1, +1] for extreme values", () => {
    const db = makeDb();
    db.exec(`INSERT INTO imf_indicators
      (code, name, value, published_at, age_in_days, yoy_change, confidence, fetched_at)
      VALUES ('NGDP_RPCH', 'GDP Growth', 10.0, '2026-04-01', 5, 5.0, 0.95,
              datetime('now', '-1 hours'))`);
    const score = getImfMacroScoreForConviction(db);
    expect(score).not.toBeUndefined();
    expect(score as number).toBeGreaterThanOrEqual(-1);
    expect(score as number).toBeLessThanOrEqual(1);
  });

  // ── Caller-integration: undefined → imfMacroScore omitted ─────────────────
  it("caller can safely use imfMacroScore !== undefined guard to skip injection", () => {
    // This proves the contract that callers like scanMarket + assembleBriefing use.
    const db = makeDb(); // empty table → undefined
    const score = getImfMacroScoreForConviction(db);
    // The !==undefined guard correctly skips injecting a fake 0:
    const input: Record<string, unknown> = { code: "VCB" };
    if (score !== undefined) input.imfMacroScore = score;
    expect("imfMacroScore" in input).toBe(false); // dimension correctly omitted
  });
});
