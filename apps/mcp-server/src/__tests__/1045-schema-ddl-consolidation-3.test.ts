/**
 * Tasks 1045 + 1046 — Janitor: Move bond_maturity + pharma_events DDLs into initDatabase()
 *
 * Verifies that both tables are created by initDatabase() alone —
 * without calling ensureBondMaturityTable() or initPharmaStore().
 *
 * Before fix:
 *   - bond_maturity was created via ensureBondMaturityTable() called from bondMaturityTools.ts
 *   - pharma_events was created via initPharmaStore() called from pharmaTools.ts + davPharmacyJob
 *
 * After fix:
 *   - both tables are created by initDatabase() in schema.ts
 *   - local helpers remain exported for backward compat but are no-ops on schema-initialized DBs
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

Bun.env["DB_PATH"] = ":memory:";

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

describe("Tasks 1045+1046 — bond_maturity + pharma_events DDL in initDatabase()", () => {
  beforeAll(async () => {
    closeDb();
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  // ── Task 1045: bond_maturity ───────────────────────────────────────────────

  it("bond_maturity table exists after initDatabase() — no ensureBondMaturityTable() needed", () => {
    expect(tableExists("bond_maturity")).toBe(true);
  });

  it("bond_maturity has all required columns", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(bond_maturity)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("id");
    expect(cols).toContain("issuer");
    expect(cols).toContain("issuer_code");
    expect(cols).toContain("amount_billion");
    expect(cols).toContain("maturity_date");
    expect(cols).toContain("coupon_rate");
    expect(cols).toContain("status");
    expect(cols).toContain("created_at");
    expect(cols).toContain("updated_at");
  });

  it("bond_maturity has idx_bond_maturity_date and idx_bond_maturity_code indexes", () => {
    expect(indexExists("idx_bond_maturity_date")).toBe(true);
    expect(indexExists("idx_bond_maturity_code")).toBe(true);
  });

  it("bond_maturity accepts insert and enforces UNIQUE issuer_code", () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.exec(
      `INSERT OR IGNORE INTO bond_maturity (issuer, issuer_code, amount_billion, maturity_date, updated_at)
       VALUES ('Novaland', 'NVL', 2000.0, '2026-06-30', '${now}')`,
    );
    // Duplicate issuer_code should be silently ignored
    db.exec(
      `INSERT OR IGNORE INTO bond_maturity (issuer, issuer_code, amount_billion, maturity_date, updated_at)
       VALUES ('Novaland Group', 'NVL', 2500.0, '2026-09-30', '${now}')`,
    );
    const count = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) AS n FROM bond_maturity WHERE issuer_code='NVL'",
      )
      .get()!.n;
    expect(count).toBe(1);
  });

  // ── Task 1046: pharma_events ───────────────────────────────────────────────

  it("pharma_events table exists after initDatabase() — no initPharmaStore() needed", () => {
    expect(tableExists("pharma_events")).toBe(true);
  });

  it("pharma_events has all required columns", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(pharma_events)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("id");
    expect(cols).toContain("event_type");
    expect(cols).toContain("drug_name");
    expect(cols).toContain("manufacturer");
    expect(cols).toContain("stock_code");
    expect(cols).toContain("approval_date");
    expect(cols).toContain("description");
    expect(cols).toContain("severity");
    expect(cols).toContain("created_at");
  });

  it("pharma_events has idx_pharma_code, idx_pharma_date, idx_pharma_type indexes", () => {
    expect(indexExists("idx_pharma_code")).toBe(true);
    expect(indexExists("idx_pharma_date")).toBe(true);
    expect(indexExists("idx_pharma_type")).toBe(true);
  });

  it("pharma_events accepts insert and query", () => {
    const db = getDb();
    db.exec(
      `INSERT INTO pharma_events (event_type, drug_name, description, severity)
       VALUES ('drug_approval', 'Remdesivir', 'Được phê duyệt điều trị COVID-19', 'high')`,
    );
    const row = db
      .query<{ event_type: string }, []>(
        "SELECT event_type FROM pharma_events LIMIT 1",
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.event_type).toBe("drug_approval");
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("initDatabase() called again does not crash (idempotent)", async () => {
    await expect(initDatabase()).resolves.toBeUndefined();
  });
});
