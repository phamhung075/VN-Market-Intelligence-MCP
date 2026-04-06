/**
 * Task 048 / 304 — SSC Fetch → Parse → Store Pipeline (HttpClient rewrite)
 *
 * Tests fetchParseAndStoreBctc which orchestrates:
 *   listSscDocuments → downloadAndExtractPdf → parseBctcReport → insertAnalysis
 *
 * External dependencies (SSC HTTP, PDF HTTP, LanceDB) are mocked. The Puppeteer
 * BrowserFactory harness has been removed — the SSC fetcher now uses an
 * HttpClient returning HTML. Most tests use the pdfUrl bypass (task 289) so
 * SSC listing is skipped entirely.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";

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

const VCB_PDF_URL = "https://congbothongtin.ssc.gov.vn/bctc/vcb-q1-2025.pdf";
const FAKE_PDF_BINARY = Buffer.from("FAKE_PDF_CONTENT").toString("binary");

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Builds an HttpClient returning the minimal .tbl-data HTML for SSC listing. */
function makeMockSscHttpClient(
  rows: { title: string; href: string; date: string }[],
): HttpClient {
  const trs = rows
    .map(
      (r) =>
        `<tr><td><a href="${r.href}">${r.title}</a></td><td>${r.date}</td></tr>`,
    )
    .join("");
  const html = `<html><body><table class="tbl-data"><tbody>${trs}</tbody></table></body></html>`;
  return {
    async get(_url: string): Promise<string> {
      return html;
    },
  };
}

/** HttpClient returning raw fake PDF binary for pdf extraction path. */
function makeMockPdfHttpClient(): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      return FAKE_PDF_BINARY;
    },
  };
}

/** Recording insertAnalysis mock. */
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

describe("Task 048 / 304 — SSC fetch → parse → store pipeline", () => {
  it("returns a FinancialReport for VCB Q1 2025 via pdfUrl bypass", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_PDF_URL,
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report).not.toBeNull();
    expect(report).toBeDefined();
  });

  it("sets actionCode correctly on the returned report", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_PDF_URL,
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report!.actionCode).toBe("VCB");
  });

  it("returns a report with ratios computed (grossMarginPct is a number)", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_PDF_URL,
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(typeof report!.ratios.grossMarginPct).toBe("number");
  });

  it("persists the report in the financial_reports SQLite table", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "TCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/tcb-q1-2025.pdf",
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

  it("calls insertAnalysis exactly once so the entry lands in LanceDB", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    await fetchParseAndStoreBctc({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q1",
      pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/hpg-q1-2025.pdf",
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(mockInsert.calls.length).toBe(1);
  });

  it("passes correct actionCode and level='action' to insertAnalysis", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    await fetchParseAndStoreBctc({
      actionCode: "MBB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/mbb-q1-2025.pdf",
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    const entry = mockInsert.calls[0] as Record<string, unknown>;
    expect(entry.actionCode).toBe("MBB");
    expect(entry.level).toBe("action");
  });

  it("returns null when SSC listing finds no documents (no pdfUrl)", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    const result = await fetchParseAndStoreBctc({
      actionCode: "UNKNOWN",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient([]), // empty table
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result).toBeNull();
    expect(mockInsert.calls.length).toBe(0);
  });

  it("returns null gracefully when PDF extraction yields empty text", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    const result = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_PDF_URL,
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: "",
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result).toBeNull();
  });

  it("sets sscUrl to the pdfUrl that was passed in", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_PDF_URL,
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report!.source.sscUrl).toBe(VCB_PDF_URL);
  });

  it("sets period.year, period.quarter, and sortKey from params", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );
    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_PDF_URL,
      pdfHttpClient: makeMockPdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report!.period.year).toBe(2025);
    expect(report!.period.quarter).toBe(1);
    expect(report!.period.sortKey).toBe("2025-Q1");
  });
});
