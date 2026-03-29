/**
 * Task 124 — Integration Tests: SSC Pipeline (Mock Browser, Real SQLite)
 *
 * Tests the full fetchParseAndStoreBctc pipeline with:
 *   - Mocked BrowserFactory (no real Puppeteer / network calls)
 *   - Real in-memory SQLite (via initDatabase / closeDb)
 *   - Mocked insertAnalysisFn (no real LanceDB)
 *
 * Covers SSC-01 through SSC-12 test cases from REQ-007 / TECH-007.
 *
 * NOTE: sscHttpClient is now BrowserFactory (Puppeteer-based scraper).
 *       HttpClient-based SSC mocks have been replaced with BrowserFactory mocks.
 *       parseSscHtml is deprecated (returns []) — SSC-12 validates this.
 *       buildSscSearchUrl is deprecated but still exported — SSC-11 validates it.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { fetchParseAndStoreBctc } from "../application/usecases/fetchParseAndStoreBctc.js";
import { buildSscSearchUrl, parseSscHtml } from "../infrastructure/fetchers/ssc.js";
import type {
  BrowserFactory,
  SscBrowser,
  SscBrowserPage,
  SscDocument,
} from "../infrastructure/fetchers/ssc.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal BCTC text that satisfies P_NET_REVENUE and P_TOTAL_ASSETS patterns.
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
 * The downloadId used in the default VCB Q1 mock row.
 * listSscDocuments maps downloadId → "ssc-download://<downloadId>" for the url field.
 */
const VCB_Q1_DOWNLOAD_ID = "VCB-Q1-2025-download-link";
const EXPECTED_RESOLVED_URL = `ssc-download://VCB/0/${VCB_Q1_DOWNLOAD_ID}`;

// ─────────────────────────────────────────────────────────────────────────────
// BrowserFactory mock helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Raw row shape that page.evaluate() returns in the real scraper. */
interface RawSscRow {
  code: string;
  exchange: string;
  title: string;
  company: string;
  description: string;
  date: string;
  downloadId: string;
}

/**
 * Creates a BrowserFactory mock whose page.evaluate() returns the given rows.
 * Rows are filtered by stock code (matches real Puppeteer scraper behaviour).
 */
function makeBrowserFactory(rows: RawSscRow[]): BrowserFactory {
  return async (): Promise<SscBrowser> => {
    const page: SscBrowserPage = {
      async goto() { return null; },
      async waitForSelector() { return null; },
      async click() {},
      async type() {},
      async evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
        const targetCode = args[0] as string | undefined;
        if (targetCode !== undefined) {
          const filtered = rows.filter((r) => r.code === targetCode);
          return filtered as unknown as T;
        }
        return undefined as unknown as T;
      },
      keyboard: { async press(_key: string) {} },
      on(_event: string, _handler: (...args: unknown[]) => void) {},
      async close() {},
    };
    return {
      async newPage() { return page; },
      async close() {},
    };
  };
}

/** A BrowserFactory that always throws (simulates network/browser failure). */
function makeFailingBrowserFactory(): BrowserFactory {
  return async (): Promise<SscBrowser> => {
    throw new Error("HTTP 503 Service Unavailable");
  };
}

// Pre-built row fixtures corresponding to original HTML fixtures.

/** Single quarterly row for VCB Q1 2025 */
const ROW_VCB_Q1_SINGLE: RawSscRow = {
  code: "VCB",
  exchange: "HOSE",
  title: "BCTC Quý I 2025 - VCB",
  company: "Vietcombank",
  description: "BCTC quý I",
  date: "15/04/2025",
  // downloadId is mapped to "ssc-download://<downloadId>" by listSscDocuments
  downloadId: VCB_Q1_DOWNLOAD_ID,
};

/** Two quarterly rows for VCB Q1 2025 (v1 + v2) */
const ROW_VCB_Q1_V1: RawSscRow = {
  code: "VCB",
  exchange: "HOSE",
  title: "BCTC Quý I 2025 - VCB (Lần 1)",
  company: "Vietcombank",
  description: "BCTC quý I lần 1",
  date: "15/04/2025",
  downloadId: "VCB-Q1-2025-v1-link",
};

const ROW_VCB_Q1_V2: RawSscRow = {
  code: "VCB",
  exchange: "HOSE",
  title: "BCTC Quý I 2025 - VCB (Lần 2)",
  company: "Vietcombank",
  description: "BCTC quý I lần 2",
  date: "20/04/2025",
  downloadId: "VCB-Q1-2025-v2-link",
};

/** Annual row only — should be filtered out for quarterly requests */
const ROW_VCB_ANNUAL: RawSscRow = {
  code: "VCB",
  exchange: "HOSE",
  title: "Báo cáo tài chính năm 2025 - VCB",
  company: "Vietcombank",
  description: "BCTC năm 2025",
  date: "10/02/2026",
  downloadId: "VCB-2025-annual-link",
};

/** HPG Q1 row */
const ROW_HPG_Q1: RawSscRow = {
  code: "HPG",
  exchange: "HOSE",
  title: "BCTC Quý I 2025 - HPG",
  company: "Hoa Phat Group",
  description: "BCTC quý I",
  date: "01/05/2025",
  downloadId: "HPG-Q1-2025-link",
};

