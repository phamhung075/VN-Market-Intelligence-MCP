/**
 * Task 1141 — insider_transactions DDL in initDatabase()
 *
 * Verifies that initDatabase() creates the insider_transactions table and its
 * two indexes on a fresh in-memory database, and that the CRUD helpers in
 * insiderStore.ts work after init.
 *
 * Sprint 063 — Track B foundation.
 */

// Must be set BEFORE importing schema module so DB_PATH is resolved to :memory:
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  insertInsiderTransaction,
  hasInsiderTransaction,
} from "../infrastructure/db/insiderStore.js";
import type { InsiderRow } from "../infrastructure/db/insiderStore.js";

beforeEach(async () => {
  closeDb();
  await initDatabase();
});

afterEach(() => {
  closeDb();
});

describe("Task 1141 — insider_transactions DDL", () => {
  it("initDatabase creates insider_transactions table", () => {
    const db = getDb();
    type Row = { name: string };
    const row = db
      .prepare<Row, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("insider_transactions") as Row | null;
    expect(row).not.toBeNull();
    expect(row?.name).toBe("insider_transactions");
  });

  it("idx_it_code_from_date index exists", () => {
    const db = getDb();
    type Row = { name: string };
    const row = db
      .prepare<Row, [string]>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
      )
      .get("idx_it_code_from_date") as Row | null;
    expect(row).not.toBeNull();
  });

  it("idx_it_type_from_date index exists", () => {
    const db = getDb();
    type Row = { name: string };
    const row = db
      .prepare<Row, [string]>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
      )
      .get("idx_it_type_from_date") as Row | null;
    expect(row).not.toBeNull();
  });

  it("insertInsiderTransaction succeeds after initDatabase", () => {
    const db = getDb();
    const row: InsiderRow = {
      id: "VNM-nguyenvana-2026-04-10",
      code: "VNM",
      insiderName: "Nguyen Van A",
      position: "Giam doc",
      type: "buy",
      registeredVolume: 500_000,
      executedVolume: 500_000,
      price: 85_000,
      fromDate: "2026-04-10",
      toDate: "2026-04-15",
      fetchedAt: "2026-04-12T01:05:00Z",
    };
    expect(() => insertInsiderTransaction(db, row)).not.toThrow();
    expect(hasInsiderTransaction(db, row.id)).toBe(true);
  });

  it("insertInsiderTransaction is idempotent (INSERT OR IGNORE)", () => {
    const db = getDb();
    const row: InsiderRow = {
      id: "VNM-nguyenvana-2026-04-10",
      code: "VNM",
      insiderName: "Nguyen Van A",
      position: "Giam doc",
      type: "buy",
      registeredVolume: 500_000,
      executedVolume: 500_000,
      price: 85_000,
      fromDate: "2026-04-10",
      toDate: "2026-04-15",
      fetchedAt: "2026-04-12T01:05:00Z",
    };
    insertInsiderTransaction(db, row);
    // Second insert must not throw
    expect(() => insertInsiderTransaction(db, row)).not.toThrow();
    type CountRow = { cnt: number };
    const result = db
      .prepare<CountRow, []>(
        "SELECT COUNT(*) as cnt FROM insider_transactions",
      )
      .get() as CountRow;
    expect(result.cnt).toBe(1);
  });

  it("type CHECK constraint rejects invalid type values", () => {
    const db = getDb();
    expect(() => {
      db
        .prepare(
          `INSERT INTO insider_transactions
             (id, code, insider_name, position, type, registered_volume,
              executed_volume, price, from_date, to_date, fetched_at)
           VALUES ('x','VNM','X','Y','invalid',0,0,0,'2026-04-10','2026-04-10','2026-04-12T00:00:00Z')`,
        )
        .run();
    }).toThrow();
  });
});
