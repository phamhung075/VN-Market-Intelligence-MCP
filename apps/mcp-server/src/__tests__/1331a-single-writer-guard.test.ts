/**
 * Task 1331a — RED: Failing tests proving multi-writer SQLite contention.
 *
 * Test 1: structural/passing — proves SQLITE_BUSY is detectable (validates harness).
 * Test 2: RED — alert-engine ServiceConfig must expose ownDbPath !== market.db.
 * Test 3: RED — STOCK_PRICE_DB_PATH env must differ from DB_PATH.
 * Test 4: RED — writerGuard.assertSingleWriter must exist and return { contested: boolean }.
 */
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Task 1331a — Single-Writer Guard", () => {
  it("TEST-1 (structural): two writers to same file cause SQLITE_BUSY", () => {
    const dir = mkdtempSync(join(tmpdir(), "1331a-"));
    const dbPath = join(dir, "contention.db");

    const db1 = new Database(dbPath);
    db1.exec("PRAGMA journal_mode = WAL");
    db1.exec("CREATE TABLE IF NOT EXISTS rows (id INTEGER PRIMARY KEY, val TEXT)");

    const db2 = new Database(dbPath);
    db2.exec("PRAGMA journal_mode = WAL");
    db2.exec("PRAGMA busy_timeout = 0"); // fail immediately

    db1.exec("BEGIN EXCLUSIVE");
    db1.exec("INSERT INTO rows (val) VALUES ('db1')");

    let caught = false;
    try {
      db2.exec("BEGIN EXCLUSIVE");
    } catch (err) {
      caught = true;
      expect(String(err)).toMatch(/SQLITE_BUSY|database is locked/i);
    }

    db1.exec("ROLLBACK");
    db1.close();
    db2.close();
    rmSync(dir, { recursive: true });

    expect(caught).toBe(true); // proves BUSY is detectable
  });

  it("TEST-3 (RED): STOCK_PRICE_DB_PATH env must differ from DB_PATH", () => {
    // RED: STOCK_PRICE_DB_PATH is not defined before task 1331b
    // After fix: stock-price index.ts exports OWN_DB_PATH constant driven by this env var

    // Simulate what the fixed index.ts will export
    const stockPriceOwnDb = Bun.env["STOCK_PRICE_DB_PATH"];
    const marketDb = Bun.env["DB_PATH"] ?? "/app/data/market.db";

    // FAILS before fix: STOCK_PRICE_DB_PATH is undefined
    expect(stockPriceOwnDb).toBeDefined();
    expect(stockPriceOwnDb).not.toBe(marketDb);
    expect(stockPriceOwnDb).toMatch(/stock_price\.db$/);
  });

  it("TEST-4 (RED): writerGuard.assertSingleWriter must exist and return { contested: boolean }", async () => {
    // RED: writerGuard.ts does not exist before task 1331b — import throws MODULE_NOT_FOUND
    const { assertSingleWriter } = await import(
      "../infrastructure/db/writerGuard.js"
    );

    expect(typeof assertSingleWriter).toBe("function");

    // On :memory: DB (used in all tests) there is no lock contention
    const db = new Database(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    const result = assertSingleWriter(db);
    expect(result).toHaveProperty("contested");
    expect(result.contested).toBe(false);
    db.close();
  });
});
