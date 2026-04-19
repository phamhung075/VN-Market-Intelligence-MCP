/**
 * Task 289 — fetchParseAndStoreBctc: optional pdfUrl param bypasses Step 1
 *
 * FR-4: When params.pdfUrl is non-empty, the use case must:
 *   - Skip listSscDocuments entirely (no SSC network call)
 *   - Use pdfUrl as the document URL
 *   - Still run all remaining steps (PDF extraction, parse, store)
 *
 * When params.pdfUrl is absent, the full pipeline runs as before (Step 1 → ...).
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const MINIMAL_BCTC_TEXT = `
CÔNG TY CỔ PHẦN FPT
BÁO CÁO TÀI CHÍNH QUÝ 2/2025

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

const DIRECT_PDF_URL = "https://congbothongtin.ssc.gov.vn/direct/fpt-q2-2025.pdf";
const FAKE_DOC_URL = "https://congbothongtin.ssc.gov.vn/faces/document/fpt-q2-2025.pdf";

function buildFakeSscHtml(docUrl: string): string {
  return `
    <html><body>
      <table class="tbl-data">
        <tbody>
          <tr>
            <td><a href="${docUrl}">Báo cáo tài chính quý 2 năm 2025 - FPT</a></td>
            <td>15/07/2025</td>
          </tr>
        </tbody>
      </table>
    </body></html>
  `;
}

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
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 289 — pdfUrl bypass (FR-4)", () => {
  // ── 1. When pdfUrl is provided, listSscDocuments is NOT called ──────────────
  it("skips SSC listing when pdfUrl is provided (sscHttpClient is never called)", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    let sscCalled = false;
    const spySscClient = {
      async get(_url: string): Promise<string> {
        sscCalled = true;
        return buildFakeSscHtml(FAKE_DOC_URL);
      },
    };

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "FPT",
      year: 2025,
      quarter: "Q2",
      pdfUrl: DIRECT_PDF_URL,
      sscHttpClient: spySscClient,
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(sscCalled).toBe(false);
    expect(report).not.toBeNull();
  });

  // ── 2. pdfUrl is used as the sscUrl on the returned report ─────────────────
  it("sets report.source.sscUrl to the provided pdfUrl", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "FPT",
      year: 2025,
      quarter: "Q2",
      pdfUrl: DIRECT_PDF_URL,
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report).not.toBeNull();
    expect(report!.source.sscUrl).toBe(DIRECT_PDF_URL);
  });

  // ── 3. When pdfUrl is absent, listSscDocuments IS called ───────────────────
  it("calls listSscDocuments (SSC HTTP) when pdfUrl is not provided", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    let sscCalled = false;
    const spySscClient = {
      async get(_url: string): Promise<string> {
        sscCalled = true;
        return buildFakeSscHtml(FAKE_DOC_URL);
      },
    };

    const mockInsert = makeMockInsertAnalysis();

    await fetchParseAndStoreBctc({
      actionCode: "FPT",
      year: 2025,
      quarter: "Q2",
      sscHttpClient: spySscClient,
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(sscCalled).toBe(true);
  });

  // ── 4. pdfTextOverride still takes priority over pdfUrl (Step 2 unchanged) ─
  it("uses pdfTextOverride text even when pdfUrl is also provided", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    // pdfTextOverride with VNM data while pdfUrl points elsewhere
    const overrideText = MINIMAL_BCTC_TEXT.replace("FPT", "VNM");

    const report = await fetchParseAndStoreBctc({
      actionCode: "VNM",
      year: 2025,
      quarter: "Q2",
      pdfUrl: DIRECT_PDF_URL,
      pdfTextOverride: overrideText,
      insertAnalysisFn: mockInsert.fn,
    });

    // Pipeline should succeed using pdfTextOverride
    expect(report).not.toBeNull();
    expect(report!.actionCode).toBe("VNM");
  });

  // ── 5. pdfUrl with empty sscHttpClient: pipeline succeeds without SSC ──────
  it("returns a FinancialReport without any sscHttpClient when pdfUrl is provided", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "FPT",
      year: 2025,
      quarter: "Q2",
      pdfUrl: DIRECT_PDF_URL,
      // No sscHttpClient at all — must not throw
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report).not.toBeNull();
    expect(report!.period.year).toBe(2025);
    expect(report!.period.quarter).toBe(2);
  });
});
