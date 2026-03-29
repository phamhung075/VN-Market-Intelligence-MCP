/**
 * Task 048 — SSC Fetch → Parse → Store Pipeline
 *
 * Tests the fetchParseAndStoreBctc use case which orchestrates:
 *   listSscDocuments → downloadAndExtractPdf → parseBctcReport → insertAnalysis
 *
 * All external dependencies (SSC browser, PDF HTTP, LanceDB) are mocked so no
 * real network or filesystem access is needed.
 *
 * NOTE: sscHttpClient is now BrowserFactory (Puppeteer-based scraper).
 *       The old HttpClient-based SSC mock has been replaced with a BrowserFactory mock.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type {
  BrowserFactory,
  SscBrowser,
  SscBrowserPage,
} from "../infrastructure/fetchers/ssc.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal BCTC text — enough for extractors to find something non-zero */
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
 * The downloadId used in the default VCB mock row.
 * listSscDocuments maps downloadId → "ssc-adf://<downloadId>" for the url field.
 */
const VCB_DOWNLOAD_ID = "vcb-q1-2025-download-link";
const FAKE_DOC_URL = `ssc-download://${VCB_DOWNLOAD_ID}`;

/** Fake PDF binary string (treated as binary by downloadAndExtractPdf) */
const FAKE_PDF_BINARY = Buffer.from("FAKE_PDF_CONTENT").toString("binary");

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
 * Creates a BrowserFactory mock whose page.evaluate() returns the given rows,
 * filtered by stock code (mirrors real Puppeteer scraper behaviour).
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

/** Default row for VCB quarterly requests */
const DEFAULT_VCB_ROW: RawSscRow = {
  code: "VCB",
  exchange: "HOSE",
  title: "Báo cáo tài chính quý 1 năm 2025 - VCB",
  company: "Vietcombank",
  description: "BCTC quý 1",
  date: "15/04/2025",
  downloadId: VCB_DOWNLOAD_ID,
};

/**
 * Returns a mock BrowserFactory for SSC requests.
 * Returns a single quarterly document for VCB.
 */
function makeMockSscBrowserFactory(): BrowserFactory {
  return makeBrowserFactory([DEFAULT_VCB_ROW]);
}

/**
 * Returns a mock HttpClient for PDF binary requests.
 * Returns FAKE_PDF_BINARY on any GET so downloadAndExtractPdf can buffer it.
 */
function makeMockPdfHttpClient(): { get: (url: string) => Promise<string> } {
  return {
    async get(_url: string): Promise<string> {
      return FAKE_PDF_BINARY;
    },
  };
}

/**
 * Returns a mock insertAnalysis function that records calls.
 */
function makeMockInsertAnalysis(): {
  fn: (entry: unknown) => Promise<void>;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    fn: async (entry: unknown) => {
      calls.push(entry);
    },
    calls,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Database setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
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

describe("Task 048 — SSC fetch → parse → store pipeline", () => {
  // ── 1. Happy path: full pipeline returns a FinancialReport ─────────────────
  it("returns a FinancialReport for VCB Q1 2025 with mocked SSC browser + PDF", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscBrowserFactory(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report).not.toBeNull();
    expect(report).toBeDefined();
  }, TEST_TIMEOUT);

  // ── 2. actionCode is set correctly on the returned report ──────────────────
  it("sets actionCode correctly on the returned report", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscBrowserFactory(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report!.actionCode).toBe("VCB");
  }, TEST_TIMEOUT);

  // ── 3. Ratios are computed on the returned report ──────────────────────────
  it("returns a report with ratios computed (grossMarginPct is a number)", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscBrowserFactory(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(typeof report!.ratios.grossMarginPct).toBe("number");
  }, TEST_TIMEOUT);

  // ── 4. Report is stored in SQLite ─────────────────────────────────────────
  it("persists the report in the financial_reports SQLite table", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const tcbRow: RawSscRow = { ...DEFAULT_VCB_ROW, code: "TCB" };

    const report = await fetchParseAndStoreBctc({
      actionCode: "TCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([tcbRow]),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    const db = getDb();
    const row = db
      .prepare("SELECT id, action_code FROM financial_reports WHERE id = ?")
      .get(report!.id) as { id: string; action_code: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.action_code).toBe("TCB");
  }, TEST_TIMEOUT);

  // ── 5. insertAnalysis is called once (LanceDB) ─────────────────────────────
  it("calls insertAnalysis exactly once so the entry lands in LanceDB", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const hpgRow: RawSscRow = {
      ...DEFAULT_VCB_ROW,
      code: "HPG",
      title: "Báo cáo tài chính quý 1 năm 2025 - HPG",
    };

    await fetchParseAndStoreBctc({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([hpgRow]),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(mockInsert.calls.length).toBe(1);
  }, TEST_TIMEOUT);

  // ── 6. insertAnalysis receives correct actionCode and level ────────────────
  it("passes correct actionCode and level='action' to insertAnalysis", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const mbbRow: RawSscRow = {
      ...DEFAULT_VCB_ROW,
      code: "MBB",
      title: "Báo cáo tài chính quý 1 năm 2025 - MBB",
    };

    await fetchParseAndStoreBctc({
      actionCode: "MBB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([mbbRow]),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    const entry = mockInsert.calls[0] as Record<string, unknown>;
    expect(entry.actionCode).toBe("MBB");
    expect(entry.level).toBe("action");
  }, TEST_TIMEOUT);

  // ── 7. Returns null when no SSC documents found ───────────────────────────
  it("returns null gracefully when listSscDocuments returns no documents", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const result = await fetchParseAndStoreBctc({
      actionCode: "UNKNOWN",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeBrowserFactory([]), // empty — no rows
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result).toBeNull();
    expect(mockInsert.calls.length).toBe(0);
  }, TEST_TIMEOUT);

  // ── 8. Returns null gracefully when PDF extraction yields no text ──────────
  it("returns null gracefully when PDF extraction fails (empty text)", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const result = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscBrowserFactory(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: "",
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result).toBeNull();
  }, TEST_TIMEOUT);

  // ── 9. sscUrl is set on the returned report's source ─────────────────────
  it("sets sscUrl to the document URL found on SSC portal", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscBrowserFactory(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report!.source.sscUrl).toBe(FAKE_DOC_URL);
  }, TEST_TIMEOUT);

  // ── 10. period.year and period.quarter match the params ────────────────────
  it("sets period.year and period.quarter from params", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscBrowserFactory(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report!.period.year).toBe(2025);
    expect(report!.period.quarter).toBe(1);
    expect(report!.period.sortKey).toBe("2025-Q1");
  }, TEST_TIMEOUT);
});
