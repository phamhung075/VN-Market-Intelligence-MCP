/**
 * Tasks 1043 + 1044 — Janitor: Move trade_exposures + cascade_rule_hits DDLs into initDatabase()
 *
 * Verifies that both tables are created by initDatabase() alone —
 * without calling ensureTable() in tradeStore or ensureCascadeHitsTable().
 *
 * Before fix:
 *   - trade_exposures was created lazily via _tableCreated guard in tradeStore.ts
 *   - cascade_rule_hits was created via ensureCascadeHitsTable() called from runImpactChain
 *
 * After fix:
 *   - both tables are created by initDatabase() in schema.ts
 *   - local helpers remain exported for backward compat but are no-ops on schema-initialized DBs
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

describe("Tasks 1043+1044 — trade_exposures + cascade_rule_hits DDL in initDatabase()", () => {
  beforeAll(async () => {
    closeDb();
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  // ── Task 1043: trade_exposures ─────────────────────────────────────────────

  it("trade_exposures table exists after initDatabase() — no ensureTable() needed", () => {
    expect(tableExists("trade_exposures")).toBe(true);
  });

  it("trade_exposures has all required columns", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(trade_exposures)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("id");
    expect(cols).toContain("code");
    expect(cols).toContain("market");
    expect(cols).toContain("revenue_pct");
    expect(cols).toContain("type");
    expect(cols).toContain("products");
    expect(cols).toContain("source");
    expect(cols).toContain("updated_at");
  });

  it("trade_exposures has idx_trade_code and idx_trade_market indexes", () => {
    expect(indexExists("idx_trade_code")).toBe(true);
    expect(indexExists("idx_trade_market")).toBe(true);
  });

  it("trade_exposures UNIQUE(code, market) constraint works", () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.exec(
      `INSERT OR IGNORE INTO trade_exposures (code, market, revenue_pct, type, products, source, updated_at)
       VALUES ('VNM', 'US', 5.0, 'export', 'milk', 'test', '${now}')`,
    );
    // Duplicate (code, market) should be silently ignored
    db.exec(
      `INSERT OR IGNORE INTO trade_exposures (code, market, revenue_pct, type, products, source, updated_at)
       VALUES ('VNM', 'US', 8.0, 'export', 'cheese', 'test', '${now}')`,
    );
    const count = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) AS n FROM trade_exposures WHERE code='VNM' AND market='US'",
      )
      .get()!.n;
    expect(count).toBe(1);
  });

  // ── Task 1044: cascade_rule_hits ───────────────────────────────────────────

  it("cascade_rule_hits table exists after initDatabase() — no ensureCascadeHitsTable() needed", () => {
    expect(tableExists("cascade_rule_hits")).toBe(true);
  });

  it("cascade_rule_hits has all required columns", () => {
    const db = getDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(cascade_rule_hits)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("id");
    expect(cols).toContain("rule_key");
    expect(cols).toContain("matched_text");
    expect(cols).toContain("affected_sector");
    expect(cols).toContain("affected_stocks");
    expect(cols).toContain("hit_at");
  });

  it("cascade_rule_hits has idx_cascade_hits_rule and idx_cascade_hits_at indexes", () => {
    expect(indexExists("idx_cascade_hits_rule")).toBe(true);
    expect(indexExists("idx_cascade_hits_at")).toBe(true);
  });

  it("cascade_rule_hits accepts insert and query", () => {
    const db = getDb();
    db.exec(
      `INSERT INTO cascade_rule_hits (rule_key, matched_text, affected_sector)
       VALUES ('oil_gas_rise', 'giá dầu tăng mạnh', 'oil_gas')`,
    );
    const row = db
      .query<{ rule_key: string }, []>(
        "SELECT rule_key FROM cascade_rule_hits LIMIT 1",
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.rule_key).toBe("oil_gas_rise");
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("initDatabase() called again does not crash (idempotent)", async () => {
    await expect(initDatabase()).resolves.toBeUndefined();
  });
});
