/**
 * Task 1047 — Janitor: Move kinhdich_readings + hexagram_transitions DDLs into initDatabase()
 *
 * Verifies that both Kinh Dich tables are created by initDatabase() alone —
 * without calling initHexagramTables() from kinhDichTools or intelligenceCycleJob.
 *
 * Note on migration: kinhdich_readings.source column was added via ALTER TABLE
 * in the old helper. The canonical DDL in schema.ts includes the column from the start,
 * so fresh DBs never need the ALTER TABLE. Production DBs already have the column.
 *
 * Before fix:
 *   - kinhdich_readings + hexagram_transitions created via initHexagramTables()
 *     called lazily from kinhDichTools.ts (5 tool handlers) + intelligenceCycleJob.ts
 *
 * After fix:
 *   - both tables created by initDatabase() in schema.ts
 *   - initHexagramTables() remains exported as a no-op for backward compat
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

process.env["DB_PATH"] = ":memory:";

import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

function tableExists(tableName: string): boolean {
  const db = getDb();
  const row = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get(tableName);
  return row !== null;
}

function indexExists(indexName: string): boolean {
  const db = getDb();
  const row = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
    )
    .get(indexName);
  return row !== null;
}

describe("Task 1047 — kinhdich_readings + hexagram_transitions DDL in initDatabase()", () => {
  beforeAll(async () => {
    closeDb();
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  // ── kinhdich_readings ─────────────────────────────────────────────────────

  it("kinhdich_readings table exists after initDatabase() — no initHexagramTables() needed", () => {
    expect(tableExists("kinhdich_readings")).toBe(true);
  });

  it("kinhdich_readings has all required columns including source (B2 migration)", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(kinhdich_readings)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("id");
    expect(cols).toContain("stock_code");
    expect(cols).toContain("timestamp");
    expect(cols).toContain("hexagram_number");
    expect(cols).toContain("ho_que_number");
    expect(cols).toContain("bien_que_number");
    expect(cols).toContain("hao_states");
    expect(cols).toContain("raw_scores");
    expect(cols).toContain("ngu_hanh_dynamic");
    expect(cols).toContain("trading_signal");
    expect(cols).toContain("confidence");
    expect(cols).toContain("action_note");
    expect(cols).toContain("source"); // B2 migration column
  });

  it("kinhdich_readings has idx_kd_readings_code_ts index", () => {
    expect(indexExists("idx_kd_readings_code_ts")).toBe(true);
  });

  it("kinhdich_readings accepts insert and query", () => {
    const db = getDb();
    db.exec(
      `INSERT INTO kinhdich_readings
         (stock_code, hexagram_number, ho_que_number, bien_que_number, hao_states, raw_scores, source)
       VALUES ('VCB', 1, 2, 3, '[1,1,1,1,1,1]', '{}', 'test')`,
    );
    const row = db
      .query<{ stock_code: string }, []>(
        "SELECT stock_code FROM kinhdich_readings LIMIT 1",
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.stock_code).toBe("VCB");
  });

  // ── hexagram_transitions ──────────────────────────────────────────────────

  it("hexagram_transitions table exists after initDatabase() — no initHexagramTables() needed", () => {
    expect(tableExists("hexagram_transitions")).toBe(true);
  });

  it("hexagram_transitions has all required columns", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(hexagram_transitions)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("from_hexagram");
    expect(cols).toContain("to_hexagram");
    expect(cols).toContain("stock_code");
    expect(cols).toContain("count");
    expect(cols).toContain("total_price_change_5d");
    expect(cols).toContain("win_count");
    expect(cols).toContain("last_seen");
  });

  it("hexagram_transitions PRIMARY KEY is (from_hexagram, to_hexagram, stock_code)", () => {
    const db = getDb();
    db.exec(
      `INSERT INTO hexagram_transitions (from_hexagram, to_hexagram, stock_code, count)
       VALUES (1, 2, 'VNM', 1)`,
    );
    // Duplicate PK should fail
    expect(() => {
      db.exec(
        `INSERT INTO hexagram_transitions (from_hexagram, to_hexagram, stock_code, count)
         VALUES (1, 2, 'VNM', 1)`,
      );
    }).toThrow();
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("initDatabase() called again does not crash (idempotent)", async () => {
    await expect(initDatabase()).resolves.toBeUndefined();
  });
});
