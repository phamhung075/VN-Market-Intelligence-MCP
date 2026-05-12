/**
 * 1878a — OCF Column Migration Tests
 *
 * TDD: Tests written BEFORE implementation.
 * Sprint: 1878a
 * Layer: infrastructure/db
 *
 * Strategy: each test gets its own in-memory Database. We call
 * initFinancialReportsTables(db) to set up the full schema (SQLITE_DDL + all
 * vnstock tables). No manual table creation — avoids schema drift.
 *
 * Coverage:
 *   T1 — ALTER TABLE adds column when absent (idempotent)
 *   T2 — ALTER TABLE no-op when column already exists (idempotent re-run)
 *   T3a — Bridge converts 5.0 tỷ → 5000 triệu
 *   T3b — Bridge converts 12.345 tỷ → 12345 triệu (float tolerance)
 *   T4 — Bridge populates VCB 4 quarters (AC verification)
 *   T5a — Bridge skips annual rows (period_quarter IS NULL)
 *   T5b — quarter=0 in vnstock_cash_flow does not update any row (T7 spec)
 *   T6a — Bridge no-op on missing ticker (no error)
 *   T6b — Bridge for missing ticker does not corrupt other tickers
 *   T7a — backfillAllOCF populates all 3 tickers
 *   T7b — backfillAllOCF is idempotent (second call = same values)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// Load target functions
// ---------------------------------------------------------------------------
// Use Bun.resolveSync + isolate query-string to bypass module-level cache
// (avoids cross-test pollution from other test suites that mock vnstockStore).
const schemaModPath = Bun.resolveSync(
  "../infrastructure/db/schema-financial-reports.js",
  import.meta.dir,
);
const {
  initFinancialReportsTables,
  bridgeOCFToFinancialReports,
  backfillAllOCF,
} = await import(schemaModPath + "?isolate=1878a-tests");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build fresh in-memory DB with full financial-reports schema */
function buildDb(): Database {
  const db = new Database(":memory:");
  // initFinancialReportsTables runs SQLITE_DDL (full financial_reports DDL)
  // + all vnstock tables + migration block.
  initFinancialReportsTables(db);
  return db;
}

/**
 * Insert a minimal financial_reports row.
 * Provides all NOT NULL columns required by the BCTC DDL:
 *   id, action_code, company_name, exchange, domain,
 *   period_year, period_type, period_start, period_end, sort_key, parsed_at,
 *   balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
 */
