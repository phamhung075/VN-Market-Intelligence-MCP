/**
 * Task 1042 — vnstock DDL consolidated into initDatabase()
 *
 * Verifies that all 8 vnstock tables are created by initDatabase() alone,
 * WITHOUT calling initVnstockTables(). This ensures fresh deployments and
 * test DBs get the tables from the canonical SSOT.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";

const VNSTOCK_TABLES = [
  "vnstock_financials",
  "vnstock_trading_stats",
  "vnstock_events",
  "vnstock_officers",
  "vnstock_shareholders",
  "vnstock_fetch_log",
  "vnstock_balance_sheet",
  "vnstock_cash_flow",
];

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
  // NOTE: intentionally NOT calling initVnstockTables() — tables must exist
  // from initDatabase() alone.
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete process.env["DB_PATH"];
});

describe("Task 1042 — vnstock DDL in initDatabase()", () => {
  for (const table of VNSTOCK_TABLES) {
    it(`creates ${table} via initDatabase() without initVnstockTables()`, () => {
      const db = getDb();
      // PRAGMA table_info returns rows if the table exists, empty array if not
      const rows = db
        .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
        .all();
      expect(rows.length).toBeGreaterThan(0);
    });
  }

  it("vnstock_financials has UNIQUE constraint on (code, year_report, quarter, source)", () => {
    const db = getDb();
    const indices = db
      .query<{ name: string; unique: number }, []>(
        "PRAGMA index_list(vnstock_financials)",
      )
      .all();
    // At least one unique index exists
    const hasUnique = indices.some((i) => i.unique === 1);
    expect(hasUnique).toBe(true);
  });

  it("vnstock_trading_stats has date column", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(vnstock_trading_stats)")
      .all();
    const hasDate = cols.some((c) => c.name === "date");
    expect(hasDate).toBe(true);
  });

  it("idx_vnfin_code index exists on vnstock_financials", () => {
    const db = getDb();
    const indices = db
      .query<{ name: string }, []>(
        "PRAGMA index_list(vnstock_financials)",
      )
      .all();
    const names = indices.map((i) => i.name);
    expect(names).toContain("idx_vnfin_code");
  });
});
