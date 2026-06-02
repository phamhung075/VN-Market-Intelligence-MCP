/**
 * BAL-1c-period-basis.test.ts — DV Gate for period_basis column + structural PUB-7 guard
 *
 * Sprint: BCTC-ANALYTICS-LAYER
 * Task:   BAL-1c-DEV
 * Date:   2026-06-02
 *
 * Root cause (brief 2026-06-02-bctc-analytics-layer-bal1 §4):
 *   PUB-7 comparison guard previously guessed period basis from period_type column
 *   (no persisted column). BAL-1c adds a `period_basis` column (TEXT, nullable) to
 *   financial_reports and populates it in finalize_bctc_refine:
 *     period_quarter=4 → 'full_year_cumulative'  (Q4 VAS BCTC = FY Jan–Dec cumulative)
 *     period_quarter∈{1,2,3} → 'standalone_quarter'
 *   The comparison guard in buildComparisonSection uses this column; falls back to
 *   period_type heuristic when column is NULL (graceful degradation, not silent skip).
 *
 * Anti-false-green discipline (DB Arbiter Rule):
 *   period_basis population tests use direct bun:sqlite queries — NOT tool return text.
 *   PUB-7 comparison tests assert on specific output strings from the tool handler.
 *
 * Tests:
 *   BAL1C-1  schema: period_basis column exists after initFinancialReportsTables
 *   BAL1C-2  finalize Q4 → period_basis='full_year_cumulative' (DB arbiter read)
 *   BAL1C-3  finalize Q1 → period_basis='standalone_quarter' (DB arbiter read)
 *   BAL1C-4  finalize Q2 → period_basis='standalone_quarter'
 *   BAL1C-5  finalize Q3 → period_basis='standalone_quarter'
 *   BAL1C-6  PUB-7 structural: Q4(full_year_cumulative) vs Q1(standalone_quarter) → withheld
 *   BAL1C-7  PUB-7 structural: Q1(standalone_quarter) vs Q4(full_year_cumulative) → withheld
 *   BAL1C-8  PUB-7 same basis: Q4 vs Q4 (both full_year_cumulative) → comparison proceeds
 *   BAL1C-9  PUB-7 same basis: Q1 vs Q1 (both standalone_quarter) → comparison proceeds
 *   BAL1C-10 PUB-7 fallback: period_basis=NULL both sides → falls back to heuristic
 *            (Q4 heuristic fires for Q4 vs Q1 even when column is NULL)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";

// ── Schema helpers ─────────────────────────────────────────────────────────────

function openFullDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

/**
 * Minimal in-memory DB for comparison-section tests.
 * Does NOT include the full initFinancialReportsTables backfill logic
 * but DOES include the period_basis column (as the migration adds it).
 */
