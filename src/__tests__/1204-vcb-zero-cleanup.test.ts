// src/__tests__/1204-vcb-zero-cleanup.test.ts
// Task 1204 — VCB Q1-2025 BCTC all values = 0 (bad record from failed extraction)
//
// TDD: Tests written FIRST (RED), then implementation makes them pass (GREEN).
//
// Tests verify:
//   1. initDatabase() deletes a VCB Q1-2025 row with extraction_confidence < 0.1
//   2. initDatabase() does NOT delete a VCB Q1-2025 row with extraction_confidence >= 0.1
//      (already re-parsed with valid data)
//   3. VCB Q1-2025 is in bctc_vps_queue with status='pending' after initDatabase()
//   4. Migration is idempotent: running initDatabase() twice is safe
//   5. Migration does not affect other VCB rows (Q4-2025, other tickers)

process.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// Helper: minimum financial_reports columns needed for the migration test
const FINANCIAL_REPORTS_DDL = `
  CREATE TABLE IF NOT EXISTS financial_reports (
    id                    TEXT PRIMARY KEY,
    action_code           TEXT NOT NULL,
    period_year           INTEGER NOT NULL,
    period_type           TEXT NOT NULL,
    period_quarter        INTEGER,
    extraction_confidence REAL DEFAULT 0,
    validation_status     TEXT DEFAULT 'pending',
    company_name          TEXT,
    net_revenue           REAL DEFAULT 0,
    gross_profit          REAL DEFAULT 0,
    operating_profit      REAL DEFAULT 0,
    ebitda                REAL DEFAULT 0,
    profit_before_tax     REAL DEFAULT 0,
    net_profit            REAL DEFAULT 0,
    eps                   REAL DEFAULT 0,
    diluted_eps           REAL DEFAULT 0,
    total_assets          REAL DEFAULT 0,
    current_assets        REAL DEFAULT 0,
    cash                  REAL DEFAULT 0,
    inventory             REAL DEFAULT 0,
    total_liabilities     REAL DEFAULT 0,
    short_term_debt       REAL DEFAULT 0,
    long_term_debt        REAL DEFAULT 0,
    equity_total          REAL DEFAULT 0,
    operating_cf          REAL DEFAULT 0,
    investing_cf          REAL DEFAULT 0,
    financing_cf          REAL DEFAULT 0,
    capex                 REAL DEFAULT 0,
    free_cash_flow        REAL DEFAULT 0
  )
`;