// ─────────────────────────────────────────────────────────────────────────────
// Insert spy helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function makeFailingInsertFn(): (entry: unknown) => Promise<void> {
  return async (_entry: unknown): Promise<void> => {
    throw new Error("LanceDB down");
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-test timeout in ms.
 * listSscDocuments has ~5.8 s of hardcoded setTimeout delays (500 + 300 + 5000 ms)
 * for the ADF form interaction, even when a mock browser is used.
 */
const TEST_TIMEOUT = 15_000;

describe("Task 124 — SSC pipeline integration tests (mock browser, real SQLite)", () => {
  // ── SSC-01: Happy path — single document found ──────────────────────────────
  it("SSC-01: happy path — returns FinancialReport, inserts DB row, calls insertAnalysisFn once", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([ROW_VCB_Q1_SINGLE]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();
    expect(report!.actionCode).toBe("VCB");

    const db = getDb();
    const row = db
      .prepare("SELECT id, action_code FROM financial_reports WHERE id = ?")
      .get(report!.id) as { id: string; action_code: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.action_code).toBe("VCB");

    expect(insertSpy.calls.length).toBe(1);
  }, TEST_TIMEOUT);

  // ── SSC-02: Multiple docs returned — only docs[0] used ─────────────────────
  it("SSC-02: when SSC returns 2 docs, only docs[0] is processed, insertAnalysisFn called once", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([ROW_VCB_Q1_V1, ROW_VCB_Q1_V2]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();
    // sscUrl is "ssc-download://<downloadId>" — first doc's downloadId contains "v1"
    expect(report!.source.sscUrl).toContain("v1");
    expect(insertSpy.calls.length).toBe(1);
  }, TEST_TIMEOUT);

  // ── SSC-03: No SSC documents found ─────────────────────────────────────────
  it("SSC-03: returns null when SSC returns no rows; no DB insert, insertAnalysisFn not called", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "UNKNOWN_SSC03",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([]), // empty — no rows
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(result).toBeNull();

    const db = getDb();
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = ?",
      )
      .get("UNKNOWN_SSC03") as { cnt: number };
    expect(count.cnt).toBe(0);

    expect(insertSpy.calls.length).toBe(0);
  }, TEST_TIMEOUT);

  // ── SSC-04: Empty PDF text ──────────────────────────────────────────────────
  it("SSC-04: returns null when pdfTextOverride is empty string; no DB insert", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "SSC04_VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([{ ...ROW_VCB_Q1_SINGLE, code: "SSC04_VCB" }]),
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
  }, TEST_TIMEOUT);

  // ── SSC-05: Whitespace-only PDF text ───────────────────────────────────────
  it("SSC-05: returns null when pdfTextOverride is whitespace only; no DB insert", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "SSC05_VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([{ ...ROW_VCB_Q1_SINGLE, code: "SSC05_VCB" }]),
      pdfTextOverride: "   \n  \t  ",
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(result).toBeNull();
    expect(insertSpy.calls.length).toBe(0);
  }, TEST_TIMEOUT);

  // ── SSC-06: Minimal valid BCTC text ────────────────────────────────────────
  it("SSC-06: minimal text with net revenue + total assets produces valid report with non-empty sortKey", async () => {
    const insertSpy = makeInsertSpy();

    const minimalText = `
Doanh thu thuần   1.000.000
Tổng cộng tài sản  5.000.000
`;

    const report = await fetchParseAndStoreBctc({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q2",
      sscHttpClient: makeBrowserFactory([{ ...ROW_HPG_Q1, code: "HPG" }]),
      pdfTextOverride: minimalText,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();
    expect(report!.period.sortKey).toBe("2025-Q2");
    expect(report!.incomeStatement.netRevenue).toBe(1_000_000);
    expect(report!.balanceSheet.totalAssets).toBe(5_000_000);

    const db = getDb();
    const row = db
      .prepare("SELECT action_code, period_year FROM financial_reports WHERE id = ?")
      .get(report!.id) as { action_code: string; period_year: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.action_code).toBe("HPG");
    expect(row!.period_year).toBe(2025);
  }, TEST_TIMEOUT);

  // ── SSC-07: LanceDB insertAnalysisFn throws — SQLite row still persisted ───
  it("SSC-07: LanceDB failure is non-fatal — returns FinancialReport and DB row persists", async () => {
    const report = await fetchParseAndStoreBctc({
      actionCode: "TCB",
      year: 2025,
      quarter: "Q3",
      sscHttpClient: makeBrowserFactory([{ ...ROW_VCB_Q1_SINGLE, code: "TCB" }]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: makeFailingInsertFn() as never,
    });

    expect(report).not.toBeNull();
    expect(report!.actionCode).toBe("TCB");

    const db = getDb();
    const row = db
      .prepare("SELECT id FROM financial_reports WHERE id = ?")
      .get(report!.id) as { id: string } | undefined;
    expect(row).toBeDefined();
  }, TEST_TIMEOUT);

  // ── SSC-08: Duplicate report behavior (INSERT OR REPLACE) ──────────────────
  it("SSC-08: running the pipeline twice for the same report replaces the existing row", async () => {
    const insertSpy1 = makeInsertSpy();
    const insertSpy2 = makeInsertSpy();

    const actionCode = "SSC08_DEDUP";
    const row: RawSscRow = { ...ROW_VCB_Q1_SINGLE, code: actionCode };

    const report1 = await fetchParseAndStoreBctc({
      actionCode,
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([row]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy1.fn as never,
    });

    const report2 = await fetchParseAndStoreBctc({
      actionCode,
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([row]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy2.fn as never,
    });

    expect(report1).not.toBeNull();
    expect(report2).not.toBeNull();

    const db = getDb();
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = ?",
      )
      .get(actionCode) as { cnt: number };
    expect(count.cnt).toBe(1);
  }, TEST_TIMEOUT);

  // ── SSC-09: reportType filtering — annual title does not match quarterly ────
  it("SSC-09: annual-only rows are filtered out; pipeline returns null for quarterly request", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([ROW_VCB_ANNUAL]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(result).toBeNull();
    expect(insertSpy.calls.length).toBe(0);
  }, TEST_TIMEOUT);

  // ── SSC-10: URL from SSC mock passed through correctly ─────────────────────
  it("SSC-10: URL from BrowserFactory rows is passed through to report.source.sscUrl", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([ROW_HPG_Q1]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();
    // listSscDocuments maps downloadId → "ssc-download://<downloadId>"
    expect(report!.source.sscUrl).toContain("HPG-Q1-2025-link");
  }, TEST_TIMEOUT);

  // ── SSC-11: buildSscSearchUrl still exported (deprecated) ──────────────────
  it("SSC-11: buildSscSearchUrl (deprecated) still produces a URL containing the action code", () => {
    const url = buildSscSearchUrl("VCB", 2025);

    // Still contains the action code keyword
    expect(url).toContain("VCB");
    // Is a string
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  // ── SSC-12: parseSscHtml is deprecated and returns [] ───────────────────────
  it("SSC-12: parseSscHtml (deprecated) returns an empty array — portal is now ADF-driven", () => {
    const html = `
<html><body>
  <table class="tbl-data">
    <tbody>
      <tr>
        <td><a href="/report/VCB-Q1-2025.pdf">BCTC Quý I 2025 - VCB</a></td>
        <td>15/04/2025</td>
      </tr>
    </tbody>
  </table>
</body></html>`;

    const docs = parseSscHtml(html, "quarterly");
    expect(docs).toBeArray();
    expect(docs.length).toBe(0);
  }, TEST_TIMEOUT);

  // ── Bonus: store verification — all expected columns populated ─────────────
  it("store verification: financial_reports row has correct action_code, sort_key, net_revenue, total_assets", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "MBB",
      year: 2025,
      quarter: "Q4",
      sscHttpClient: makeBrowserFactory([{ ...ROW_VCB_Q1_SINGLE, code: "MBB" }]),
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
  }, TEST_TIMEOUT);

  // ── Vietnamese text parsing — ratios computed from real BCTC text ──────────
  it("Vietnamese text: gross margin and net margin ratios are computed from full BCTC fixture", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([ROW_VCB_Q1_SINGLE]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report).not.toBeNull();

    expect(report!.ratios.grossMarginPct).not.toBeNull();
    expect(report!.ratios.grossMarginPct!).toBeGreaterThan(0);
    expect(report!.ratios.grossMarginPct!).toBeLessThan(100);

    expect(report!.ratios.netMarginPct).not.toBeNull();
    expect(report!.ratios.netMarginPct!).toBeGreaterThan(0);
    expect(report!.ratios.netMarginPct!).toBeLessThan(100);
  }, TEST_TIMEOUT);

  // ── SSC-01 variant: period fields set correctly ─────────────────────────────
  it("period.year, period.quarter, and period.sortKey are set from params", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([ROW_VCB_Q1_SINGLE]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report!.period.year).toBe(2025);
    expect(report!.period.quarter).toBe(1);
    expect(report!.period.sortKey).toBe("2025-Q1");
  }, TEST_TIMEOUT);

  // ── sscUrl patched onto report.source ──────────────────────────────────────
  it("report.source.sscUrl is set to the resolved document URL from SSC portal", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([ROW_VCB_Q1_SINGLE]),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn as never,
    });

    expect(report!.source.sscUrl).toBe(EXPECTED_RESOLVED_URL);
  }, TEST_TIMEOUT);

  // ── insertAnalysisFn receives correct entry structure ───────────────────────
  it("insertAnalysisFn receives entry with level='action' and correct actionCode", async () => {
    const insertSpy = makeInsertSpy();

    await fetchParseAndStoreBctc({
      actionCode: "BID",
      year: 2025,
      quarter: "Q2",
      sscHttpClient: makeBrowserFactory([{ ...ROW_VCB_Q1_SINGLE, code: "BID" }]),
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
  }, TEST_TIMEOUT);
});
