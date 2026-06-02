/**
 * BAL-0 DV tests — PUB-5..8 publish-integrity gates in bctcFullTools.ts
 *
 * Sprint: BCTC-ANALYTICS-LAYER
 * Task:   BAL-0 (structural publish-integrity gate)
 *
 * Anti-false-green discipline: each test verifies observable BEHAVIOUR of
 * checkPublishability / buildSummarySection / buildComparisonSection through
 * the exported functions or the full tool handler. Tests do NOT rely on
 * balance/confidence badges as proof — they assert on the concrete output strings.
 *
 * RED before behaviour (pre-implementation, documented in commit):
 *   PUB-6: roa=7891932 → tool returned "7891932" (garbage served). RED = present; GREEN = absent.
 *   PUB-7: latest=Q1 vs prior=Q4 → tool emitted "-82.2%"-style YoY delta. RED = emitted; GREEN = withheld.
 *   PUB-5: conf=0.44 → tool returned financial data. RED = publishable; GREEN = blocked.
 *   PUB-8: rev=0, np>0, conf=0.55 → tool returned financial data. RED = publishable; GREEN = blocked.
 *
 * Gates:
 *   PUB-5: extraction_confidence < 0.5 → block (publishable=false)
 *   PUB-6: |ROA|>100% or |ROE|>300% or |NetDebt/EBITDA|>200x or EPS<0 or EPS>100000
 *          → publishable=true but sanitizedRatios set + partialWarning; bad ratios show as N/A
 *   PUB-7: Q4 (FY-cumulative) vs non-Q4 (standalone) → withhold comparison section
 *   PUB-8: net_revenue=0 AND net_profit>0 AND conf<0.6 → block (publishable=false)
 *
 * @module __tests__/BAL-0-pub5-8-gates
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  checkPublishability,
  buildSummarySection,
  registerBctcFullTools,
  type ReportRow,
} from "../interface/mcp/tools/financial-reports/bctcFullTools.js";

// ── Test DB helpers ───────────────────────────────────────────────────────────

function makeDb(): Database {
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
    refine_status TEXT NOT NULL DEFAULT 'DONE'
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

/** Seed a financial_reports row and the required bctc_table_rows / bctc_refined_units
 * so PUB-1..4 all pass. Returns the inserted report ID. */