function openComparisonDb(): Database {
  const db = new Database(":memory:");

  db.exec(`CREATE TABLE IF NOT EXISTS financial_reports (
    id TEXT PRIMARY KEY,
    action_code TEXT NOT NULL,
    company_name TEXT,
    period_year INTEGER NOT NULL DEFAULT 2026,
    period_quarter INTEGER,
    period_type TEXT NOT NULL DEFAULT 'Q1',
    sort_key TEXT NOT NULL DEFAULT '2026-Q1',
    audit_status TEXT NOT NULL DEFAULT 'unaudited',
    extraction_confidence REAL NOT NULL DEFAULT 0.8,
    net_revenue REAL NOT NULL DEFAULT 1000000,
    gross_profit REAL NOT NULL DEFAULT 400000,
    operating_profit REAL NOT NULL DEFAULT 200000,
    ebitda REAL NOT NULL DEFAULT 250000,
    profit_before_tax REAL NOT NULL DEFAULT 180000,
    net_profit REAL NOT NULL DEFAULT 150000,
    eps REAL NOT NULL DEFAULT 4000,
    diluted_eps REAL NOT NULL DEFAULT 3900,
    total_assets REAL NOT NULL DEFAULT 5000000,
    current_assets REAL NOT NULL DEFAULT 1000000,
    cash REAL NOT NULL DEFAULT 200000,
    inventory REAL NOT NULL DEFAULT 100000,
    total_liabilities REAL NOT NULL DEFAULT 3000000,
    short_term_debt REAL NOT NULL DEFAULT 500000,
    long_term_debt REAL NOT NULL DEFAULT 1000000,
    equity_total REAL NOT NULL DEFAULT 2000000,
    operating_cf REAL NOT NULL DEFAULT 180000,
    investing_cf REAL NOT NULL DEFAULT -50000,
    financing_cf REAL NOT NULL DEFAULT -30000,
    capex REAL NOT NULL DEFAULT 30000,
    free_cash_flow REAL NOT NULL DEFAULT 150000,
    gross_margin_pct REAL DEFAULT 40.0,
    operating_margin_pct REAL DEFAULT 20.0,
    net_margin_pct REAL DEFAULT 15.0,
    roe REAL DEFAULT 12.0,
    roa REAL DEFAULT 5.0,
    current_ratio REAL DEFAULT 1.5,
    debt_to_equity REAL DEFAULT 0.8,
    net_debt_to_ebitda REAL DEFAULT 5.0,
    pe REAL DEFAULT 14.0,
    pb REAL DEFAULT 1.8,
    published_at TEXT NOT NULL DEFAULT '2026-01-15',
    yoy_delta_json TEXT,
    qoq_delta_json TEXT,
    refine_status TEXT NOT NULL DEFAULT 'DONE',
    period_basis TEXT
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS bctc_table_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT NOT NULL,
    page_number INTEGER NOT NULL DEFAULT 1,
    statement_section TEXT NOT NULL DEFAULT 'balance_sheet',
    row_order INTEGER NOT NULL DEFAULT 1,
    code TEXT,
    label TEXT NOT NULL DEFAULT 'Test',
    period_current TEXT NOT NULL DEFAULT 'Q1-2026',
    value_current REAL,
    is_summary_row INTEGER NOT NULL DEFAULT 0
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS bctc_refined_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    page_numbers_json TEXT NOT NULL DEFAULT '[1]',
    markdown TEXT NOT NULL DEFAULT '| test |',
    row_count INTEGER NOT NULL DEFAULT 5,
    confidence REAL NOT NULL DEFAULT 0.85,
    window_status TEXT NOT NULL DEFAULT 'DONE',
    UNIQUE(report_id, unit_id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS rag_analyses (
    id TEXT PRIMARY KEY,
    action_level TEXT NOT NULL,
    action_code TEXT NOT NULL,
    affected_actions TEXT NOT NULL DEFAULT '[]',
    headline TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    published_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    embedding_vector TEXT NOT NULL DEFAULT '',
    sentiment TEXT,
    confidence REAL,
    causal_chain TEXT
  )`);

  return db;
}

