/**
 * Task 124 — Integration Tests: SSC Pipeline (Mock HTTP, Real SQLite)
 *
 * Tests the full fetchParseAndStoreBctc pipeline with:
 *   - Mocked HTTP clients (no real network calls)
 *   - Real in-memory SQLite (via initDatabase / closeDb)
 *   - Mocked insertAnalysisFn (no real LanceDB)
 *
 * Covers SSC-01 through SSC-12 test cases from REQ-007 / TECH-007.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { fetchParseAndStoreBctc } from "../application/usecases/fetchParseAndStoreBctc.js";
import { buildSscSearchUrl, parseSscHtml } from "../infrastructure/fetchers/ssc.js";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal BCTC text that satisfies P_NET_REVENUE and P_TOTAL_ASSETS patterns.
 * "Doanh thu thuần" matches P_NET_REVENUE in incomeStatementExtractor.ts
 * "Tổng cộng tài sản" matches P_TOTAL_ASSETS in balanceSheetExtractor.ts
 */
const MINIMAL_BCTC_TEXT = `
CÔNG TY CỔ PHẦN VCB
BÁO CÁO TÀI CHÍNH QUÝ 1/2025

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                    50.000.000
  Tiền và tương đương tiền                            5.000.000
  Hàng tồn kho                                       12.000.000
TỔNG CỘNG TÀI SẢN                                   80.000.000

Nợ phải trả                                         30.000.000
  Vay và nợ thuê tài chính ngắn hạn                   8.000.000
  Vay và nợ thuê tài chính dài hạn                   10.000.000
Vốn chủ sở hữu                                      50.000.000
TỔNG CỘNG NGUỒN VỐN                                 80.000.000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần                                     39.500.000
Giá vốn hàng bán                                    25.000.000
Lợi nhuận gộp                                       14.500.000
Lợi nhuận thuần từ hoạt động kinh doanh              8.500.000
Lợi nhuận trước thuế                                 8.600.000
Thuế TNDN hiện hành                                  1.720.000
Lợi nhuận sau thuế                                   6.880.000

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
Lưu chuyển tiền thuần từ hoạt động đầu tư           (3.000.000)
Lưu chuyển tiền thuần từ hoạt động tài chính         1.000.000
Tiền và tương đương tiền đầu kỳ                      4.000.000
Tiền và tương đương tiền cuối kỳ                     7.880.000
`;

/**
 * Standard mock SSC HTML fixture: one quarterly report row with a relative href.
 * Title contains "quý" so it matches the quarterly filter in parseSscHtml.
 */
const MOCK_SSC_HTML_SINGLE = `
<html><body>
  <table class="tbl-data">
    <tbody>
      <tr>
        <td><a href="/report/VCB-Q1-2025.pdf">BCTC Quý I 2025 - VCB</a></td>
        <td>15/04/2025</td>
      </tr>
    </tbody>
  </table>
</body></html>
`;

/** Resolved URL that the pipeline should produce from the relative href above. */
const EXPECTED_RESOLVED_URL =
  "https://congbothongtin.ssc.gov.vn/report/VCB-Q1-2025.pdf";

/** SSC HTML fixture with two quarterly report rows. */
const MOCK_SSC_HTML_TWO_DOCS = `
<html><body>
  <table class="tbl-data">
    <tbody>
      <tr>
        <td><a href="https://congbothongtin.ssc.gov.vn/report/VCB-Q1-2025-v1.pdf">BCTC Quý I 2025 - VCB (Lần 1)</a></td>
        <td>15/04/2025</td>
      </tr>
      <tr>
        <td><a href="https://congbothongtin.ssc.gov.vn/report/VCB-Q1-2025-v2.pdf">BCTC Quý I 2025 - VCB (Lần 2)</a></td>
        <td>20/04/2025</td>
      </tr>
    </tbody>
  </table>
</body></html>
`;

/** SSC HTML fixture with an annual report row — should NOT match quarterly filter. */
const MOCK_SSC_HTML_ANNUAL_ONLY = `
<html><body>
  <table class="tbl-data">
    <tbody>
      <tr>
        <td><a href="https://congbothongtin.ssc.gov.vn/report/VCB-2025-annual.pdf">Báo cáo tài chính năm 2025 - VCB</a></td>
        <td>10/02/2026</td>
      </tr>
    </tbody>
  </table>
</body></html>
`;