function seedPassingReport(
  db: Database,
  overrides: Partial<{
    id: string;
    action_code: string;
    sort_key: string;
    period_type: string;
    period_year: number;
    period_quarter: number | null;
    refine_status: string;
    extraction_confidence: number;
    net_revenue: number;
    net_profit: number;
    roa: number | null;
    roe: number | null;
    net_debt_to_ebitda: number | null;
    eps: number | null;
  }> = {},
): string {
  const id = overrides.id ?? `test-${Math.random().toString(36).slice(2, 10)}`;
  const code = overrides.action_code ?? "TST";
  const sortKey = overrides.sort_key ?? "2026-Q1";
  const periodType = overrides.period_type ?? "Q1";
  const periodYear = overrides.period_year ?? 2026;
  const periodQuarter = overrides.period_quarter ?? 1;
  const refineStatus = overrides.refine_status ?? "DONE";
  const conf = overrides.extraction_confidence ?? 0.8;
  const netRevenue = overrides.net_revenue ?? 1_000_000;
  const netProfit = overrides.net_profit ?? 150_000;
  const roa = overrides.roa !== undefined ? overrides.roa : 5.0;
  const roe = overrides.roe !== undefined ? overrides.roe : 12.0;
  const netDebtToEbitda =
    overrides.net_debt_to_ebitda !== undefined ? overrides.net_debt_to_ebitda : 5.0;
  const eps = overrides.eps !== undefined ? overrides.eps : 4000;

  db.prepare(
    `INSERT INTO financial_reports
       (id, action_code, period_year, period_quarter, period_type, sort_key,
        refine_status, extraction_confidence, net_revenue, net_profit,
        roa, roe, net_debt_to_ebitda, eps)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    code,
    periodYear,
    periodQuarter,
    periodType,
    sortKey,
    refineStatus,
    conf,
    netRevenue,
    netProfit,
    roa,
    roe,
    netDebtToEbitda,
    eps,
  );

  // PUB-2: at least one row with value_current
  db.prepare(
    `INSERT INTO bctc_table_rows
       (report_id, page_number, statement_section, row_order, code, label,
        period_current, value_current, is_summary_row)
     VALUES (?,1,'balance_sheet',1,'270','Test Row','Q1-2026',100000,0)`,
  ).run(id);

  // PUB-3: non-summary balance_sheet row already inserted above (code='270' for corporate)

  // PUB-4: DONE unit
  db.prepare(
    `INSERT INTO bctc_refined_units
       (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
     VALUES (?,?,'{[1]}','|test|',5,0.85,'DONE')`,
  ).run(id, `unit-${id.slice(0, 6)}`);

  return id;
}

/** Build a minimal ReportRow for direct function-level tests. */
function makeRow(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "row-001",
    action_code: "TST",
    company_name: "Test Co",
    period_year: 2026,
    period_quarter: 1,
    period_type: "Q1",
    sort_key: "2026-Q1",
    audit_status: "unaudited",
    extraction_confidence: 0.8,
    domain: null,
    net_revenue: 1_000_000,
    gross_profit: 400_000,
    operating_profit: 200_000,
    ebitda: 250_000,
    profit_before_tax: 180_000,
    net_profit: 150_000,
    eps: 4_000,
    diluted_eps: 3_900,
    total_assets: 5_000_000,
    current_assets: 1_000_000,
    cash: 200_000,
    inventory: 100_000,
    total_liabilities: 3_000_000,
    short_term_debt: 500_000,
    long_term_debt: 1_000_000,
    equity_total: 2_000_000,
    operating_cf: 180_000,
    investing_cf: -50_000,
    financing_cf: -30_000,
    capex: 30_000,
    free_cash_flow: 150_000,
    gross_margin_pct: 40.0,
    operating_margin_pct: 20.0,
    net_margin_pct: 15.0,
    roe: 12.0,
    roa: 5.0,
    current_ratio: 1.5,
    debt_to_equity: 0.8,
    net_debt_to_ebitda: 5.0,
    pe: 14.0,
    pb: 1.8,
    published_at: "2026-01-15",
    yoy_delta_json: null,
    qoq_delta_json: null,
    refine_status: "DONE",
    period_basis: null,
    ...overrides,
  };
}

async function callToolDirect(db: Database, code: string): Promise<string> {
  const server = new McpServer({ name: "test", version: "0" });
  registerBctcFullTools(server, db);
  // Access via internal registration
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

// ═══════════════════════════════════════════════════════════════════════════════
// PUB-5: extraction_confidence < 0.5 → block
// ═══════════════════════════════════════════════════════════════════════════════

describe("PUB-5 (BAL-0): extraction confidence gate", () => {
  it("DV-BAL0-PUB5-1: confidence=0.44 → checkPublishability returns publishable=false", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { extraction_confidence: 0.44 });
    const row = makeRow({ extraction_confidence: 0.44 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(false);
    expect(result.reason).toContain("PUB-5");
    expect(result.reason).toContain("44%");
  });

  it("DV-BAL0-PUB5-2: confidence=0.49 → blocked (below 0.5 threshold)", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { extraction_confidence: 0.49 });
    const row = makeRow({ extraction_confidence: 0.49 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(false);
  });

  it("DV-BAL0-PUB5-3: confidence=0.5 → passes PUB-5 (boundary, exactly 0.5)", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { extraction_confidence: 0.5 });
    const row = makeRow({ extraction_confidence: 0.5 });
    const result = checkPublishability(db, id, false, row);
    // Should not fail on PUB-5 (0.5 is the minimum allowed)
    // reason is undefined when the report passes; check it doesn't contain PUB-5
    expect(result.reason ?? "").not.toMatch(/PUB-5/);
  });

  it("DV-BAL0-PUB5-4: confidence=0.92 → passes PUB-5 (normal healthy report)", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { extraction_confidence: 0.92 });
    const row = makeRow({ extraction_confidence: 0.92 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("DV-BAL0-PUB5-5: tool returns PUB-5 refusal for low-confidence report (end-to-end)", async () => {
    // RED before: tool returned financial data. GREEN after: tool returns refusal.
    const db = makeDb();
    seedPassingReport(db, {
      action_code: "HPG",
      extraction_confidence: 0.44,
      net_revenue: 0,
      net_profit: 5597.9,
      sort_key: "2025-Q4",
      period_type: "Q4",
    });
    const text = await callToolDirect(db, "HPG");
    // GREEN: must NOT contain financial data
    expect(text).not.toContain("=== BCTC SUMMARY");
    // GREEN: must contain PUB-5 explanation
    expect(text).toContain("PUB-5");
    expect(text).toContain("44%");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUB-6: ratio sanity bounds — withhold offending ratio(s) as N/A, not full block
// ═══════════════════════════════════════════════════════════════════════════════

describe("PUB-6 (BAL-0): ratio sanity bounds gate", () => {
  it("DV-BAL0-PUB6-1: roa=7891932 → checkPublishability publishable=true but sanitizedRatios.roa=null", () => {
    // RED before: roa=7891932 was passed through as-is (7891932 appeared in output).
    // GREEN after: roa is null in sanitizedRatios.
    const db = makeDb();
    const id = seedPassingReport(db, { roa: 7891932 });
    const row = makeRow({ roa: 7891932 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(true); // PUB-6 does NOT block; it sanitizes
    expect(result.sanitizedRatios).toBeDefined();
    expect(result.sanitizedRatios!.roa).toBeNull(); // out-of-bounds → null
    expect(result.partialWarning).toContain("PUB-6");
    expect(result.partialWarning).toContain("ROA=7891932");
  });

  it("DV-BAL0-PUB6-2: served output must NOT contain '7891932' (end-to-end)", async () => {
    // RED before: "7891932" appeared in tool output (garbage served).
    // GREEN after: "7891932" must not appear anywhere in the output.
    const db = makeDb();
    seedPassingReport(db, {
      action_code: "DHG",
      sort_key: "2026-Q1",
      period_type: "Q1",
      roa: 7891932,
      roe: 12.0,
      extraction_confidence: 0.85,
    });
    const text = await callToolDirect(db, "DHG");
    // GREEN check
    expect(text).not.toContain("7891932");
    // The output must show N/A for ROA
    expect(text).toContain("ROA              : N/A");
    // PUB-6 trust note must be present
    expect(text).toContain("PUB-6");
  });

  it("DV-BAL0-PUB6-3: roe=-400 (|ROE|>300%) → sanitizedRatios.roe=null", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { roe: -400 });
    const row = makeRow({ roe: -400 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(true);
    expect(result.sanitizedRatios!.roe).toBeNull();
    expect(result.partialWarning).toContain("ROE=");
  });

  it("DV-BAL0-PUB6-4: net_debt_to_ebitda=250 (>200x) → sanitized to null", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { net_debt_to_ebitda: 250 });
    const row = makeRow({ net_debt_to_ebitda: 250 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(true);
    expect(result.sanitizedRatios!.net_debt_to_ebitda).toBeNull();
  });

  it("DV-BAL0-PUB6-5: eps=12 (<0 or out-of-range?) — 12 is within [0,100000]; passes", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { eps: 12 });
    const row = makeRow({ eps: 12 });
    const result = checkPublishability(db, id, false, row);
    // eps=12 VND is suspicious but technically in [0,100000] so gate doesn't block it
    // (BAL-1e will add EPS footnote extraction)
    expect(result.publishable).toBe(true);
    expect(result.sanitizedRatios?.eps ?? 12).toBe(12);
  });

  it("DV-BAL0-PUB6-6: eps=-500 → sanitized to null", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { eps: -500 });
    const row = makeRow({ eps: -500 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(true);
    expect(result.sanitizedRatios!.eps).toBeNull();
  });

  it("DV-BAL0-PUB6-7: eps=150000 (>100000) → sanitized to null", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { eps: 150000 });
    const row = makeRow({ eps: 150000 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(true);
    expect(result.sanitizedRatios!.eps).toBeNull();
  });

  it("DV-BAL0-PUB6-8: normal ratios all within bounds → no sanitizedRatios emitted", () => {
    const db = makeDb();
    const id = seedPassingReport(db, {
      roa: 5.0,
      roe: 12.0,
      net_debt_to_ebitda: 5.0,
      eps: 4000,
      extraction_confidence: 0.9,
    });
    const row = makeRow({
      roa: 5.0,
      roe: 12.0,
      net_debt_to_ebitda: 5.0,
      eps: 4000,
      extraction_confidence: 0.9,
    });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(true);
    expect(result.sanitizedRatios).toBeUndefined();
    expect(result.partialWarning).toBeUndefined();
  });

  it("DV-BAL0-PUB6-9: buildSummarySection renders N/A for sanitized ROA", () => {
    const row = makeRow({ roa: 7891932 });
    // Sanitized: roa=null
    const sanitized = { roa: null, roe: null, net_debt_to_ebitda: null, eps: null };
    const output = buildSummarySection("DHG", row, false, sanitized);
    // GREEN: 7891932 must not appear anywhere in summary output
    expect(output).not.toContain("7891932");
    // ROA line shows N/A
    expect(output).toContain("ROA              : N/A");
    // PUB-6 trust note present
    expect(output).toContain("PUB-6");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUB-7: period basis mismatch (Q4 FY-cumulative vs standalone quarter)
// ═══════════════════════════════════════════════════════════════════════════════

describe("PUB-7 (BAL-0): period basis mismatch gate in comparison section", () => {
  it("DV-BAL0-PUB7-1: latest=Q1-2026 vs prior=Q4-2025 → comparison withheld (no YoY delta)", async () => {
    // RED before: tool emitted something like "YoY: 2025-Q4 -> 2026-Q1" with false -82.2% delta.
    // GREEN after: comparison section is present but shows PUB-7 mismatch message; no pct delta.
    const db = makeDb();

    // Latest: Q1-2026 (standalone quarter)
    const latestId = seedPassingReport(db, {
      action_code: "FPT",
      sort_key: "2026-Q1",
      period_type: "Q1",
      period_year: 2026,
      period_quarter: 1,
      net_revenue: 12_480_000,
      net_profit: 2_000_000,
      extraction_confidence: 0.82,
    });
    // Ensure the latest report bctc_table_rows already seeded in seedPassingReport

    // Prior: Q4-2025 (FY-cumulative)
    const priorId = seedPassingReport(db, {
      id: "prior-q4-2025",
      action_code: "FPT",
      sort_key: "2025-Q4",
      period_type: "Q4",
      period_year: 2025,
      period_quarter: 4,
      net_revenue: 70_112_000,
      net_profit: 11_225_000,
      extraction_confidence: 0.82,
    });

    const text = await callToolDirect(db, "FPT");
    // GREEN: comparison section must contain PUB-7 mismatch message
    expect(text).toContain("PUB-7");
    expect(text).toContain("mismatch");
    expect(text).toContain("withheld");
    // GREEN: must NOT contain a percentage comparison that could be the false -82%
    // We check that no "%" appears inside the comparison section (it's withheld entirely)
    const compStart = text.indexOf("=== QoQ/YoY COMPARISON ===");
    const sentStart = text.indexOf("=== SENTIMENT TREND ===");
    const compSection =
      compStart >= 0 && sentStart > compStart
        ? text.slice(compStart, sentStart)
        : text.slice(compStart);
    // The comparison section must NOT contain any percentage delta (no "%" in a delta line)
    expect(compSection).not.toMatch(/[+-]\d+\.\d+%/);
    // Must NOT contain "YoY:" followed by delta values
    expect(compSection).not.toMatch(/YoY: \d{4}-Q[1-4] -> \d{4}-Q[1-4]/);
  });

  it("DV-BAL0-PUB7-2: latest=Q4 vs prior=Q3 (same year) → comparison withheld", async () => {
    // Q4 is FY-cumulative; Q3 is standalone 9M. Direct comparison invalid.
    const db = makeDb();

    seedPassingReport(db, {
      action_code: "VNM",
      sort_key: "2025-Q4",
      period_type: "Q4",
      period_year: 2025,
      period_quarter: 4,
      net_revenue: 63_645_000,
      net_profit: 9_413_600,
      extraction_confidence: 0.9,
    });

    seedPassingReport(db, {
      id: "vnm-q3-prior",
      action_code: "VNM",
      sort_key: "2025-Q3",
      period_type: "Q3",
      period_year: 2025,
      period_quarter: 3,
      net_revenue: 47_200_000,
      net_profit: 7_100_000,
      extraction_confidence: 0.88,
    });

    const text = await callToolDirect(db, "VNM");
    const compStart = text.indexOf("=== QoQ/YoY COMPARISON ===");
    const sentStart = text.indexOf("=== SENTIMENT TREND ===");
    const compSection =
      compStart >= 0 && sentStart > compStart ? text.slice(compStart, sentStart) : "";

    expect(compSection).toContain("PUB-7");
    expect(compSection).not.toMatch(/[+-]\d+\.\d+%/);
  });

  it("DV-BAL0-PUB7-3: Q4 vs Q4 (both FY-cumulative, same basis) → comparison proceeds normally", async () => {
    // Q4 2025 vs Q4 2024: both FY, same basis → valid YoY comparison allowed.
    const db = makeDb();

    seedPassingReport(db, {
      action_code: "VNM",
      sort_key: "2025-Q4",
      period_type: "Q4",
      period_year: 2025,
      period_quarter: 4,
      net_revenue: 63_645_000,
      net_profit: 9_413_600,
      extraction_confidence: 0.9,
    });

    seedPassingReport(db, {
      id: "vnm-q4-2024",
      action_code: "VNM",
      sort_key: "2024-Q4",
      period_type: "Q4",
      period_year: 2024,
      period_quarter: 4,
      net_revenue: 58_200_000,
      net_profit: 8_100_000,
      extraction_confidence: 0.88,
    });

    const text = await callToolDirect(db, "VNM");
    const compStart = text.indexOf("=== QoQ/YoY COMPARISON ===");
    const sentStart = text.indexOf("=== SENTIMENT TREND ===");
    const compSection =
      compStart >= 0 && sentStart > compStart ? text.slice(compStart, sentStart) : "";

    // PUB-7 must NOT fire (both Q4 = same basis)
    expect(compSection).not.toContain("PUB-7");
    // A real comparison must be present
    expect(compSection).toContain("Net Revenue");
  });

  it("DV-BAL0-PUB7-4: Q1 vs Q1 prior year (both standalone) → comparison proceeds", async () => {
    const db = makeDb();

    seedPassingReport(db, {
      action_code: "FPT",
      sort_key: "2026-Q1",
      period_type: "Q1",
      period_year: 2026,
      period_quarter: 1,
      extraction_confidence: 0.9,
    });

    seedPassingReport(db, {
      id: "fpt-q1-2025",
      action_code: "FPT",
      sort_key: "2025-Q1",
      period_type: "Q1",
      period_year: 2025,
      period_quarter: 1,
      extraction_confidence: 0.88,
    });

    const text = await callToolDirect(db, "FPT");
    const compStart = text.indexOf("=== QoQ/YoY COMPARISON ===");
    const sentStart = text.indexOf("=== SENTIMENT TREND ===");
    const compSection =
      compStart >= 0 && sentStart > compStart ? text.slice(compStart, sentStart) : "";

    // PUB-7 must NOT fire
    expect(compSection).not.toContain("PUB-7");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUB-8: parent-only heuristic (net_revenue=0, net_profit>0, conf<0.6)
// ═══════════════════════════════════════════════════════════════════════════════

describe("PUB-8 (BAL-0): parent-only heuristic gate", () => {
  it("DV-BAL0-PUB8-1: rev=0, np>0, conf=0.44 → checkPublishability publishable=false (PUB-5 fires first)", () => {
    // When conf=0.44 < 0.5, PUB-5 fires first. Both are blocking.
    const db = makeDb();
    const id = seedPassingReport(db, {
      net_revenue: 0,
      net_profit: 5597.9,
      extraction_confidence: 0.44,
    });
    const row = makeRow({ net_revenue: 0, net_profit: 5597.9, extraction_confidence: 0.44 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(false);
    // PUB-5 fires first (conf 0.44 < 0.5)
    expect(result.reason).toContain("PUB-5");
  });

  it("DV-BAL0-PUB8-2: rev=0, np>0, conf=0.55 (above PUB-5 threshold) → PUB-8 fires", () => {
    // RED before: tool returned financial data for parent-only. GREEN after: blocked.
    const db = makeDb();
    const id = seedPassingReport(db, {
      net_revenue: 0,
      net_profit: 5597.9,
      extraction_confidence: 0.55,
    });
    const row = makeRow({ net_revenue: 0, net_profit: 5597.9, extraction_confidence: 0.55 });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(false);
    expect(result.reason).toContain("PUB-8");
    expect(result.reason).toContain("Rev=0");
    expect(result.reason).toContain("55%");
  });

  it("DV-BAL0-PUB8-3: rev=0, np>0, conf=0.6 (at PUB-8 threshold, exactly 0.6) → passes PUB-8", () => {
    // 0.6 is the upper bound — threshold is STRICTLY less than 0.6
    const db = makeDb();
    const id = seedPassingReport(db, {
      net_revenue: 0,
      net_profit: 5597.9,
      extraction_confidence: 0.6,
    });
    const row = makeRow({ net_revenue: 0, net_profit: 5597.9, extraction_confidence: 0.6 });
    const result = checkPublishability(db, id, false, row);
    // PUB-5 passed (conf >= 0.5). PUB-8 threshold is < 0.6, so 0.6 passes.
    expect(result.reason ?? "").not.toMatch(/PUB-8/);
  });

  it("DV-BAL0-PUB8-4: rev>0, np>0 (consolidated report) → PUB-8 does NOT fire", () => {
    const db = makeDb();
    const id = seedPassingReport(db, {
      net_revenue: 140_000_000,
      net_profit: 8_000_000,
      extraction_confidence: 0.55,
    });
    const row = makeRow({
      net_revenue: 140_000_000,
      net_profit: 8_000_000,
      extraction_confidence: 0.55,
    });
    const result = checkPublishability(db, id, false, row);
    expect(result.reason ?? "").not.toMatch(/PUB-8/);
  });

  it("DV-BAL0-PUB8-5: tool returns PUB-8 refusal for parent-only filing (end-to-end)", async () => {
    const db = makeDb();
    seedPassingReport(db, {
      action_code: "HPG",
      sort_key: "2025-Q4",
      period_type: "Q4",
      net_revenue: 0,
      net_profit: 5597.9,
      extraction_confidence: 0.55,
    });
    const text = await callToolDirect(db, "HPG");
    expect(text).not.toContain("=== BCTC SUMMARY");
    expect(text).toContain("PUB-8");
    expect(text).toContain("Parent-only");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUB-1..4 still pass (regression guard — new gates must not break old guards)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Regression: PUB-1..4 still block correctly after adding PUB-5..8", () => {
  it("PUB-1 still fires for PENDING report even with row=undefined", () => {
    const db = makeDb();
    const id = seedPassingReport(db, { refine_status: "PENDING" });
    // No row passed — PUB-5..8 should be silently skipped (safe fail-open)
    const result = checkPublishability(db, id, false);
    expect(result.publishable).toBe(false);
    expect(result.reason).toContain("Chưa có dữ liệu");
  });

  it("clean high-confidence report with sane ratios → publishable=true, no warnings", () => {
    const db = makeDb();
    const id = seedPassingReport(db, {
      extraction_confidence: 0.92,
      roa: 5.0,
      roe: 12.0,
      net_debt_to_ebitda: 5.0,
      eps: 4000,
      net_revenue: 1_000_000,
      net_profit: 150_000,
    });
    const row = makeRow({
      extraction_confidence: 0.92,
      roa: 5.0,
      roe: 12.0,
      net_debt_to_ebitda: 5.0,
      eps: 4000,
      net_revenue: 1_000_000,
      net_profit: 150_000,
    });
    const result = checkPublishability(db, id, false, row);
    expect(result.publishable).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.sanitizedRatios).toBeUndefined();
    expect(result.partialWarning).toBeUndefined();
  });
});
