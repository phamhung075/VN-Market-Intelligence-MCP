/**
 * Task 124 / 305 — SSC Pipeline Integration Tests (HttpClient rewrite)
 *
 * Tests the full fetchParseAndStoreBctc pipeline with:
 *   - Mocked HttpClient (SSC listing + PDF download) — no Puppeteer
 *   - Real in-memory SQLite (via initDatabase / closeDb)
 *   - Mocked insertAnalysisFn (no real LanceDB)
 *
 * Covers SSC-01 through SSC-12 from REQ-007 / TECH-007. Most cases use the
 * task 289 pdfUrl bypass to skip SSC listing entirely; cases SSC-03 and
 * SSC-09 still exercise the HTML listing path so the filter + no-rows
 * branches stay covered.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { fetchParseAndStoreBctc } from "../application/usecases/fetchParseAndStoreBctc.js";
import {
  buildSscSearchUrl,
  parseSscHtml,
  type HttpClient,
} from "../infrastructure/fetchers/ssc.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

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

const VCB_Q1_URL =
  "https://congbothongtin.ssc.gov.vn/bctc/VCB-Q1-2025-download-link.pdf";

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SscRow {
  title: string;
  href: string;
  date: string;
}

function buildSscHtml(rows: SscRow[]): string {
  const trs = rows
    .map(
      (r) =>
        `<tr><td><a href="${r.href}">${r.title}</a></td><td>${r.date}</td></tr>`,
    )
    .join("");
  return `<html><body><table class="tbl-data"><tbody>${trs}</tbody></table></body></html>`;
}

function makeSscHttpClient(rows: SscRow[]): HttpClient {
  const html = buildSscHtml(rows);
  return { async get(): Promise<string> { return html; } };
}

function makePdfHttpClient(): HttpClient {
  return {
    async get(): Promise<string> {
      return Buffer.from("FAKE_PDF_CONTENT").toString("binary");
    },
  };
}

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
  return async (): Promise<void> => {
    throw new Error("LanceDB down");
  };
}

// Fixture rows for HTML-listing paths.
const ROW_VCB_Q1: SscRow = {
  title: "BCTC Quý I 2025 - VCB",
  href: VCB_Q1_URL,
  date: "15/04/2025",
};

const ROW_VCB_ANNUAL: SscRow = {
  title: "Báo cáo tài chính năm 2025 - VCB",
  href: "https://congbothongtin.ssc.gov.vn/bctc/vcb-annual-2025.pdf",
  date: "10/02/2026",
};

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

describe("Task 124 / 305 — SSC pipeline integration tests", () => {
  it("SSC-01: happy path — returns FinancialReport, inserts DB row, calls insertAnalysisFn once", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_Q1_URL,
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn,
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
  });

  it("SSC-02: HTML listing with 2 quarterly rows — only docs[0] is processed", async () => {
    // Exercise the SSC listing path (no pdfUrl bypass) with two rows.
    const insertSpy = makeInsertSpy();

    const v1: SscRow = {
      title: "BCTC Quý I 2025 - VCB (Lần 1)",
      href: "https://congbothongtin.ssc.gov.vn/bctc/vcb-q1-v1.pdf",
      date: "15/04/2025",
    };
    const v2: SscRow = {
      title: "BCTC Quý I 2025 - VCB (Lần 2)",
      href: "https://congbothongtin.ssc.gov.vn/bctc/vcb-q1-v2.pdf",
      date: "20/04/2025",
    };

    const report = await fetchParseAndStoreBctc({
      actionCode: "SSC02_VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscHttpClient([v1, v2]),
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn,
    });

    expect(report).not.toBeNull();
    // docs[0] is the first row in the HTML → v1.href
    expect(report!.source.sscUrl).toContain("vcb-q1-v1");
    expect(insertSpy.calls.length).toBe(1);
  });

  it("SSC-03: returns null when SSC HTML listing has no rows", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "UNKNOWN_SSC03",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscHttpClient([]),
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn,
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
  });

  it("SSC-04: returns null when pdfTextOverride is empty", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "SSC04_VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_Q1_URL,
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: "",
      insertAnalysisFn: insertSpy.fn,
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

  it("SSC-05: returns null when pdfTextOverride is whitespace only", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "SSC05_VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_Q1_URL,
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: "   \n  \t  ",
      insertAnalysisFn: insertSpy.fn,
    });

    expect(result).toBeNull();
    expect(insertSpy.calls.length).toBe(0);
  });

  it("SSC-06: minimal text with net revenue + total assets produces valid report", async () => {
    const insertSpy = makeInsertSpy();

    const minimalText = `
Doanh thu thuần   1.000.000
Tổng cộng tài sản  5.000.000
`;

    const report = await fetchParseAndStoreBctc({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q2",
      pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/hpg-q2-2025.pdf",
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: minimalText,
      insertAnalysisFn: insertSpy.fn,
    });

    expect(report).not.toBeNull();
    expect(report!.period.sortKey).toBe("2025-Q2");
    expect(report!.incomeStatement.netRevenue).toBe(1_000_000);
    expect(report!.balanceSheet.totalAssets).toBe(5_000_000);

    const db = getDb();
    const row = db
      .prepare(
        "SELECT action_code, period_year FROM financial_reports WHERE id = ?",
      )
      .get(report!.id) as { action_code: string; period_year: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.action_code).toBe("HPG");
    expect(row!.period_year).toBe(2025);
  });

  it("SSC-07: LanceDB failure is non-fatal — report and SQLite row persist", async () => {
    const report = await fetchParseAndStoreBctc({
      actionCode: "TCB",
      year: 2025,
      quarter: "Q3",
      pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/tcb-q3-2025.pdf",
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: makeFailingInsertFn(),
    });

    expect(report).not.toBeNull();
    expect(report!.actionCode).toBe("TCB");

    const db = getDb();
    const row = db
      .prepare("SELECT id FROM financial_reports WHERE id = ?")
      .get(report!.id) as { id: string } | undefined;
    expect(row).toBeDefined();
  });

  it("SSC-08: running the pipeline twice for the same report replaces the existing row", async () => {
    const actionCode = "SSC08_DEDUP";
    const pdfUrl = "https://congbothongtin.ssc.gov.vn/bctc/ssc08-q1-2025.pdf";

    const report1 = await fetchParseAndStoreBctc({
      actionCode,
      year: 2025,
      quarter: "Q1",
      pdfUrl,
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: makeInsertSpy().fn,
    });

    const report2 = await fetchParseAndStoreBctc({
      actionCode,
      year: 2025,
      quarter: "Q1",
      pdfUrl,
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: makeInsertSpy().fn,
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
  });

  it("SSC-09: annual-only rows in HTML listing are filtered out; pipeline returns null for quarterly request", async () => {
    const insertSpy = makeInsertSpy();

    const result = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeSscHttpClient([ROW_VCB_ANNUAL]),
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn,
    });

    expect(result).toBeNull();
    expect(insertSpy.calls.length).toBe(0);
  });

  it("SSC-10: pdfUrl from params is passed through to report.source.sscUrl", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "HPG",
      year: 2025,
      quarter: "Q1",
      pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/HPG-Q1-2025.pdf",
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn,
    });

    expect(report).not.toBeNull();
    expect(report!.source.sscUrl).toContain("HPG-Q1-2025.pdf");
  });

  it("SSC-11: buildSscSearchUrl produces a URL containing the action code", () => {
    const url = buildSscSearchUrl("VCB", 2025);
    expect(url).toContain("VCB");
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });

  it("SSC-12: parseSscHtml parses quarterly rows from .tbl-data HTML", () => {
    const html = buildSscHtml([ROW_VCB_Q1]);
    const docs = parseSscHtml(html, "quarterly");
    expect(docs).toBeArray();
    expect(docs.length).toBe(1);
    expect(docs[0]!.url).toBe(VCB_Q1_URL);
    expect(docs[0]!.reportType).toBe("quarterly");
  });

  it("store verification: financial_reports row has correct columns", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "MBB",
      year: 2025,
      quarter: "Q4",
      pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/mbb-q4-2025.pdf",
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn,
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

  it("Vietnamese text: gross margin and net margin ratios are computed", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_Q1_URL,
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn,
    });

    expect(report).not.toBeNull();
    expect(report!.ratios.grossMarginPct).not.toBeNull();
    expect(report!.ratios.grossMarginPct!).toBeGreaterThan(0);
    expect(report!.ratios.grossMarginPct!).toBeLessThan(100);
    expect(report!.ratios.netMarginPct).not.toBeNull();
    expect(report!.ratios.netMarginPct!).toBeGreaterThan(0);
    expect(report!.ratios.netMarginPct!).toBeLessThan(100);
  });

  it("period.year, period.quarter, and period.sortKey are set from params", async () => {
    const insertSpy = makeInsertSpy();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q1",
      pdfUrl: VCB_Q1_URL,
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn,
    });

    expect(report!.period.year).toBe(2025);
    expect(report!.period.quarter).toBe(1);
    expect(report!.period.sortKey).toBe("2025-Q1");
  });

  it("insertAnalysisFn receives entry with level='action' and correct actionCode", async () => {
    const insertSpy = makeInsertSpy();

    await fetchParseAndStoreBctc({
      actionCode: "BID",
      year: 2025,
      quarter: "Q2",
      pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/bid-q2-2025.pdf",
      pdfHttpClient: makePdfHttpClient(),
      pdfTextOverride: MINIMAL_BCTC_TEXT,
      insertAnalysisFn: insertSpy.fn,
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
