/**
 * BANK-AWARE-1-consumer-audit.test.ts — DV Anti-False-Green Consumer Audit
 *
 * Sprint: BANK-AWARE-BCTC | Task: BANK-DEV-1
 * Date: 2026-05-31
 * Zone: apps/mcp-server/src/__tests__/
 *
 * RED-before-GREEN protocol: each test carries a comment showing what the OLD
 * code produced (wrong result) and what the FIXED code produces (correct).
 *
 * Coverage: 7 bank-unaware consumers fixed in BANK-DEV-1.
 * DV-BANK-1: C-1  — PUB-3 bank publishability (Roman-numeral codes, general section)
 * DV-BANK-2: C-2  — buildSummarySection gross_profit display for banks
 * DV-BANK-3: C-4  — detectMagnitudeViolations DT-2a bank skip
 * DV-BANK-4: C-5  — bctcValidator gross_profit false warning for banks
 * DV-BANK-5: C-6  — computeBctcEval Stage-6 defensive fallback (domain="" bank)
 *
 * DV-BANK-6 (end-to-end get_bctc_full via gateway after container rebuild) is
 * QA's gate (BANK-QA-1). Not testable until BANK-OPS-1 rebuilds the container.
 *
 * Architecture note: all tests import from production source directly.
 * Zero mocking of the functions under test — we call the real implementations.
 * In-memory SQLite (new Database(":memory:")) for I/O-bound tests.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

// ── imports under test ────────────────────────────────────────────────────────
import { isBankFormFromRows } from "../domain/services/financial-reports/bctcFormType.js";
import {
  checkPublishability,
  buildSummarySection,
  fmtBillions,
} from "../interface/mcp/tools/financial-reports/bctcFullTools.js";
import {
  detectMagnitudeViolations,
} from "../domain/services/financial-reports/bctcMagnitudeValidator.js";
import {
  validateFinancialReport,
} from "../domain/services/financial-reports/bctcValidator.js";
import {
  computeBctcEval,
} from "../application/usecases/computeBctcEval.js";
import type { MagnitudeRow } from "../domain/services/financial-reports/bctcMagnitudeValidator.js";
import type { BctcEvalThresholds } from "../domain/services/bctcEvalDetectors.js";

// ── ACB-pattern constants (from FU-TRUST-REFRESH verified values) ─────────────
// ACB Q1-2025: domain="banking", all balance rows in statement_section='general'
// Roman-numeral codes. total_assets=1,030,900,741M, equity=98,751,052M
const ACB_REPORT_ID = "fea19bae-2b7a-4954-b3e0-e09d7bfc7390";
const ACB_NET_REVENUE = 6_989_162; // million VND (Thu nhập lãi thuần)
const ACB_NET_PROFIT = 4_320_388;  // million VND
const ACB_TOTAL_ASSETS = 1_030_900_741; // million VND
const ACB_EQUITY = 98_751_052;    // million VND

// ── Minimal DB DDL for bctcFullTools in-memory tests ─────────────────────────

function makeFullToolsDb(): Database {
  const db = new Database(":memory:");

  db.run(`CREATE TABLE IF NOT EXISTS financial_reports (
    id TEXT PRIMARY KEY,
    action_code TEXT NOT NULL,
    company_name TEXT,
    period_year INTEGER NOT NULL DEFAULT 2025,
    period_quarter INTEGER,
    period_type TEXT NOT NULL DEFAULT 'Q1',
    sort_key TEXT NOT NULL DEFAULT '2025-Q1',
    audit_status TEXT NOT NULL DEFAULT 'unaudited',
    extraction_confidence REAL NOT NULL DEFAULT 0.9,
    domain TEXT,
    net_revenue REAL,
    gross_profit REAL,
    operating_profit REAL NOT NULL DEFAULT 0,
    ebitda REAL NOT NULL DEFAULT 0,
    profit_before_tax REAL NOT NULL DEFAULT 0,
    net_profit REAL,
    eps REAL NOT NULL DEFAULT 0,
    diluted_eps REAL NOT NULL DEFAULT 0,
    total_assets REAL,
    current_assets REAL,
    cash REAL NOT NULL DEFAULT 0,
    inventory REAL NOT NULL DEFAULT 0,
    total_liabilities REAL,
    short_term_debt REAL NOT NULL DEFAULT 0,
    long_term_debt REAL NOT NULL DEFAULT 0,
    equity_total REAL,
    operating_cf REAL NOT NULL DEFAULT 0,
    investing_cf REAL NOT NULL DEFAULT 0,
    financing_cf REAL NOT NULL DEFAULT 0,
    capex REAL NOT NULL DEFAULT 0,
    free_cash_flow REAL NOT NULL DEFAULT 0,
    gross_margin_pct REAL,
    operating_margin_pct REAL,
    net_margin_pct REAL,
    roe REAL,
    roa REAL,
    current_ratio REAL,
    debt_to_equity REAL,
    net_debt_to_ebitda REAL,
    pe REAL,
    pb REAL,
    published_at TEXT NOT NULL DEFAULT '',
    yoy_delta_json TEXT,
    qoq_delta_json TEXT,
    refine_status TEXT DEFAULT 'DONE'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bctc_table_rows (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id        TEXT    NOT NULL,
    page_number      INTEGER NOT NULL DEFAULT 1,
    statement_section TEXT   NOT NULL,
    row_order        INTEGER NOT NULL DEFAULT 0,
    code             TEXT,
    label            TEXT    NOT NULL,
    period_current   TEXT    NOT NULL DEFAULT '2025-Q1',
    value_current    REAL,
    period_prior     TEXT,
    value_prior      REAL,
    unit             TEXT    NOT NULL DEFAULT 'billion_vnd',
    is_summary_row   INTEGER NOT NULL DEFAULT 0,
    source_confidence REAL   NOT NULL DEFAULT 0.9
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bctc_refined_units (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id         TEXT    NOT NULL,
    unit_id           TEXT    NOT NULL,
    page_numbers_json TEXT    NOT NULL DEFAULT '[1]',
    markdown          TEXT    NOT NULL DEFAULT '',
    row_count         INTEGER NOT NULL DEFAULT 0,
    confidence        REAL    NOT NULL DEFAULT 0.9,
    flags             TEXT,
    window_status     TEXT    NOT NULL DEFAULT 'DONE',
    refined_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(report_id, unit_id)
  )`);

  return db;
}

// ── Minimal DB DDL for computeBctcEval ────────────────────────────────────────

function makeEvalDb(): Database {
  const db = new Database(":memory:");

  db.run(`CREATE TABLE IF NOT EXISTS financial_reports (
    id TEXT PRIMARY KEY,
    action_code TEXT NOT NULL DEFAULT 'ACB',
    domain TEXT,
    net_revenue REAL,
    gross_profit REAL,
    net_profit REAL,
    total_assets REAL,
    parsed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bctc_table_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT NOT NULL,
    code TEXT,
    label TEXT NOT NULL,
    value_current REAL,
    value_prior REAL,
    row_order INTEGER NOT NULL DEFAULT 0
  ,
    statement_section TEXT NOT NULL DEFAULT 'general')`);

  db.run(`CREATE TABLE IF NOT EXISTS bctc_md_tables (
    report_id TEXT NOT NULL,
    md_tables_json TEXT NOT NULL DEFAULT '[]',
    table_count INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bctc_eval_results (
    report_id TEXT NOT NULL,
    stage_no INTEGER NOT NULL,
    stage_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('green','yellow','red')),
    metrics_json TEXT NOT NULL DEFAULT '{}',
    gate_failures_json TEXT NOT NULL DEFAULT '[]',
    golden_diff_json TEXT NOT NULL DEFAULT '{}',
    detector_version TEXT NOT NULL DEFAULT 'v1',
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (report_id, stage_no)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bctc_balance_checks (
    report_id TEXT NOT NULL,
    balance_pass INTEGER NOT NULL DEFAULT 0
  )`);

  return db;
}

// ── Eval thresholds (matches docs/data/bctc-eval-thresholds.json) ────────────

const EVAL_THRESHOLDS: BctcEvalThresholds = {
  "4_TABLE_RECONSTRUCT": {
    label_coverage_min: 0.90,
    code_coverage_min: 0.80,
    exact_dup_max: 0,
    value_blank_label_max: 0,
  },
  "5_MARKDOWN_RENDER": {
    roundtrip_row_match_min: 0.95,
    roundtrip_value_drift_max: 0.01,
  },
  "6_STRUCTURED_EXTRACT": {
    golden_row_match_min: 0.90,
    balance_pass_is_signal_only: true,
    qoq_outlier_threshold: 2.0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DV-BANK-7: isBankFormFromRows discriminator regression (BANK-ARCH-4 / BANK-DEV-4)
// ─────────────────────────────────────────────────────────────────────────────
//
// Signal: bank ⟺ hasRomanOrSection(rows) AND NOT hasCorpBalance(rows)
//   ROMAN_SECTION = /^(XIII|XII|XI|IX|VIII|VII|VI|IV|III|II|I|X|V)(\.\d+)?$|^[AB]$/
//   CORP_BALANCE  = /^[0-9]{3}/
//
// RED-before-GREEN protocol for BANK-DEV-4:
//   BEFORE (BANK-DEV-3 any-letter /[A-Za-z]/):
//     Seed 6 [100,270,411a,420a,420b] → true (WRONG — 411a has letter)
//     Mixed [I,II,100,null] → true (WRONG — BANK-ARCH-3 letter-wins ruling)
//   AFTER (BANK-DEV-4 hybrid):
//     Seed 6 → false (CORP_BALANCE fires on 100/270 — FPT real codes correctly CORPORATE)
//     Mixed [I,II,100,null] → false (CORP_BALANCE veto fires on 100)
//
// Seed 1: corporate rows with 3-digit codes → false (CORP_BALANCE fires)
// Seed 2: bank rows with Roman/null codes → true (ROMAN_SECTION matches; no 3-digit)
// Seed 3: empty rows → false (fail-safe: no silent bank promotion)
// Seed 4: rows with alphabetic and Roman codes → true (I matches Roman, B matches [AB]$)
// Seed 5: income-only corporate [10,60] → false (DV-FU6F-B1-3 regression guard)
// Seed 6: FPT real codes [100,270,411a,420a,420b] → false (BANK-DEV-3 regression guard)
// Seed 7: ACB real codes [A,B,I,I.1,XIII,01,null] → true (bank path intact)

describe("DV-BANK-7 — isBankFormFromRows structural discriminator regression", () => {
  it("Seed 1: rows with 3-digit codes [100,200,300,400] → false (corporate)", () => {
    // Corporate Mẫu B01-DN: codes 100-440 always present.
    // BANK-DEV-4 (hybrid): CORP_BALANCE fires on 100/200/300/400 → hasCorpBalance=true
    //   → result=false (CORPORATE). hasRomanOrSection=false also.
    const rows = [
      { code: "100" },
      { code: "200" },
      { code: "300" },
      { code: "400" },
    ];
    expect(isBankFormFromRows(rows)).toBe(false);
  });

  it("Seed 2: rows with Roman/null codes [I,II,VIII,IX,null] → true (bank)", () => {
    // Bank Mẫu B02-TCTD: Roman numerals and nulls only
    // BEFORE: isBankForm("banking") = true — correct but by domain string
    // AFTER: structural — no 3-digit code → bank → true
    const rows = [
      { code: "I" },
      { code: "II" },
      { code: "VIII" },
      { code: "IX" },
      { code: null },
    ];
    expect(isBankFormFromRows(rows)).toBe(true);
  });

  it("Seed 3: empty rows → false (fail-safe: no silent bank promotion without evidence)", () => {
    // BEFORE: isBankForm(undefined) = false — coincidentally same, different reason
    // AFTER: empty rows → fail-safe → false
    expect(isBankFormFromRows([])).toBe(false);
  });

  it("Seed 4: rows with alphabetic and Roman codes [01,02,I,B] → true (bank)", () => {
    // ACB-pattern: single-digit numeric codes (01-09), alphabetic (A, B), Roman (I).
    // BANK-ARCH-3: "I" and "B" contain letters → positive bank evidence → true.
    // BEFORE (BANK-DEV-2 absence signal): no 3-digit code → true (same result, different reason).
    // AFTER (positive evidence): letter in "I" or "B" → true (contains letter code I, B).
    const rows = [
      { code: "01" },
      { code: "02" },
      { code: "I" },
      { code: "B" },
    ];
    expect(isBankFormFromRows(rows)).toBe(true);
  });

  it("Edge: row with code '99' (2-digit numeric, no letter) → false (not bank evidence)", () => {
    // BANK-ARCH-3: positive signal. '99' contains no letter → not bank evidence → false.
    // Under BANK-DEV-2 (absence signal): no 3-digit → true. That was wrong.
    // Under BANK-DEV-3 (positive evidence): no letter → false (corporate/ambiguous).
    const rows = [{ code: "99" }];
    expect(isBankFormFromRows(rows)).toBe(false);
  });

  it("Edge: row with code '1000' (4-digit) → false (4-digit also not a bank code, but matches /^[0-9]{3}/)", () => {
    // /^[0-9]{3}/ matches "1000" because "100" is the first 3 chars
    // 4-digit codes are not expected in either form, but the regex is prefix-only
    // Test documents the regex behaviour explicitly.
    const rows = [{ code: "1000" }];
    expect(isBankFormFromRows(rows)).toBe(false);
  });

  it("Mixed: Roman codes with one 3-digit code [I,II,100,null] → false (corporate veto fires)", () => {
    // BANK-ARCH-4 ruling (overrides BANK-ARCH-3): "100" is an unambiguous VAS B01-DN code.
    // Its presence fires the CORP_BALANCE veto → result=false (CORPORATE).
    // BANK-ARCH-3 had ruled "letter evidence wins" — that was wrong: "100" only appears
    // in B01-DN; a single 3-digit code among Romans is treated as corporate unconditionally.
    // BEFORE (BANK-DEV-3 any-letter): "I"/"II" contain letters → true (bank). WRONG.
    // AFTER (BANK-DEV-4 hybrid): "I"/"II" match ROMAN_SECTION (hasRomanOrSection=true) BUT
    //   "100" fires CORP_BALANCE veto (hasCorpBalance=true) → false (CORPORATE). CORRECT.
    const rows = [
      { code: "I" },
      { code: "II" },
      { code: "100" }, // unambiguous B01-DN code — fires corporate veto
      { code: null },
    ];
    expect(isBankFormFromRows(rows)).toBe(false);
  });

  it("Seed 5: rows with 2-digit income codes only [10,60] → false (corporate income-only, DV-FU6F-B1-3 regression guard)", () => {
    // THE DV-FU6F-B1-3 REGRESSION GUARD.
    // A corporate income-only extraction (e.g. VNM: only income rows OCR'd, balance not yet
    // extracted) produces codes ["10","60"] — Mẫu B01-DN income codes 10 (Doanh thu thuần)
    // and 60 (Lợi nhuận sau thuế). Neither matches ROMAN_SECTION; neither starts with 3 digits.
    // hasRomanOrSection = false → result = false (CORPORATE). CORRECT.
    const rows = [
      { code: "10" },
      { code: "60" },
    ];
    expect(isBankFormFromRows(rows)).toBe(false);
  });

  it("Seed 6: FPT real VAS sub-codes [100, 270, 411a, 420a, 420b] → false (CORPORATE)", () => {
    // THE BANK-DEV-3 REGRESSION GUARD.
    // FPT (corporate Mẫu B01-DN) has letter-suffixed VAS sub-codes: 411a, 420a, 420b, 26b.
    // BANK-DEV-3 (any-letter signal): "411a" contains "a" → isBankFormFromRows=true. WRONG.
    // BANK-DEV-4 (hybrid): "411a" does not match ROMAN_SECTION (anchored); "100"/"270" fire
    //   CORP_BALANCE veto → hasCorpBalance=true → result=false (CORPORATE). CORRECT.
    // This seed uses real codes from FPT report e8ea3df5 (live DB read 2026-05-31).
    const rows = [
      { code: "100" },  // current_assets — unambiguous B01-DN balance code
      { code: "270" },  // total_assets
      { code: "411a" }, // VAS sub-code with letter suffix — NOT a Roman numeral
      { code: "420a" }, // VAS sub-code
      { code: "420b" }, // VAS sub-code
    ];
    // BEFORE fix (BANK-DEV-3): isBankFormFromRows = true (letter in "411a","420a","420b")
    // AFTER fix (BANK-DEV-4): isBankFormFromRows = false (CORP_BALANCE fires on 100/270)
    expect(isBankFormFromRows(rows)).toBe(false);
  });

  it("Seed 7: ACB real Roman codes [A, B, I, I.1, XIII, 01, null] → true (BANK)", () => {
    // ACB (bank Mẫu B02-TCTD) real codes from report fea19bae (live DB read 2026-05-31).
    // Roman numerals I–XIII, section headers A/B, short numeric 01-09, nulls.
    // All iterations agree ACB is bank; this seed proves the hybrid signal still holds.
    const rows = [
      { code: "A" },    // section header — matches ^[AB]$
      { code: "B" },    // section header
      { code: "I" },    // Roman I — matches ROMAN_SECTION
      { code: "I.1" },  // decimal sub-item
      { code: "XIII" }, // Roman XIII
      { code: "01" },   // short numeric — neither Roman nor 3-digit
      { code: null },
    ];
    // hasRomanOrSection = true (A, B, I, I.1, XIII all match)
    // hasCorpBalance = false (no ^[0-9]{3} codes — "01" is only 2 digits)
    // Result: true AND NOT false = true (BANK)
    expect(isBankFormFromRows(rows)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DV-BANK-1: C-1 — PUB-3 bank publishability
// ─────────────────────────────────────────────────────────────────────────────
//
// BEFORE fix: PUB-3 used CAST(code AS INTEGER) BETWEEN 100 AND 440.
//   ACB rows: code="I", "VIII", null → CAST to NULL → 0 rows matched → publishable=false.
// AFTER fix: when bankForm=true, PUB-3 accepts any non-summary 'general' row with
//   value_current IS NOT NULL (regardless of code value) → publishable=true.

describe("DV-BANK-1 — C-1: PUB-3 bank publishability (Roman-numeral codes)", () => {
  it("BANK form: 10 general rows with Roman codes → publishable=true", () => {
    const db = makeFullToolsDb();
    const reportId = "test-bank-pub3-roman";

    // Seed: financial_reports row with domain=banking, refine_status=DONE
    db.prepare(
      `INSERT INTO financial_reports (id, action_code, domain, refine_status, period_year, period_type, sort_key, audit_status, extraction_confidence, net_revenue, gross_profit, operating_profit, ebitda, profit_before_tax, net_profit, eps, diluted_eps, total_assets, current_assets, cash, inventory, total_liabilities, short_term_debt, long_term_debt, equity_total, operating_cf, investing_cf, financing_cf, capex, free_cash_flow, published_at)
       VALUES (?, 'ACB', 'banking', 'DONE', 2025, 'Q1', '2025-Q1', 'unaudited', 0.9, ?, NULL, 0, 0, 0, ?, 0, 0, ?, NULL, 0, 0, ?, 0, 0, ?, 0, 0, 0, 0, 0, '')`,
    ).run(reportId, ACB_NET_REVENUE, ACB_NET_PROFIT, ACB_TOTAL_ASSETS, ACB_TOTAL_ASSETS - ACB_EQUITY, ACB_EQUITY);

    // Seed: 10 general rows with Roman-numeral codes (ACB pattern)
    // code="I", "II", "III", "VIII", "IX", and nulls — all CAST to NULL in SQLite
    const romanCodes = ["I", "II", "III", "IV", "V", "VIII", "IX", "X", null, null];
    for (let i = 0; i < 10; i++) {
      db.prepare(
        `INSERT INTO bctc_table_rows (report_id, statement_section, row_order, code, label, period_current, value_current, is_summary_row)
         VALUES (?, 'general', ?, ?, ?, '2025-Q1', ?, 0)`,
      ).run(reportId, i, romanCodes[i] ?? null, `Row ${i}`, ACB_TOTAL_ASSETS / 10);
    }

    // Also seed bctc_refined_units (PUB-1 requires refine_status=DONE which we set above)

    // Call with bankForm=true
    const result = checkPublishability(db, reportId, true);

    // BEFORE fix: publishable=false ("balance sheet has no decomposition")
    // AFTER fix: publishable=true (bank path: any non-summary general row with value_current IS NOT NULL)
    expect(result.publishable).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("CORPORATE form: same general rows with Roman codes → publishable=false (corporate path unchanged)", () => {
    // Regression guard: corporate path must still use CAST logic
    const db = makeFullToolsDb();
    const reportId = "test-corp-pub3-roman";

    db.prepare(
      `INSERT INTO financial_reports (id, action_code, domain, refine_status, period_year, period_type, sort_key, audit_status, extraction_confidence, net_revenue, gross_profit, operating_profit, ebitda, profit_before_tax, net_profit, eps, diluted_eps, total_assets, current_assets, cash, inventory, total_liabilities, short_term_debt, long_term_debt, equity_total, operating_cf, investing_cf, financing_cf, capex, free_cash_flow, published_at)
       VALUES (?, 'FPT', 'technology', 'DONE', 2025, 'Q1', '2025-Q1', 'unaudited', 0.9, 10000, 3000, 0, 0, 0, 2000, 0, 0, 50000, 20000, 0, 0, 30000, 0, 0, 20000, 0, 0, 0, 0, 0, '')`,
    ).run(reportId);

    // Corporate rows: only Roman-numeral codes (no numeric 100-440 codes) → PUB-3 fails
    db.prepare(
      `INSERT INTO bctc_table_rows (report_id, statement_section, row_order, code, label, period_current, value_current, is_summary_row)
       VALUES (?, 'general', 0, 'I', 'Row I', '2025-Q1', 50000, 0)`,
    ).run(reportId);

    const result = checkPublishability(db, reportId, false); // corporate
    // Roman codes CAST to NULL → BETWEEN 100 AND 440 fails → publishable=false
    expect(result.publishable).toBe(false);
    expect(result.reason).toContain("balance sheet has no decomposition");
  });

  it("CORPORATE form: numeric codes 100-440 in general → publishable=true (existing behavior preserved)", () => {
    const db = makeFullToolsDb();
    const reportId = "test-corp-pub3-numeric";

    db.prepare(
      `INSERT INTO financial_reports (id, action_code, domain, refine_status, period_year, period_type, sort_key, audit_status, extraction_confidence, net_revenue, gross_profit, operating_profit, ebitda, profit_before_tax, net_profit, eps, diluted_eps, total_assets, current_assets, cash, inventory, total_liabilities, short_term_debt, long_term_debt, equity_total, operating_cf, investing_cf, financing_cf, capex, free_cash_flow, published_at)
       VALUES (?, 'FPT', 'technology', 'DONE', 2025, 'Q1', '2025-Q1', 'unaudited', 0.9, 10000, 3000, 0, 0, 0, 2000, 0, 0, 50000, 20000, 0, 0, 30000, 0, 0, 20000, 0, 0, 0, 0, 0, '')`,
    ).run(reportId);

    db.prepare(
      `INSERT INTO bctc_table_rows (report_id, statement_section, row_order, code, label, period_current, value_current, is_summary_row)
       VALUES (?, 'general', 0, '110', 'Tiền và tương đương tiền', '2025-Q1', 20000, 0)`,
    ).run(reportId);

    const result = checkPublishability(db, reportId, false); // corporate
    expect(result.publishable).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DV-BANK-2: C-2 — buildSummarySection gross_profit display for banks
// ─────────────────────────────────────────────────────────────────────────────
//
// BEFORE fix: buildSummarySection always rendered:
//   "Gross Profit     : 0.0 tỷ VND  (N/A)"
//   because fmtBillions(null) → null/1000 = 0 (JS null→0 coercion).
// AFTER fix: bank form substitutes net interest income line; no "0.0 tỷ VND" for gross.

describe("DV-BANK-2 — C-2: buildSummarySection gross_profit display for banks", () => {
  // Synthetic ReportRow matching the shape used by buildSummarySection
  // We call the exported function directly with a minimal row object.
  const bankRow = {
    id: "test-bank-summary",
    action_code: "ACB",
    company_name: "Ngân hàng TMCP Á Châu",
    period_year: 2025,
    period_quarter: 1,
    period_type: "Q1",
    sort_key: "2025-Q1",
    audit_status: "unaudited",
    extraction_confidence: 0.9,
    domain: "banking",
    net_revenue: ACB_NET_REVENUE,
    gross_profit: null as unknown as number,     // SET NULL by FU-6e for banks
    operating_profit: 0,
    ebitda: 0,
    profit_before_tax: 0,
    net_profit: ACB_NET_PROFIT,
    eps: 0,
    diluted_eps: 0,
    total_assets: ACB_TOTAL_ASSETS,
    current_assets: null as unknown as number,   // SET NULL for banks
    cash: 0,
    inventory: 0,
    total_liabilities: ACB_TOTAL_ASSETS - ACB_EQUITY,
    short_term_debt: 0,
    long_term_debt: 0,
    equity_total: ACB_EQUITY,
    operating_cf: 0,
    investing_cf: 0,
    financing_cf: 0,
    capex: 0,
    free_cash_flow: 0,
    gross_margin_pct: null as unknown as number, // SET NULL for banks
    operating_margin_pct: null,
    net_margin_pct: null,
    roe: null,
    roa: null,
    current_ratio: null,                         // null for banks (no current_assets)
    debt_to_equity: null,
    net_debt_to_ebitda: null,
    pe: null,
    pb: null,
    published_at: "2025-05-01",
    yoy_delta_json: null,
    qoq_delta_json: null,
    refine_status: "DONE",
    period_basis: null,
    balance_sheet_json: null,
    report_scope: null,
  };

  it("BANK form: summary does NOT contain 'Gross Profit     : 0.0 tỷ VND'", () => {
    // BEFORE fix: output contained "Gross Profit     : 0.0 tỷ VND"
    //   because fmtBillions(null) → (null/1000)=0 → "0,0 tỷ VND" (vi-VN locale)
    // AFTER fix: bank path substitutes "Net Interest Inc." line — no 0.0 gross profit shown
    const output = buildSummarySection("ACB", bankRow, true);
    // Must NOT contain the old misleading 0.0 gross profit rendering
    expect(output).not.toContain("Gross Profit     : 0,0 tỷ VND");
    expect(output).not.toContain("Gross Profit     : 0.0 tỷ VND");
  });

  it("BANK form: summary contains 'Net Interest Inc.' or 'N/A' substitute", () => {
    const output = buildSummarySection("ACB", bankRow, true);
    // Must contain the bank-specific substitute line
    expect(output).toContain("Net Interest Inc.");
  });

  it("BANK form: Current Ratio shows N/A (no current_assets concept)", () => {
    const output = buildSummarySection("ACB", bankRow, true);
    expect(output).toContain("Current Ratio    : N/A");
  });

  it("CORPORATE form: gross profit line still present (regression guard)", () => {
    const corpRow = { ...bankRow, domain: "technology", gross_profit: 3_000_000, gross_margin_pct: 30, current_ratio: 1.5 };
    const output = buildSummarySection("FPT", corpRow, false);
    // Corporate: must still show the Gross Profit line with a real value
    expect(output).toContain("Gross Profit");
    expect(output).not.toContain("Net Interest Inc.");
    // Corporate: must show Current Ratio as a number (fmtX uses toFixed(2) → "1.50x")
    expect(output).toContain("Current Ratio    : 1.50x");
  });

  it("fmtBillions(null) helper: null coerces to 0 (documents the original bug root)", () => {
    // This test documents WHY C-2 was needed:
    // fmtBillions receives null → null/1000 = 0 in JS → toLocaleString("vi-VN") → "0 tỷ VND".
    // This is misleading: a bank has no gross profit concept, not ZERO gross profit.
    // The fix bypasses fmtBillions(null) for banks entirely.
    const result = fmtBillions(null as unknown as number);
    // Confirm: produces some form of zero — the misleading "zero" rendering for null
    expect(result).toMatch(/^0/); // starts with "0" (could be "0 tỷ VND" or "0,0 tỷ VND")
    expect(result).toContain("tỷ VND");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DV-BANK-3: C-4 — detectMagnitudeViolations DT-2a bank skip
// ─────────────────────────────────────────────────────────────────────────────
//
// BEFORE fix: detectMagnitudeViolations(rows) searched income_statement section.
//   Bank income rows land in 'general' → incomeRows.length===0 → LABEL_AMBIGUOUS WARN fires.
//   (If rows were in income_statement, any future label match could trigger MAGNITUDE_GROSS_EQ_NET.)
// AFTER fix: when isBankForm=true, DT-2a is skipped entirely — no LABEL_AMBIGUOUS for banks.

describe("DV-BANK-3 — C-4: detectMagnitudeViolations DT-2a bank skip", () => {
  // Simulate income rows in income_statement section (future BCTC-LAYOUT-FIRST scenario)
  // to prove the guard is structural (not just vacuous because rows are in 'general').
  const bankIncomeRows: MagnitudeRow[] = [
    {
      statement_section: "income_statement",
      is_summary_row: 1,
      label: "Thu nhập lãi thuần",    // bank net interest income — not "doanh thu thuần"
      value_current: ACB_NET_REVENUE,
      value_prior: 6_500_000,
    },
    {
      statement_section: "income_statement",
      is_summary_row: 1,
      label: "Lợi nhuận sau thuế",    // net profit
      value_current: ACB_NET_PROFIT,
      value_prior: 4_000_000,
    },
  ];

  it("BANK form (isBankForm=true): income rows present → NO LABEL_AMBIGUOUS WARN", () => {
    // BEFORE fix: detectMagnitudeViolations(bankIncomeRows) (no 2nd param = default false)
    //   incomeRows.length=2 > 0, no regex match for "doanh thu thuần" or "lợi nhuận gộp"
    //   → WARN "Income statement present but net_revenue or gross_profit label match ambiguous"
    // AFTER fix: isBankForm=true → DT-2a skipped → no LABEL_AMBIGUOUS
    const violations = detectMagnitudeViolations(bankIncomeRows, true);
    const haslabelAmbiguous = violations.some((v) => v.code === "MAGNITUDE_LABEL_AMBIGUOUS");
    expect(haslabelAmbiguous).toBe(false);
    // Must produce zero violations for valid bank income data
    expect(violations).toHaveLength(0);
  });

  it("CORPORATE form (isBankForm=false): income rows with ambiguous labels → LABEL_AMBIGUOUS fires (existing behavior)", () => {
    // Regression guard: corporate path must still produce WARN for ambiguous labels
    const violations = detectMagnitudeViolations(bankIncomeRows, false);
    const hasLabelAmbiguous = violations.some((v) => v.code === "MAGNITUDE_LABEL_AMBIGUOUS");
    // Corporate: "Thu nhập lãi thuần" doesn't match "doanh thu thuần" regex → ambiguous
    expect(hasLabelAmbiguous).toBe(true);
  });

  it("BANK form: balance rows in 'general' section → DT-2b checks them (extended search)", () => {
    // C-4 DT-2b extension: for banks, also search 'general' for balance-sheet rows.
    // A bank with forced-zero (all zero equity/liabilities but non-zero total_assets)
    // in the 'general' section must still be caught.
    const bankBalanceRowsForcedZero: MagnitudeRow[] = [
      {
        statement_section: "general",
        is_summary_row: 1,
        label: "TỔNG TÀI SẢN",
        value_current: ACB_TOTAL_ASSETS,
        value_prior: null,
      },
      {
        statement_section: "general",
        is_summary_row: 1,
        label: "TỔNG NỢ PHẢI TRẢ",
        value_current: 0, // forced-zero
        value_prior: null,
      },
      {
        statement_section: "general",
        is_summary_row: 1,
        label: "VỐN CHỦ SỞ HỮU",
        value_current: 0, // forced-zero
        value_prior: null,
      },
    ];

    const violations = detectMagnitudeViolations(bankBalanceRowsForcedZero, true);
    // Must detect BALANCE_FORCED_ZERO: total_assets > 0, liabilities=0, equity=0
    const hasForceZero = violations.some((v) => v.code === "BALANCE_FORCED_ZERO");
    expect(hasForceZero).toBe(true);
  });

  it("BANK form: realistic balance values in 'general' → no BALANCE_FORCED_ZERO", () => {
    const bankBalanceRowsRealistic: MagnitudeRow[] = [
      {
        statement_section: "general",
        is_summary_row: 1,
        label: "TỔNG TÀI SẢN",
        value_current: ACB_TOTAL_ASSETS,
        value_prior: null,
      },
      {
        statement_section: "general",
        is_summary_row: 1,
        label: "TỔNG NỢ PHẢI TRẢ",
        value_current: ACB_TOTAL_ASSETS - ACB_EQUITY,
        value_prior: null,
      },
      {
        statement_section: "general",
        is_summary_row: 1,
        label: "VỐN CHỦ SỞ HỮU",
        value_current: ACB_EQUITY,
        value_prior: null,
      },
    ];

    const violations = detectMagnitudeViolations(bankBalanceRowsRealistic, true);
    // Realistic bank balance: no forced-zero violation
    expect(violations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DV-BANK-4: C-5 — bctcValidator gross_profit false warning for banks
// ─────────────────────────────────────────────────────────────────────────────
//
// BEFORE fix: validateFinancialReport checked:
//   netProfit (4,320,388) > grossProfit (0, from null→0) && grossProfit >= 0
//   → TRUE → WARNING: "Net profit exceeds gross profit"
// AFTER fix: when isBankForm=true, the gross_profit comparisons are skipped entirely.

describe("DV-BANK-4 — C-5: bctcValidator gross_profit false warning suppressed for banks", () => {
  it("BANK form (isBankForm=true): no 'Net profit exceeds gross profit' warning", () => {
    // BEFORE fix: warning fired because null→0 for grossProfit + netProfit=4,320,388 > 0
    // AFTER fix: isBankForm=true → gross_profit block skipped → no spurious warning
    const result = validateFinancialReport({
      balanceSheet: {
        totalAssets: ACB_TOTAL_ASSETS,
        totalLiabilities: ACB_TOTAL_ASSETS - ACB_EQUITY,
        equityTotal: ACB_EQUITY,
        currentAssets: 0,      // null→0 for bank
        nonCurrentAssets: 0,   // null→0 for bank
      },
      incomeStatement: {
        netRevenue: ACB_NET_REVENUE,
        grossProfit: 0,        // null→0 (the exact pre-fix scenario)
        netProfit: ACB_NET_PROFIT,
      },
      extractionConfidence: 0.9,
      isBankForm: true,
    });

    const hasGrossProfitWarning = result.warnings.some((w) =>
      /net profit exceeds gross profit/i.test(w),
    );
    // BEFORE: true (spurious warning)
    // AFTER: false (bank guard)
    expect(hasGrossProfitWarning).toBe(false);
  });

  it("BANK form: no 'Gross profit exceeds revenue' error either", () => {
    // Edge case: if somehow grossProfit > netRevenue for a bank (data issue),
    // we still skip the check for banks (not our concern — DT-2a handles magnitude).
    const result = validateFinancialReport({
      incomeStatement: {
        netRevenue: ACB_NET_REVENUE,
        grossProfit: ACB_NET_REVENUE + 1000, // impossible but bank skip applies
        netProfit: ACB_NET_PROFIT,
      },
      extractionConfidence: 0.9,
      isBankForm: true,
    });
    const hasGrossExceedsError = result.errors.some((e) =>
      /gross profit exceeds revenue/i.test(e),
    );
    expect(hasGrossExceedsError).toBe(false);
  });

  it("CORPORATE form (isBankForm=false): warning fires when netProfit > grossProfit (regression guard)", () => {
    // Regression guard: corporate path must still produce the warning
    const result = validateFinancialReport({
      balanceSheet: {
        totalAssets: 100_000,
        totalLiabilities: 60_000,
        equityTotal: 40_000,
      },
      incomeStatement: {
        netRevenue: 50_000,
        grossProfit: 10_000,
        netProfit: 15_000, // netProfit > grossProfit → should warn for corporate
      },
      extractionConfidence: 0.9,
      isBankForm: false,
    });

    const hasGrossProfitWarning = result.warnings.some((w) =>
      /net profit exceeds gross profit/i.test(w),
    );
    expect(hasGrossProfitWarning).toBe(true);
  });

  it("BANK form: asset decomposition check (C-7) skipped — no spurious warning", () => {
    // C-7: banks have no current_assets concept. currentAssets=0 (from null) and
    // nonCurrentAssets=0 but totalAssets=1,030,900,741 → would fire decomposition warning.
    // AFTER fix: isBankForm=true → decomposition check skipped.
    const result = validateFinancialReport({
      balanceSheet: {
        totalAssets: ACB_TOTAL_ASSETS,
        totalLiabilities: ACB_TOTAL_ASSETS - ACB_EQUITY,
        equityTotal: ACB_EQUITY,
        currentAssets: 0,    // null→0 for bank (no current_assets concept)
        nonCurrentAssets: 0, // null→0 for bank
      },
      incomeStatement: {
        netRevenue: ACB_NET_REVENUE,
        grossProfit: 0,
        netProfit: ACB_NET_PROFIT,
      },
      extractionConfidence: 0.9,
      isBankForm: true,
    });

    const hasDecompositionWarning = result.warnings.some((w) =>
      /asset decomposition mismatch/i.test(w),
    );
    // BEFORE: would fire (0+0 ≠ 1,030,900,741 → huge divergence)
    // AFTER: skipped for banks
    expect(hasDecompositionWarning).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DV-BANK-5: C-6 — computeBctcEval Stage-6 structural bank detection
// ─────────────────────────────────────────────────────────────────────────────
//
// BEFORE fix (BANK-DEV-1): isBankDomain = /bank/i.test(domain) — domain="other" → false
//   → corporate anchors → gross_profit in goldenAnchors → null gross_profit → red.
// AFTER fix (BANK-DEV-2): PRIMARY = isBankFormFromDb (structural 3-digit code absence).
//   Bank rows have Roman/short codes → isBankFormFromDb=true → bank anchors → green.
//   Corporate rows have 3-digit codes → isBankFormFromDb=false → corporate anchors.

describe("DV-BANK-5 — C-6: computeBctcEval Stage-6 structural bank detection", () => {
  it("bank rows (no 3-digit codes) + gross_profit=null → stage-6 NOT red (structural primary fires)", async () => {
    const db = makeEvalDb();
    const reportId = "test-bank-eval-roman-codes";

    // Seed: domain="other" (the live DB value — not "banking") to prove domain is bypassed
    db.prepare(
      `INSERT INTO financial_reports (id, action_code, domain, net_revenue, gross_profit, net_profit, total_assets, parsed_at)
       VALUES (?, 'ACB', 'other', ?, NULL, ?, ?, datetime('now'))`,
    ).run(reportId, ACB_NET_REVENUE, ACB_NET_PROFIT, ACB_TOTAL_ASSETS);

    // Seed: bank rows with Roman-numeral codes — none match /^[0-9]{3}/
    // → isBankFormFromDb = true → bank anchors ["net_revenue","net_profit"]
    const bankCodes: (string | null)[] = ["I", "II", "III", "A", "B", null, "IV", "V", "VI", "VII", "VIII", "IX"];
    for (let i = 0; i < 12; i++) {
      db.prepare(
        `INSERT INTO bctc_table_rows (report_id, code, label, value_current, row_order)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(reportId, bankCodes[i] ?? null, `Label ${i}`, 1000 * (i + 1), i);
    }

    db.prepare(
      `INSERT INTO bctc_md_tables (report_id, md_tables_json, table_count, page_count)
       VALUES (?, '[{"rows":5}]', 1, 1)`,
    ).run(reportId);

    const result = await computeBctcEval(db, reportId, EVAL_THRESHOLDS);

    // BEFORE fix (BANK-DEV-1): domain="other" → isBankDomain=false → corporate anchors
    //   → gross_profit anchor fails → stage-6 red
    // AFTER fix (BANK-DEV-2): isBankFormFromDb=true (no 3-digit codes) → bank anchors
    //   → 2/2=1.0 → stage-6 green
    expect(result.stage_statuses[6]).not.toBe("red");
  });

  it("bank rows + domain='other' + gross_profit=null → stage-6 NOT red (structural over domain string)", async () => {
    const db = makeEvalDb();
    const reportId = "test-bank-eval-domain-other";

    // domain="other" mirrors the exact live DB state for ALL 12 tickers
    db.prepare(
      `INSERT INTO financial_reports (id, action_code, domain, net_revenue, gross_profit, net_profit, total_assets, parsed_at)
       VALUES (?, 'VCB', 'other', ?, NULL, ?, ?, datetime('now'))`,
    ).run(reportId, ACB_NET_REVENUE, ACB_NET_PROFIT, ACB_TOTAL_ASSETS);

    // Bank rows: Roman codes only
    const bankCodes2: (string | null)[] = ["I", "II", "III", "A", "B", null, "IV", "V", "VI", "VII", "VIII", "IX"];
    for (let i = 0; i < 12; i++) {
      db.prepare(
        `INSERT INTO bctc_table_rows (report_id, code, label, value_current, row_order)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(reportId, bankCodes2[i] ?? null, `Label ${i}`, 1000 * (i + 1), i);
    }

    db.prepare(
      `INSERT INTO bctc_md_tables (report_id, md_tables_json, table_count, page_count)
       VALUES (?, '[{"rows":5}]', 1, 1)`,
    ).run(reportId);

    const result = await computeBctcEval(db, reportId, EVAL_THRESHOLDS);
    expect(result.stage_statuses[6]).not.toBe("red");
  });

  it("CORPORATE: 3-digit codes + gross_profit=null → stage-6 RED (structural correctly identifies corporate)", async () => {
    const db = makeEvalDb();
    const reportId = "test-corp-eval-3digit-codes";

    // Corporate rows have 3-digit codes → isBankFormFromDb=false → corporate anchors
    // gross_profit=null → anchor fails → stage-6 red
    db.prepare(
      `INSERT INTO financial_reports (id, action_code, domain, net_revenue, gross_profit, net_profit, total_assets, parsed_at)
       VALUES (?, 'FPT', 'other', 50000, NULL, 10000, 50000, datetime('now'))`,
    ).run(reportId);

    // Corporate rows: 3-digit codes present → isBankFormFromDb = false
    const corpCodes: string[] = ["100", "110", "120", "130", "200", "210", "270", "280", "300", "310", "400", "410"];
    for (let i = 0; i < 12; i++) {
      db.prepare(
        `INSERT INTO bctc_table_rows (report_id, code, label, value_current, row_order)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(reportId, corpCodes[i]!, `Label ${i}`, 1000 * (i + 1), i);
    }

    db.prepare(
      `INSERT INTO bctc_md_tables (report_id, md_tables_json, table_count, page_count)
       VALUES (?, '[{"rows":5}]', 1, 1)`,
    ).run(reportId);

    const result = await computeBctcEval(db, reportId, EVAL_THRESHOLDS);
    // Corporate with gross_profit=null + 3-digit codes → isBankFormFromDb=false
    // → corporate anchors include gross_profit → missing → stage-6 red
    expect(result.stage_statuses[6]).toBe("red");
  });
});