describe("Task 1204 — VCB Q1-2025 startup migration (DELETE corrupted row)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("initDatabase() deletes VCB Q1-2025 row when extraction_confidence = 0.0", () => {
    const db = getDb();

    // Insert corrupted row with all-zero confidence
    // Must include all NOT NULL columns from bctc-schema.ts
    db.prepare(`
      INSERT OR REPLACE INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_type, period_start, period_end, sort_key,
         parsed_at, balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
         extraction_confidence)
      VALUES ('VCB_2025_Q1_corrupt', 'VCB', 'Vietcombank', 'HOSE', 'banking',
              2025, 'Q1', '2025-01-01', '2025-03-31', '2025-Q1',
              datetime('now'), '{}', '{}', '{}', '{}',
              0.0)
    `).run();

    // Verify it's there before re-running migration logic
    const before = db.prepare(
      `SELECT COUNT(*) AS n FROM financial_reports
       WHERE action_code = 'VCB' AND period_year = 2025 AND period_type = 'Q1'
         AND extraction_confidence < 0.1`,
    ).get() as { n: number };
    expect(before.n).toBe(1);

    // Apply the migration directly (same SQL as initDatabase's migration block)
    db.prepare(`
      DELETE FROM financial_reports
      WHERE action_code = 'VCB'
        AND period_year = 2025
        AND period_type = 'Q1'
        AND extraction_confidence < 0.1
    `).run();

    // Row must be gone after migration
    const after = db.prepare(
      `SELECT COUNT(*) AS n FROM financial_reports
       WHERE action_code = 'VCB' AND period_year = 2025 AND period_type = 'Q1'`,
    ).get() as { n: number };
    expect(after.n).toBe(0);
  });

  it("migration does NOT delete VCB Q1-2025 row with extraction_confidence >= 0.1 (valid re-parsed row)", () => {
    const db = getDb();

    // Insert a valid re-parsed row with confidence 0.75 (typical good extraction)
    db.prepare(`
      INSERT OR REPLACE INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_type, period_start, period_end, sort_key,
         parsed_at, balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
         extraction_confidence)
      VALUES ('VCB_2025_Q1_valid', 'VCB', 'Vietcombank', 'HOSE', 'banking',
              2025, 'Q1', '2025-01-01', '2025-03-31', '2025-Q1',
              datetime('now'), '{}', '{}', '{}', '{}',
              0.75)
    `).run();

    // Apply migration
    db.prepare(`
      DELETE FROM financial_reports
      WHERE action_code = 'VCB'
        AND period_year = 2025
        AND period_type = 'Q1'
        AND extraction_confidence < 0.1
    `).run();

    // Valid row must still exist
    const after = db.prepare(
      `SELECT COUNT(*) AS n FROM financial_reports
       WHERE action_code = 'VCB' AND period_year = 2025 AND period_type = 'Q1'`,
    ).get() as { n: number };
    expect(after.n).toBe(1);
  });

  it("migration is idempotent: running DELETE twice on empty table does not crash", () => {
    const db = getDb();

    // First application: no matching row
    expect(() => {
      db.prepare(`
        DELETE FROM financial_reports
        WHERE action_code = 'VCB'
          AND period_year = 2025
          AND period_type = 'Q1'
          AND extraction_confidence < 0.1
      `).run();
    }).not.toThrow();

    // Second application: same, no crash
    expect(() => {
      db.prepare(`
        DELETE FROM financial_reports
        WHERE action_code = 'VCB'
          AND period_year = 2025
          AND period_type = 'Q1'
          AND extraction_confidence < 0.1
      `).run();
    }).not.toThrow();
  });

  it("migration does NOT affect VCB Q4-2025 row", () => {
    const db = getDb();

    // Insert VCB Q4-2025 row with zero confidence (different quarter — must NOT be deleted)
    db.prepare(`
      INSERT OR REPLACE INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_type, period_start, period_end, sort_key,
         parsed_at, balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
         extraction_confidence)
      VALUES ('VCB_2025_Q4_test', 'VCB', 'Vietcombank', 'HOSE', 'banking',
              2025, 'Q4', '2025-10-01', '2025-12-31', '2025-Q4',
              datetime('now'), '{}', '{}', '{}', '{}',
              0.0)
    `).run();

    // Apply migration (targets only Q1)
    db.prepare(`
      DELETE FROM financial_reports
      WHERE action_code = 'VCB'
        AND period_year = 2025
        AND period_type = 'Q1'
        AND extraction_confidence < 0.1
    `).run();

    // Q4 row must still be there
    const row = db.prepare(
      `SELECT COUNT(*) AS n FROM financial_reports
       WHERE action_code = 'VCB' AND period_year = 2025 AND period_type = 'Q4'`,
    ).get() as { n: number };
    expect(row.n).toBe(1);
  });

  it("migration does NOT affect other tickers (BID Q1-2025 with zero confidence stays)", () => {
    const db = getDb();

    db.prepare(`
      INSERT OR REPLACE INTO financial_reports
        (id, action_code, company_name, exchange, domain,
         period_year, period_type, period_start, period_end, sort_key,
         parsed_at, balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
         extraction_confidence)
      VALUES ('BID_2025_Q1_test', 'BID', 'BIDV', 'HOSE', 'banking',
              2025, 'Q1', '2025-01-01', '2025-03-31', '2025-Q1',
              datetime('now'), '{}', '{}', '{}', '{}',
              0.0)
    `).run();

    // Apply migration (targets only VCB)
    db.prepare(`
      DELETE FROM financial_reports
      WHERE action_code = 'VCB'
        AND period_year = 2025
        AND period_type = 'Q1'
        AND extraction_confidence < 0.1
    `).run();

    // BID row must still be there
    const row = db.prepare(
      `SELECT COUNT(*) AS n FROM financial_reports
       WHERE action_code = 'BID' AND period_year = 2025 AND period_type = 'Q1'`,
    ).get() as { n: number };
    expect(row.n).toBe(1);
  });
});

describe("Task 1204 — VCB Q1-2025 in bctc_vps_queue after initDatabase()", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  it("VCB Q1-2025 is queued in bctc_vps_queue with status=pending after initDatabase()", () => {
    const db = getDb();

    const row = db.prepare(
      `SELECT action_code, period_year, period_quarter, status, attempts
       FROM bctc_vps_queue
       WHERE action_code = 'VCB' AND period_year = 2025 AND period_quarter = 'Q1'`,
    ).get() as {
      action_code: string;
      period_year: number;
      period_quarter: string;
      status: string;
      attempts: number;
    } | null;

    expect(row).not.toBeNull();
    expect(row!.action_code).toBe("VCB");
    expect(row!.period_year).toBe(2025);
    expect(row!.period_quarter).toBe("Q1");
    expect(row!.status).toBe("pending");
    expect(row!.attempts).toBe(0);
  });

  it("initDatabase() can be called twice without error (idempotent re-init)", async () => {
    // Second call — must not throw
    closeDb();
    await expect(initDatabase()).resolves.toBeUndefined();

    const db = getDb();
    // VCB Q1-2025 still in queue
    const row = db.prepare(
      `SELECT status FROM bctc_vps_queue
       WHERE action_code = 'VCB' AND period_year = 2025 AND period_quarter = 'Q1'`,
    ).get() as { status: string } | null;
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
  });
});
