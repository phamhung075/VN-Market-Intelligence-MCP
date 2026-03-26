/**
 * Task 048 — SSC Fetch → Parse → Store Pipeline
 *
 * Tests the fetchParseAndStoreBctc use case which orchestrates:
 *   listSscDocuments → downloadAndExtractPdf → parseBctcReport → insertAnalysis
 *
 * All external dependencies (SSC HTTP, PDF HTTP, LanceDB) are mocked so no
 * real network or filesystem access is needed.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

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

/** Fake SSC HTML page with one quarterly document link */
function buildFakeSscHtml(docUrl: string): string {
  return `
    <html><body>
      <table class="tbl-data">
        <tbody>
          <tr>
            <td><a href="${docUrl}">Báo cáo tài chính quý 1 năm 2025 - VCB</a></td>
            <td>15/04/2025</td>
          </tr>
        </tbody>
      </table>
    </body></html>
  `;
}

const FAKE_DOC_URL = "https://congbothongtin.ssc.gov.vn/faces/document/vcb-q1-2025.pdf";

/** Fake PDF binary string (treated as binary by downloadAndExtractPdf) */
const FAKE_PDF_BINARY = Buffer.from("FAKE_PDF_CONTENT").toString("binary");

// ─────────────────────────────────────────────────────────────────────────────
// Mock factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a mock HttpClient for SSC HTML requests.
 * Returns fake SSC HTML on any GET so listSscDocuments can parse it.
 */
function makeMockSscHttpClient(): { get: (url: string) => Promise<string> } {
  return {
    async get(_url: string): Promise<string> {
      return buildFakeSscHtml(FAKE_DOC_URL);
    },
  };
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

describe("Task 048 — SSC fetch → parse → store pipeline", () => {
  // ── 1. Happy path: full pipeline returns a FinancialReport ─────────────────
  it("returns a FinancialReport for VCB Q1 2025 with mocked SSC + PDF", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report).not.toBeNull();
    expect(report).toBeDefined();
  });

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
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report!.actionCode).toBe("VCB");
  });

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
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(typeof report!.ratios.grossMarginPct).toBe("number");
  });

  // ── 4. Report is stored in SQLite ─────────────────────────────────────────
  it("persists the report in the financial_reports SQLite table", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "TCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient(),
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
  });

  // ── 5. insertAnalysis is called once (LanceDB) ─────────────────────────────
  it("calls insertAnalysis exactly once so the entry lands in LanceDB", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    await fetchParseAndStoreBctc({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(mockInsert.calls.length).toBe(1);
  });

  // ── 6. insertAnalysis receives correct actionCode and level ────────────────
  it("passes correct actionCode and level='action' to insertAnalysis", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    await fetchParseAndStoreBctc({
      actionCode: "MBB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    const entry = mockInsert.calls[0] as Record<string, unknown>;
    expect(entry.actionCode).toBe("MBB");
    expect(entry.level).toBe("action");
  });

  // ── 7. Returns null when no SSC documents found ───────────────────────────
  it("returns null gracefully when listSscDocuments returns no documents", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const emptyHtmlClient = {
      async get(_url: string): Promise<string> {
        // Return HTML with no matching rows
        return "<html><body><table class='tbl-data'><tbody></tbody></table></body></html>";
      },
    };

    const mockInsert = makeMockInsertAnalysis();

    const result = await fetchParseAndStoreBctc({
      actionCode: "UNKNOWN",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: emptyHtmlClient,
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result).toBeNull();
    // insertAnalysis must NOT have been called
    expect(mockInsert.calls.length).toBe(0);
  });

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
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      // Override with empty string to simulate PDF extraction failure
      pdfTextOverride: "",
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result).toBeNull();
  });

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
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report!.source.sscUrl).toBe(FAKE_DOC_URL);
  });

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
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report!.period.year).toBe(2025);
    // FiscalPeriod.quarter is a number (1|2|3|4|null) per the schema
    expect(report!.period.quarter).toBe(1);
    expect(report!.period.sortKey).toBe("2025-Q1");
  });
});