/** Empty table — no reports found. */
const MOCK_SSC_HTML_EMPTY =
  "<html><body><table class='tbl-data'><tbody></tbody></table></body></html>";

/** SSC HTML with a relative href that should be resolved to an absolute URL. */
const MOCK_SSC_HTML_RELATIVE_HREF = `
<html><body>
  <table class="tbl-data">
    <tbody>
      <tr>
        <td><a href="/detail/123.pdf">BCTC Quý I 2025 - HPG</a></td>
        <td>01/05/2025</td>
      </tr>
    </tbody>
  </table>
</body></html>
`;

/** SSC HTML with a malformed row (only one <td> cell). */
const MOCK_SSC_HTML_MALFORMED_ROW = `
<html><body>
  <table class="tbl-data">
    <tbody>
      <tr>
        <td>Only one cell here — no anchor, no date</td>
      </tr>
      <tr>
        <td><a href="/report/VCB-Q1-2025.pdf">BCTC Quý I 2025 - VCB</a></td>
        <td>15/04/2025</td>
      </tr>
    </tbody>
  </table>
</body></html>
`;

// ─────────────────────────────────────────────────────────────────────────────
// Mock factories
// ─────────────────────────────────────────────────────────────────────────────

/** Creates an HttpClient mock that always returns the given HTML string. */
function makeSscClient(html: string): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      return html;
    },
  };
}

/** Creates an HttpClient mock that always rejects with an HTTP error. */
function makeFailingHttpClient(): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("HTTP 503 Service Unavailable");
    },
  };
}

/**
 * Creates a spy for insertAnalysisFn.
 * Records every call so tests can assert call count and arguments.
 */
function makeInsertSpy(): {
  fn: (entry: unknown) => Promise<void>;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    fn: async (entry: unknown): Promise<void> => {
      calls.push(entry);
    },
    calls,
  };
}