function insertFR(
  db: Database,
  opts: {
    action_code: string;
    period_year: number;
    period_quarter: number | null;
    sort_key?: string;
  },
): void {
  const sk =
    opts.sort_key ??
    `${opts.period_year}Q${opts.period_quarter ?? "A"}`;
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type,
        period_start, period_end, sort_key, parsed_at,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'),
             '{}', '{}', '{}', '{}')`,
  ).run(
    `${opts.action_code}-${sk}`,
    opts.action_code,
    "Test Co",
    "HOSE",
    "banking",
    opts.period_year,
    opts.period_quarter,
    opts.period_quarter ? `Q${opts.period_quarter}` : "ANNUAL",
    `${opts.period_year}-01-01`,
    `${opts.period_year}-12-31`,
    sk,
  );
}

/** Insert a vnstock_cash_flow row */
function insertCF(
  db: Database,
  opts: {
    code: string;
    year_report: number;
    quarter: number;
    operating_cf_bn: number;
  },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_cash_flow
       (code, year_report, quarter, operating_cf_bn, fetched_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(opts.code, opts.year_report, opts.quarter, opts.operating_cf_bn);
}

// ---------------------------------------------------------------------------
// T1 — Column added when absent
// ---------------------------------------------------------------------------
describe("T1 — idempotent migration: column added when absent", () => {
  it("adds operating_cash_flow REAL column on first run", () => {
    const db = buildDb();
    const cols = db
      .query<{ name: string; type: string }, []>(
        "PRAGMA table_info(financial_reports)",
      )
      .all();
    const ocfCol = cols.find((c) => c.name === "operating_cash_flow");
    expect(ocfCol).toBeDefined();
    expect(ocfCol!.type.toUpperCase()).toBe("REAL");
  });
});

// ---------------------------------------------------------------------------
// T2 — No-op when column already exists
// ---------------------------------------------------------------------------
describe("T2 — idempotent migration: no-op on second run", () => {
  it("calling initFinancialReportsTables twice does not throw", () => {
    const db = buildDb();
    expect(() => initFinancialReportsTables(db)).not.toThrow();
  });

  it("column appears exactly once after two runs", () => {
    const db = buildDb();
    initFinancialReportsTables(db); // second call
    const cols = db
      .query<{ name: string }, []>(
        "PRAGMA table_info(financial_reports)",
      )
      .all();
    const ocfCols = cols.filter((c) => c.name === "operating_cash_flow");
    expect(ocfCols).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T3 — Unit conversion tỷ → triệu (* 1000)
// ---------------------------------------------------------------------------
describe("T3 — bridge: unit conversion", () => {
  it("T3a: 5.0 tỷ → 5000.0 triệu", () => {
    const db = buildDb();
    insertFR(db, { action_code: "VCB", period_year: 2025, period_quarter: 3 });
    insertCF(db, { code: "VCB", year_report: 2025, quarter: 3, operating_cf_bn: 5.0 });

    bridgeOCFToFinancialReports(db, "VCB");

    const row = db
      .prepare<{ ocf: number | null }, []>(
        `SELECT operating_cash_flow AS ocf FROM financial_reports
         WHERE action_code = 'VCB' AND period_year = 2025 AND period_quarter = 3`,
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.ocf).toBeCloseTo(5000.0, 1);
  });

  it("T3b: 12.345 tỷ → 12345 triệu (< 1 triệu tolerance)", () => {
    const db = buildDb();
    insertFR(db, { action_code: "VCB", period_year: 2025, period_quarter: 2 });
    insertCF(db, { code: "VCB", year_report: 2025, quarter: 2, operating_cf_bn: 12.345 });

    bridgeOCFToFinancialReports(db, "VCB");

    const row = db
      .prepare<{ ocf: number | null }, []>(
        `SELECT operating_cash_flow AS ocf FROM financial_reports
         WHERE action_code = 'VCB' AND period_year = 2025 AND period_quarter = 2`,
      )
      .get();
    expect(Math.abs(row!.ocf! - 12345.0)).toBeLessThan(1.0);
  });
});

// ---------------------------------------------------------------------------
// T4 — Bridge populates VCB 4 quarters (AC verification)
// ---------------------------------------------------------------------------
describe("T4 — bridge: VCB 4 quarters all non-NULL", () => {
  it("AC: 4 non-NULL, non-zero OCF rows for VCB after bridge", () => {
    const db = buildDb();
    const year = 2024;

    for (const q of [1, 2, 3, 4]) {
      insertFR(db, {
        action_code: "VCB",
        period_year: year,
        period_quarter: q,
        sort_key: `${year}-Q${q}`,
      });
      insertCF(db, {
        code: "VCB",
        year_report: year,
        quarter: q,
        operating_cf_bn: q * 10.0, // Q1=10, Q2=20, Q3=30, Q4=40 tỷ
      });
    }

    bridgeOCFToFinancialReports(db, "VCB");

    const rows = db
      .prepare<{ ocf: number | null }, []>(
        `SELECT operating_cash_flow AS ocf FROM financial_reports
         WHERE action_code = 'VCB' AND period_quarter IS NOT NULL
         ORDER BY period_year DESC, period_quarter DESC
         LIMIT 4`,
      )
      .all();

    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.ocf).not.toBeNull();
      expect(r.ocf).toBeGreaterThan(0);
    }

    // Verify scale: Q4=40000, Q3=30000, Q2=20000, Q1=10000 triệu
    // rows ordered DESC so [0]=Q4, [1]=Q3, [2]=Q2, [3]=Q1
    expect(rows[0]!.ocf).toBeCloseTo(40000.0, 1);
    expect(rows[1]!.ocf).toBeCloseTo(30000.0, 1);
    expect(rows[2]!.ocf).toBeCloseTo(20000.0, 1);
    expect(rows[3]!.ocf).toBeCloseTo(10000.0, 1);
  });
});

// ---------------------------------------------------------------------------
// T5 — Bridge skips annual rows
// ---------------------------------------------------------------------------
describe("T5 — bridge: skips annual / quarter=0 rows", () => {
  it("T5a: annual row (period_quarter=NULL) stays NULL after bridge", () => {
    const db = buildDb();
    insertFR(db, {
      action_code: "VCB",
      period_year: 2024,
      period_quarter: null,
      sort_key: "2024-ANNUAL",
    });
    insertCF(db, { code: "VCB", year_report: 2024, quarter: 4, operating_cf_bn: 50.0 });

    bridgeOCFToFinancialReports(db, "VCB");

    const row = db
      .prepare<{ ocf: number | null }, []>(
        `SELECT operating_cash_flow AS ocf FROM financial_reports
         WHERE action_code = 'VCB' AND period_quarter IS NULL`,
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.ocf).toBeNull();
  });

  it("T5b: quarter=0 in vnstock_cash_flow does not update financial_reports rows", () => {
    const db = buildDb();
    insertFR(db, { action_code: "VCB", period_year: 2024, period_quarter: 4 });
    // quarter=0 — treat as annual, no match to period_quarter 1-4
    db.prepare(
      `INSERT OR REPLACE INTO vnstock_cash_flow
         (code, year_report, quarter, operating_cf_bn, fetched_at)
       VALUES (?, ?, 0, ?, datetime('now'))`,
    ).run("VCB", 2024, 99.0);

    bridgeOCFToFinancialReports(db, "VCB");

    const row = db
      .prepare<{ ocf: number | null }, []>(
        `SELECT operating_cash_flow AS ocf FROM financial_reports
         WHERE action_code = 'VCB' AND period_quarter = 4 AND period_year = 2024`,
      )
      .get();
    expect(row!.ocf).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T6 — Bridge no-op on missing ticker
// ---------------------------------------------------------------------------
describe("T6 — bridge: no-op on missing ticker", () => {
  it("T6a: does not throw for unknown ticker", () => {
    const db = buildDb();
    expect(() => bridgeOCFToFinancialReports(db, "MISSING_XYZ")).not.toThrow();
  });

  it("T6b: other tickers unaffected when bridge called for missing ticker", () => {
    const db = buildDb();
    insertFR(db, { action_code: "FPT", period_year: 2024, period_quarter: 1 });
    insertCF(db, { code: "FPT", year_report: 2024, quarter: 1, operating_cf_bn: 3.0 });

    bridgeOCFToFinancialReports(db, "FPT"); // populate FPT
    bridgeOCFToFinancialReports(db, "MISSING_XYZ"); // must not touch FPT

    const row = db
      .prepare<{ ocf: number | null }, []>(
        `SELECT operating_cash_flow AS ocf FROM financial_reports
         WHERE action_code = 'FPT' AND period_quarter = 1`,
      )
      .get();
    expect(row!.ocf).toBeCloseTo(3000.0, 1);
  });
});

// ---------------------------------------------------------------------------
// T7 — backfillAllOCF
// ---------------------------------------------------------------------------
describe("T7 — backfillAllOCF: all tickers, idempotent", () => {
  it("T7a: populates OCF for all 3 tickers", () => {
    const db = buildDb();
    const tickers = ["VCB", "FPT", "VNM"];
    for (const [i, t] of tickers.entries()) {
      insertFR(db, {
        action_code: t,
        period_year: 2024,
        period_quarter: 3,
        sort_key: `${t}-2024Q3`,
      });
      insertCF(db, {
        code: t,
        year_report: 2024,
        quarter: 3,
        operating_cf_bn: (i + 1) * 5.0,
      });
    }

    backfillAllOCF(db);

    const rows = db
      .prepare<{ action_code: string; ocf: number | null }, []>(
        `SELECT action_code, operating_cash_flow AS ocf FROM financial_reports
         WHERE period_quarter IS NOT NULL`,
      )
      .all();

    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.ocf).not.toBeNull();
      expect(r.ocf).toBeGreaterThan(0);
    }
  });

  it("T7b: backfillAllOCF is idempotent — same values on second call", () => {
    const db = buildDb();
    insertFR(db, { action_code: "VCB", period_year: 2024, period_quarter: 4 });
    insertCF(db, { code: "VCB", year_report: 2024, quarter: 4, operating_cf_bn: 20.0 });

    backfillAllOCF(db);
    const after1 = db
      .prepare<{ ocf: number | null }, []>(
        `SELECT operating_cash_flow AS ocf FROM financial_reports
         WHERE action_code = 'VCB' AND period_quarter = 4`,
      )
      .get();

    backfillAllOCF(db); // second call
    const after2 = db
      .prepare<{ ocf: number | null }, []>(
        `SELECT operating_cash_flow AS ocf FROM financial_reports
         WHERE action_code = 'VCB' AND period_quarter = 4`,
      )
      .get();

    expect(after1!.ocf).toBeCloseTo(20000.0, 1);
    expect(after2!.ocf).toBeCloseTo(20000.0, 1);
  });
});