/** Seed a report + table rows + refined unit (all PUB-1..4 pass). Returns id. */
function seedPassingReport(
  db: Database,
  opts: {
    id?: string;
    action_code?: string;
    sort_key?: string;
    period_type?: string;
    period_year?: number;
    period_quarter?: number | null;
    period_basis?: string | null;
    net_revenue?: number;
    net_profit?: number;
    extraction_confidence?: number;
    refine_status?: string;
  } = {},
): string {
  const id = opts.id ?? `rpt-${Math.random().toString(36).slice(2, 9)}`;
  const code = opts.action_code ?? "TST";
  db.prepare(
    `INSERT INTO financial_reports
       (id, action_code, period_year, period_quarter, period_type, sort_key,
        net_revenue, net_profit, extraction_confidence, refine_status, period_basis)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    code,
    opts.period_year ?? 2026,
    opts.period_quarter ?? 1,
    opts.period_type ?? "Q1",
    opts.sort_key ?? "2026-Q1",
    opts.net_revenue ?? 1_000_000,
    opts.net_profit ?? 150_000,
    opts.extraction_confidence ?? 0.8,
    opts.refine_status ?? "DONE",
    opts.period_basis !== undefined ? opts.period_basis : null,
  );

  // PUB-2 + PUB-3: balance_sheet non-summary row with value_current
  db.prepare(
    `INSERT INTO bctc_table_rows
       (report_id, page_number, statement_section, row_order, code, label,
        period_current, value_current, is_summary_row)
     VALUES (?,1,'balance_sheet',1,'270','Test Row','Q1-2026',100000,0)`,
  ).run(id);

  // PUB-4: DONE unit
  db.prepare(
    `INSERT INTO bctc_refined_units
       (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
     VALUES (?,?,'{[1]}','|test|',5,0.85,'DONE')`,
  ).run(id, `unit-${id.slice(0, 6)}`);

  return id;
}

/** Call get_bctc_full via server tool handler. Returns full text output. */
async function callGetBctcFull(db: Database, code: string): Promise<string> {
  const server = new McpServer({ name: "test", version: "0" });
  registerBctcFullTools(server, db);
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        {
          callback?: (a: Record<string, unknown>) => Promise<{
            content: Array<{ type: string; text: string }>;
          }>;
          handler?: (a: Record<string, unknown>) => Promise<{
            content: Array<{ type: string; text: string }>;
          }>;
        }
      >;
    }
  )._registeredTools;
  const tool = tools["get_bctc_full"];
  const fn = tool?.callback ?? tool?.handler;
  if (!fn) throw new Error("get_bctc_full not found");
  const result = await fn({ code });
  return result.content[0]?.text ?? "";
}

/** Extract the comparison section text from tool output. */
function extractComparisonSection(text: string): string {
  const compStart = text.indexOf("=== QoQ/YoY COMPARISON ===");
  const sentStart = text.indexOf("=== SENTIMENT TREND ===");
  if (compStart < 0) return "";
  return sentStart > compStart ? text.slice(compStart, sentStart) : text.slice(compStart);
}

// ── BAL1C-1: Schema migration ─────────────────────────────────────────────────

describe("BAL1C-1: period_basis column exists after schema init", () => {
  it("initFinancialReportsTables adds period_basis column (PRAGMA table_info)", () => {
    const db = openFullDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(financial_reports)")
      .all()
      .map((r) => r.name);
    expect(cols).toContain("period_basis");
    db.close();
  });

  it("period_basis column allows NULL (existing rows default to NULL)", () => {
    const db = openFullDb();
    // Insert a row without setting period_basis — it should be NULL
    db.prepare(
      `INSERT INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_type, period_start, period_end, sort_key,
          parsed_at, balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
       VALUES (?, 'TEST', 'T', 'HOSE', 'consumer',
               2026, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
               datetime('now'), '{}', '{}', '{}', '{}')`,
    ).run("test-nullbasis");

    const row = db
      .prepare<{ period_basis: string | null }, [string]>(
        "SELECT period_basis FROM financial_reports WHERE id = ?",
      )
      .get("test-nullbasis");
    expect(row?.period_basis).toBeNull();
    db.close();
  });
});

// ── BAL1C-2..5: finalize_bctc_refine sets period_basis correctly ──────────────

/**
 * Seed a financial_reports row for the finalize handler tests.
 * Uses period_quarter to test that finalize writes the correct period_basis.
 */
function seedReportForFinalize(
  db: Database,
  reportId: string,
  ticker: string,
  opts: {
    period_quarter: number;
    period_type: string;
  },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at, extraction_confidence,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        refine_status, confirm_status)
     VALUES (?, ?, ?, 'HOSE', 'consumer',
             2026, ?, ?, '2026-01-01', '2026-03-31', '2026-Q1',
             datetime('now'), 0.85,
             '{}', '{}', '{}', '{}',
             'PENDING', 'PENDING')`,
  ).run(
    reportId,
    ticker,
    ticker + " Corp",
    opts.period_quarter,
    opts.period_type,
  );
}

/** Seed a refined unit with minimal markdown that produces DONE status. */
function seedRefinedUnit(db: Database, reportId: string): void {
  // Minimal markdown: one income + one balance row so BLOCK-1 can run without error
  const markdown = [
    "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
    "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
    "|---|---|---|---|",
    "| 10 | Doanh thu thuần | 1.000.000 | 900.000 |",
    "| 60 | Lợi nhuận sau thuế | 150.000 | 130.000 |",
    "",
    "BẢNG CÂN ĐỐI KẾ TOÁN",
    "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
    "|---|---|---|---|",
    "| 270 | Tổng tài sản | 5.000.000 | 4.800.000 |",
    "| 300 | Nợ phải trả | 3.000.000 | 2.900.000 |",
    "| 400 | Vốn chủ sở hữu | 2.000.000 | 1.900.000 |",
  ].join("\n");

  db.prepare(
    `INSERT OR REPLACE INTO bctc_refined_units
       (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
     VALUES (?, 'unit-001', '[1]', ?, 5, 0.85, 'DONE')`,
  ).run(reportId, markdown);
}

describe("BAL1C-2..5: finalize_bctc_refine populates period_basis correctly", () => {
  let db: Database;
  let finalize: ReturnType<typeof buildFinalizeBctcRefineHandler>;

  beforeEach(() => {
    db = openFullDb();
    finalize = buildFinalizeBctcRefineHandler(db);
  });

  afterEach(() => {
    db.close();
  });

  it("BAL1C-2: period_quarter=4 → period_basis='full_year_cumulative' (DB arbiter)", async () => {
    const rid = "bal1c-q4-001";
    seedReportForFinalize(db, rid, "VNM", { period_quarter: 4, period_type: "Q4" });
    seedRefinedUnit(db, rid);

    await finalize({ report_id: rid, report_status: "DONE" });

    // DB arbiter: read directly from SQLite — do NOT rely on tool return text
    const row = db
      .prepare<{ period_basis: string | null }, [string]>(
        "SELECT period_basis FROM financial_reports WHERE id = ?",
      )
      .get(rid);
    expect(row?.period_basis).toBe("full_year_cumulative");
  });

  it("BAL1C-3: period_quarter=1 → period_basis='standalone_quarter' (DB arbiter)", async () => {
    const rid = "bal1c-q1-001";
    seedReportForFinalize(db, rid, "FPT", { period_quarter: 1, period_type: "Q1" });
    seedRefinedUnit(db, rid);

    await finalize({ report_id: rid, report_status: "DONE" });

    const row = db
      .prepare<{ period_basis: string | null }, [string]>(
        "SELECT period_basis FROM financial_reports WHERE id = ?",
      )
      .get(rid);
    expect(row?.period_basis).toBe("standalone_quarter");
  });

  it("BAL1C-4: period_quarter=2 → period_basis='standalone_quarter'", async () => {
    const rid = "bal1c-q2-001";
    seedReportForFinalize(db, rid, "ACB", { period_quarter: 2, period_type: "Q2" });
    seedRefinedUnit(db, rid);

    await finalize({ report_id: rid, report_status: "DONE" });

    const row = db
      .prepare<{ period_basis: string | null }, [string]>(
        "SELECT period_basis FROM financial_reports WHERE id = ?",
      )
      .get(rid);
    expect(row?.period_basis).toBe("standalone_quarter");
  });

  it("BAL1C-5: period_quarter=3 → period_basis='standalone_quarter'", async () => {
    const rid = "bal1c-q3-001";
    seedReportForFinalize(db, rid, "MWG", { period_quarter: 3, period_type: "Q3" });
    seedRefinedUnit(db, rid);

    await finalize({ report_id: rid, report_status: "DONE" });

    const row = db
      .prepare<{ period_basis: string | null }, [string]>(
        "SELECT period_basis FROM financial_reports WHERE id = ?",
      )
      .get(rid);
    expect(row?.period_basis).toBe("standalone_quarter");
  });
});

// ── BAL1C-6..7: PUB-7 structural guard — withholds mismatched basis ───────────

describe("BAL1C-6..7: PUB-7 structural guard — period_basis column mismatch → withheld", () => {
  it("BAL1C-6: Q4(full_year_cumulative) latest vs Q3(standalone_quarter) prior → comparison withheld", async () => {
    /**
     * Anti-false-green proof:
     *   RED scenario: VNM Q4-2025 (FY: 63,645 tỷ) vs Q3-2025 (9M: 47,200 tỷ) with
     *   period_basis columns set → should emit PUB-7 mismatch, NOT a "+35%" YoY delta.
     *
     *   GREEN: PUB-7 fires → comparison withheld message present, no pct delta emitted.
     *
     * period_basis is set explicitly in this test (structural column path, not heuristic).
     */
    const db = openComparisonDb();

    // Latest: VNM Q4-2025 FY-cumulative (period_basis set)
    seedPassingReport(db, {
      action_code: "VNM",
      sort_key: "2025-Q4",
      period_type: "Q4",
      period_year: 2025,
      period_quarter: 4,
      period_basis: "full_year_cumulative",  // structural column value
      net_revenue: 63_645_000,
      net_profit: 9_413_600,
      extraction_confidence: 0.9,
    });

    // Prior: VNM Q3-2025 standalone-quarter (period_basis set)
    seedPassingReport(db, {
      id: "vnm-q3-2025-basis",
      action_code: "VNM",
      sort_key: "2025-Q3",
      period_type: "Q3",
      period_year: 2025,
      period_quarter: 3,
      period_basis: "standalone_quarter",  // structural column value
      net_revenue: 47_200_000,
      net_profit: 7_100_000,
      extraction_confidence: 0.88,
    });

    const text = await callGetBctcFull(db, "VNM");
    const comp = extractComparisonSection(text);

    // GREEN: PUB-7 must fire with mismatch message
    expect(comp).toContain("PUB-7");
    expect(comp).toContain("mismatch");
    expect(comp).toContain("withheld");
    // GREEN: no percentage delta must appear in the comparison section
    expect(comp).not.toMatch(/[+-]\d+\.\d+%/);
    // GREEN: no "YoY: <period> -> <period>" comparison line
    expect(comp).not.toMatch(/YoY: \d{4}-Q[1-4] -> \d{4}-Q[1-4]/);

    // DB arbiter: verify period_basis values that caused the guard to fire
    const latestRow = db
      .prepare<{ period_basis: string | null }, [string, string]>(
        "SELECT period_basis FROM financial_reports WHERE action_code=? AND sort_key=?",
      )
      .get("VNM", "2025-Q4");
    expect(latestRow?.period_basis).toBe("full_year_cumulative");

    db.close();
  });

  it("BAL1C-7: Q1(standalone_quarter) latest vs Q4(full_year_cumulative) prior → comparison withheld", async () => {
    /**
     * Anti-false-green proof:
     *   RED scenario: FPT Q1-2026 standalone (12,480 tỷ) vs Q4-2025 FY-cumulative (70,112 tỷ) —
     *   comparing these produces false YoY = -82.2%.
     *
     *   GREEN: PUB-7 fires → comparison withheld; no "-82" or "%" delta in output.
     */
    const db = openComparisonDb();

    // Latest: FPT Q1-2026 standalone (period_basis set)
    seedPassingReport(db, {
      action_code: "FPT",
      sort_key: "2026-Q1",
      period_type: "Q1",
      period_year: 2026,
      period_quarter: 1,
      period_basis: "standalone_quarter",
      net_revenue: 12_480_000,
      net_profit: 2_000_000,
      extraction_confidence: 0.82,
    });

    // Prior: FPT Q4-2025 FY-cumulative (period_basis set)
    seedPassingReport(db, {
      id: "fpt-q4-2025-basis",
      action_code: "FPT",
      sort_key: "2025-Q4",
      period_type: "Q4",
      period_year: 2025,
      period_quarter: 4,
      period_basis: "full_year_cumulative",
      net_revenue: 70_112_000,
      net_profit: 11_225_000,
      extraction_confidence: 0.82,
    });

    const text = await callGetBctcFull(db, "FPT");
    const comp = extractComparisonSection(text);

    expect(comp).toContain("PUB-7");
    expect(comp).toContain("mismatch");
    expect(comp).toContain("withheld");
    // Specific false delta check: the -82.2% should NOT appear
    expect(comp).not.toContain("-82");
    expect(comp).not.toMatch(/[+-]\d+\.\d+%/);

    db.close();
  });
});

// ── BAL1C-8..9: PUB-7 same-basis → comparison proceeds ───────────────────────

describe("BAL1C-8..9: PUB-7 same basis → comparison proceeds normally", () => {
  it("BAL1C-8: Q4(full_year_cumulative) vs Q4(full_year_cumulative) prior year → comparison proceeds", async () => {
    /**
     * GREEN control: VNM Q4-2025 vs VNM Q4-2024 — both FY-cumulative, same basis.
     * YoY comparison is valid (apples-to-apples FY figures).
     * PUB-7 must NOT fire.
     */
    const db = openComparisonDb();

    seedPassingReport(db, {
      action_code: "VNM",
      sort_key: "2025-Q4",
      period_type: "Q4",
      period_year: 2025,
      period_quarter: 4,
      period_basis: "full_year_cumulative",
      net_revenue: 63_645_000,
      net_profit: 9_413_600,
      extraction_confidence: 0.9,
    });

    seedPassingReport(db, {
      id: "vnm-q4-2024-basis",
      action_code: "VNM",
      sort_key: "2024-Q4",
      period_type: "Q4",
      period_year: 2024,
      period_quarter: 4,
      period_basis: "full_year_cumulative",
      net_revenue: 58_200_000,
      net_profit: 8_100_000,
      extraction_confidence: 0.88,
    });

    const text = await callGetBctcFull(db, "VNM");
    const comp = extractComparisonSection(text);

    // GREEN: PUB-7 must NOT fire
    expect(comp).not.toContain("PUB-7");
    expect(comp).not.toContain("withheld");
    // Comparison section must contain real data
    expect(comp).toContain("Net Revenue");
    expect(comp).toContain("Net Profit");

    db.close();
  });

  it("BAL1C-9: Q1(standalone_quarter) vs Q1(standalone_quarter) prior year → comparison proceeds", async () => {
    /**
     * GREEN control: FPT Q1-2026 vs FPT Q1-2025 — both standalone-quarter, same basis.
     * YoY Q1-to-Q1 comparison is valid. PUB-7 must NOT fire.
     */
    const db = openComparisonDb();

    seedPassingReport(db, {
      action_code: "FPT",
      sort_key: "2026-Q1",
      period_type: "Q1",
      period_year: 2026,
      period_quarter: 1,
      period_basis: "standalone_quarter",
      net_revenue: 12_480_000,
      net_profit: 2_000_000,
      extraction_confidence: 0.9,
    });

    seedPassingReport(db, {
      id: "fpt-q1-2025-basis",
      action_code: "FPT",
      sort_key: "2025-Q1",
      period_type: "Q1",
      period_year: 2025,
      period_quarter: 1,
      period_basis: "standalone_quarter",
      net_revenue: 11_200_000,
      net_profit: 1_800_000,
      extraction_confidence: 0.88,
    });

    const text = await callGetBctcFull(db, "FPT");
    const comp = extractComparisonSection(text);

    // PUB-7 must NOT fire
    expect(comp).not.toContain("PUB-7");
    expect(comp).not.toContain("withheld");
    // Real comparison present
    expect(comp).toContain("Net Revenue");

    db.close();
  });
});

// ── BAL1C-10: NULL period_basis falls back to period_type heuristic ────────────

describe("BAL1C-10: NULL period_basis → falls back to period_type heuristic (graceful degradation)", () => {
  it("period_basis=NULL on both rows, Q4 vs Q1 → heuristic fires (PUB-7 still withholds)", async () => {
    /**
     * Graceful degradation test: when period_basis column is NULL (rows pre-dating the
     * BAL-1c backfill), the guard must NOT silently pass through. Instead it falls back
     * to the period_type heuristic (Q4 ≡ full_year_cumulative) so legacy data is still
     * protected.
     *
     * This ensures the guard doesn't regress to a silent no-op during the transition
     * period before finalize has run on all existing reports.
     */
    const db = openComparisonDb();

    // Latest: Q4 with NULL period_basis (not yet tagged by finalize)
    seedPassingReport(db, {
      action_code: "VNM",
      sort_key: "2025-Q4",
      period_type: "Q4",
      period_year: 2025,
      period_quarter: 4,
      period_basis: null,          // NULL — pre-BAL-1c row
      net_revenue: 63_645_000,
      net_profit: 9_413_600,
      extraction_confidence: 0.9,
    });

    // Prior: Q3 with NULL period_basis
    seedPassingReport(db, {
      id: "vnm-q3-null-basis",
      action_code: "VNM",
      sort_key: "2025-Q3",
      period_type: "Q3",
      period_year: 2025,
      period_quarter: 3,
      period_basis: null,          // NULL — pre-BAL-1c row
      net_revenue: 47_200_000,
      net_profit: 7_100_000,
      extraction_confidence: 0.88,
    });

    const text = await callGetBctcFull(db, "VNM");
    const comp = extractComparisonSection(text);

    // Heuristic must still fire: Q4 NULL → inferred full_year_cumulative; Q3 NULL → inferred standalone
    expect(comp).toContain("PUB-7");
    expect(comp).toContain("withheld");
    expect(comp).not.toMatch(/[+-]\d+\.\d+%/);

    db.close();
  });

  it("period_basis=NULL on both rows, Q1 vs Q1 prior year → heuristic allows comparison", async () => {
    /**
     * NULL basis with same period_type on both sides: Q1 vs Q1-prior (both NULL →
     * both inferred standalone_quarter) → guard does NOT fire, comparison proceeds.
     */
    const db = openComparisonDb();

    seedPassingReport(db, {
      action_code: "FPT",
      sort_key: "2026-Q1",
      period_type: "Q1",
      period_year: 2026,
      period_quarter: 1,
      period_basis: null,
      extraction_confidence: 0.9,
    });

    seedPassingReport(db, {
      id: "fpt-q1-null-basis",
      action_code: "FPT",
      sort_key: "2025-Q1",
      period_type: "Q1",
      period_year: 2025,
      period_quarter: 1,
      period_basis: null,
      extraction_confidence: 0.88,
    });

    const text = await callGetBctcFull(db, "FPT");
    const comp = extractComparisonSection(text);

    // Both NULL+Q1 → both inferred standalone → same basis → guard must NOT fire
    expect(comp).not.toContain("PUB-7");
    expect(comp).toContain("Net Revenue");

    db.close();
  });
});