/** Creates an insertAnalysisFn that always rejects (simulates LanceDB failure). */
function makeFailingInsertFn(): (entry: unknown) => Promise<void> {
  return async (_entry: unknown): Promise<void> => {
    throw new Error("LanceDB down");
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB setup — shared in-memory SQLite for the whole suite
//
// NOTE: DB_PATH is a module-level constant in schema.ts (resolved once at
// import time). Setting Bun.env["DB_PATH"] in beforeEach has no effect after
// the module is loaded. We use the same pattern as task 048: set the env var
// once before any import (via process.env at module scope is too late here),
// so instead we rely on beforeAll + closeDb to reset the singleton ONCE before
// the suite starts. Tests that need isolation use unique action codes so row-
// count assertions are scoped to that code, not the whole table.
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
  closeDb(); // ensure clean slate before the suite
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 124 — SSC pipeline integration tests (mock HTTP, real SQLite)", () => {
  // ── SSC-01: Happy path — single document found ──────────────────────────────
  it("SSC-01: happy path — returns FinancialReport, inserts DB row, calls insertAnalysisFn once", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    // Pipeline must return a FinancialReport
    expect(report).not.toBeNull();
    expect(report!.actionCode).toBe("VCB");

    // DB row must exist
    const db = getDb();
    const row = db
      .prepare("SELECT id, action_code FROM financial_reports WHERE id = ?")
      .get(report!.id) as { id: string; action_code: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.action_code).toBe("VCB");

    // insertAnalysisFn must have been called exactly once
    expect(insertSpy.calls.length).toBe(1);
  });

  // ── SSC-02: Multiple docs returned — only docs[0] used ─────────────────────
  it("SSC-02: when SSC returns 2 docs, only docs[0] is processed, insertAnalysisFn called once", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_TWO_DOCS),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();
    // The URL on the report should be from the first row
    expect(report!.source.sscUrl).toContain("v1");
    // insertAnalysisFn called exactly once (not twice)
    expect(insertSpy.calls.length).toBe(1);
  });

  // ── SSC-03: No SSC documents found ─────────────────────────────────────────
  it("SSC-03: returns null when SSC HTML has empty tbody; no DB insert, insertAnalysisFn not called", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "UNKNOWN_SSC03",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_EMPTY),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(result).toBeNull();

    // No rows for "UNKNOWN_SSC03" should have been inserted
    const db = getDb();
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = ?",
      )
      .get("UNKNOWN_SSC03") as { cnt: number };
    expect(count.cnt).toBe(0);

    expect(insertSpy.calls.length).toBe(0);
  });

  // ── SSC-04: Empty PDF text ──────────────────────────────────────────────────
  it("SSC-04: returns null when pdfTextOverride is empty string; no DB insert", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "SSC04_VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: "",
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(result).toBeNull();

    const db = getDb();
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = ?",
      )
      .get("SSC04_VCB") as { cnt: number };
    expect(count.cnt).toBe(0);
  });

  // ── SSC-05: Whitespace-only PDF text ───────────────────────────────────────
  it("SSC-05: returns null when pdfTextOverride is whitespace only; no DB insert", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "SSC05_VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: "   \n  \t  ",
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(result).toBeNull();
    expect(insertSpy.calls.length).toBe(0);
  });

  // ── SSC-06: Minimal valid BCTC text ────────────────────────────────────────
  it("SSC-06: minimal text with net revenue + total assets produces valid report with non-empty sortKey", async () => {
    const insertSpy = makeInsertSpy();

    // Only the two key lines — all other fields will be 0
    const minimalText = `
Doanh thu thuần   1.000.000
Tổng cộng tài sản  5.000.000
`;

    const report = await fetchParseAndStoreBctc({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q2",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: minimalText,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();
    expect(report!.period.sortKey).toBe("2025-Q2");
    expect(report!.incomeStatement.netRevenue).toBe(1_000_000);
    expect(report!.balanceSheet.totalAssets).toBe(5_000_000);

    // Row is inserted in DB
    const db = getDb();
    const row = db
      .prepare("SELECT action_code, period_year FROM financial_reports WHERE id = ?")
      .get(report!.id) as { action_code: string; period_year: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.action_code).toBe("HPG");
    expect(row!.period_year).toBe(2025);
  });

  // ── SSC-07: LanceDB insertAnalysisFn throws — SQLite row still persisted ───
  it("SSC-07: LanceDB failure is non-fatal — returns FinancialReport and DB row persists", async () => {
    const report = await fetchParseAndStoreBctc({
      actionCode: "TCB",
      year: 2025,
      quarter: "Q3",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: makeFailingInsertFn() as never,
    });

    // Pipeline must still return the report despite LanceDB failure
    expect(report).not.toBeNull();
    expect(report!.actionCode).toBe("TCB");

    // SQLite row must still be present
    const db = getDb();
    const row = db
      .prepare("SELECT id FROM financial_reports WHERE id = ?")
      .get(report!.id) as { id: string } | undefined;
    expect(row).toBeDefined();
  });

  // ── SSC-08: Duplicate report behavior (INSERT OR REPLACE) ──────────────────
  it("SSC-08: running the pipeline twice for the same report replaces the existing row (UNIQUE action_code + sort_key)", async () => {
    const insertSpy1 = makeInsertSpy();
    const insertSpy2 = makeInsertSpy();

    // Use a unique action code scoped to this test for reliable row counting
    const actionCode = "SSC08_DEDUP";

    // First run
    const report1 = await fetchParseAndStoreBctc({
      actionCode,
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy1.fn as never,
    });

    // Second run — same actionCode/year/quarter
    const report2 = await fetchParseAndStoreBctc({
      actionCode,
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy2.fn as never,
    });

    expect(report1).not.toBeNull();
    expect(report2).not.toBeNull();

    // financial_reports has UNIQUE(action_code, sort_key).
    // INSERT OR REPLACE on the same business key replaces the existing row.
    // So after two runs for the same actionCode + period, only 1 row remains.
    const db = getDb();
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = ?",
      )
      .get(actionCode) as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  // ── SSC-09: reportType filtering — annual title does not match quarterly ────
  it("SSC-09: annual-only SSC HTML is filtered out; pipeline returns null for quarterly request", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_ANNUAL_ONLY),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(result).toBeNull();
    expect(insertSpy.calls.length).toBe(0);
  });

  // ── SSC-10: Relative href resolution ───────────────────────────────────────
  it("SSC-10: relative href in SSC HTML is resolved to absolute SSC base URL", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_RELATIVE_HREF),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();
    // sscUrl should be the resolved absolute URL
    expect(report!.source.sscUrl).toBe(
      "https://congbothongtin.ssc.gov.vn/detail/123.pdf",
    );
  });

  // ── SSC-11: buildSscSearchUrl produces correct query params ────────────────
  it("SSC-11: buildSscSearchUrl produces URL containing keyword=VCB, type=BCTC, year=2025", () => {
    const url = buildSscSearchUrl("VCB", 2025);

    expect(url).toContain("keyword=VCB");
    expect(url).toContain("type=BCTC");
    expect(url).toContain("year=2025");
  });

  // ── SSC-12: Malformed HTML rows (missing <td>) are skipped gracefully ───────
  it("SSC-12: parseSscHtml skips malformed rows with fewer than 2 <td> cells; valid rows still parsed", () => {
    // The malformed-row HTML has one bad row and one valid row
    const docs = parseSscHtml(MOCK_SSC_HTML_MALFORMED_ROW, "quarterly");

    // Only the valid row should survive
    expect(docs.length).toBe(1);
    expect(docs[0]!.title).toContain("VCB");
  });

  // ── Bonus: store verification — all expected columns populated ─────────────
  it("store verification: financial_reports row has correct action_code, sort_key, net_revenue, total_assets", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "MBB",
      year: 2025,
      quarter: "Q4",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();

    const db = getDb();
    const row = db
      .prepare(
        `SELECT action_code, sort_key, net_revenue, total_assets, period_year, period_quarter
         FROM financial_reports WHERE id = ?`,
      )
      .get(report!.id) as {
      action_code: string;
      sort_key: string;
      net_revenue: number;
      total_assets: number;
      period_year: number;
      period_quarter: number;
    } | undefined;

    expect(row).toBeDefined();
    expect(row!.action_code).toBe("MBB");
    expect(row!.sort_key).toBe("2025-Q4");
    expect(row!.net_revenue).toBeGreaterThan(0);
    expect(row!.total_assets).toBeGreaterThan(0);
    expect(row!.period_year).toBe(2025);
    expect(row!.period_quarter).toBe(4);
  });

  // ── Vietnamese text parsing — ratios computed from real BCTC text ──────────
  it("Vietnamese text: gross margin and net margin ratios are computed from full BCTC fixture", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();

    // Gross profit = 14,500,000; net revenue = 39,500,000
    // grossMarginPct ≈ 36.7%
    expect(report!.ratios.grossMarginPct).not.toBeNull();
    expect(report!.ratios.grossMarginPct!).toBeGreaterThan(0);
    expect(report!.ratios.grossMarginPct!).toBeLessThan(100);

    // net profit = 6,880,000; net revenue = 39,500,000
    // netMarginPct ≈ 17.4%
    expect(report!.ratios.netMarginPct).not.toBeNull();
    expect(report!.ratios.netMarginPct!).toBeGreaterThan(0);
    expect(report!.ratios.netMarginPct!).toBeLessThan(100);
  });

  // ── SSC-01 variant: period fields set correctly ─────────────────────────────
  it("period.year, period.quarter, and period.sortKey are set from params", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report!.period.year).toBe(2025);
    expect(report!.period.quarter).toBe(1);
    expect(report!.period.sortKey).toBe("2025-Q1");
  });

  // ── sscUrl patched onto report.source ──────────────────────────────────────
  it("report.source.sscUrl is set to the resolved document URL from SSC portal", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report!.source.sscUrl).toBe(EXPECTED_RESOLVED_URL);
  });

  // ── insertAnalysisFn receives correct entry structure ───────────────────────
  it("insertAnalysisFn receives entry with level='action' and correct actionCode", async () => {
    const insertSpy = makeInsertSpy();

    await fetchParseAndStoreBctc({
      actionCode: "BID",
      year: 2025,
      quarter: "Q2",
      sscHttpClient: makeSscClient(MOCK_SSC_HTML_SINGLE),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(insertSpy.calls.length).toBe(1);
    const entry = insertSpy.calls[0] as Record<string, unknown>;
    expect(entry["level"]).toBe("action");
    expect(entry["actionCode"]).toBe("BID");
    expect(typeof entry["id"]).toBe("string");
    expect(typeof entry["title"]).toBe("string");
    expect((entry["title"] as string)).toContain("BID");
  });
});
