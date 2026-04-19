/**
 * Task 293 — Pipeline fallback: fetchParseAndStoreBctc OCR cache wiring
 *
 * Tests the OCR fallback logic added to fetchParseAndStoreBctc Step 2.
 * When pdf-parse returns < 100 chars, the pipeline must:
 *   1. Check OCR cache via getCachedPdfText
 *   2. Use cached text if confidence >= 0.5 (log info)
 *   3. Use cached text if confidence 0.3–0.49 (log warn)
 *   4. Return null if confidence < 0.3
 *   5. Proceed with empty text (abort) if no cache and isOcrAvailable() is false
 *
 * All tests use a :memory: SQLite database so no real I/O is needed.
 * For fallback tests, pdfTextOverride is NOT used so the real extraction path
 * (which returns empty text for a fake non-PDF binary) triggers the fallback.
 *
 * The `getCachedPdfText` and `isOcrAvailable` functions are injected via
 * the new `ocrFallbackFn` param (see implementation) or exercised against
 * the seeded :memory: SQLite db.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { closeDb, initDatabase, getDb } from "../infrastructure/db/schema.js";
import type { FetchParseAndStoreBctcParams } from "../application/usecases/fetchParseAndStoreBctc.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Full-length BCTC text — enough for all extractors to return non-zero values */
const FULL_BCTC_TEXT = `
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
const FAKE_DOC_URL = "https://congbothongtin.ssc.gov.vn/faces/document/vcb-q1-2025.pdf";
/** The filename derived from FAKE_DOC_URL via basename */
const FAKE_DOC_FILENAME = "vcb-q1-2025.pdf";

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

/** Mock SSC HTTP client */
function makeMockSscHttpClient(): { get: (url: string) => Promise<string> } {
  return {
    async get(_url: string): Promise<string> {
      return buildFakeSscHtml(FAKE_DOC_URL);
    },
  };
}

/** Mock PDF HTTP client — returns a short non-PDF binary so pdf-parse returns empty text */
function makeMockPdfHttpClient(): { get: (url: string) => Promise<string> } {
  return {
    async get(_url: string): Promise<string> {
      return Buffer.from("FAKE_PDF").toString("binary");
    },
  };
}

/** Mock insertAnalysis */
function makeMockInsertAnalysis(): {
  fn: (entry: unknown) => Promise<void>;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    fn: async (entry: unknown) => { calls.push(entry); },
    calls,
  };
}

/**
 * Seed the pdf_extracted_text table with a single page row.
 *
 * @param filename   - The filename key used in pdf_extracted_text.
 * @param confidence - Confidence value (0.0–1.0).
 * @param text       - The OCR text content.
 */
function seedOcrCache(filename: string, confidence: number, text: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO pdf_extracted_text (filename, page_number, text_content, confidence) VALUES (?, ?, ?, ?)"
  ).run(filename, 1, text, confidence);
}

/** Clear OCR cache rows for a given filename */
function clearOcrCache(filename: string): void {
  getDb().prepare("DELETE FROM pdf_extracted_text WHERE filename = ?").run(filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// Database setup
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 293 — OCR cache fallback in fetchParseAndStoreBctc", () => {

  // ── 1. Happy path (pdf-parse returns >= 100 chars): OCR fallback not triggered ─
  it("uses pdfTextOverride text directly when it is >= 100 chars — no OCR fallback", async () => {
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
      pdfTextOverride: FULL_BCTC_TEXT,
      insertAnalysisFn: mockInsert.fn,
    });

    expect(report).not.toBeNull();
    expect(report!.actionCode).toBe("VCB");
  });

  // ── 2. OCR fallback with high confidence (>= 0.5): pipeline succeeds ────────
  it("uses OCR cache text when pdf-parse returns empty and cache confidence >= 0.5", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    clearOcrCache(FAKE_DOC_FILENAME);
    seedOcrCache(FAKE_DOC_FILENAME, 0.8, FULL_BCTC_TEXT);

    const mockInsert = makeMockInsertAnalysis();

    // No pdfTextOverride — the real extraction path runs (FAKE_PDF → pdf-parse → empty)
    // Then the OCR fallback kicks in and reads from the seeded cache
    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q2",
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      // No pdfTextOverride — triggers real extraction path → OCR fallback
      insertAnalysisFn: mockInsert.fn,
    });

    // OCR cache provides the full BCTC text — parsing should succeed
    expect(report).not.toBeNull();
    expect(report!.actionCode).toBe("VCB");
  });

  // ── 3. OCR fallback with low confidence (0.3–0.49): pipeline succeeds ───────
  it("uses OCR cache text with low confidence (0.3–0.49) and returns report", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    clearOcrCache(FAKE_DOC_FILENAME);
    seedOcrCache(FAKE_DOC_FILENAME, 0.4, FULL_BCTC_TEXT);

    const mockInsert = makeMockInsertAnalysis();

    const report = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q3",
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      insertAnalysisFn: mockInsert.fn,
    });

    // Low confidence but >= 0.3 — should still use the cache text and succeed
    expect(report).not.toBeNull();
    expect(report!.actionCode).toBe("VCB");
  });

  // ── 4. OCR fallback with confidence < 0.3: pipeline returns null ─────────────
  it("returns null when OCR cache confidence < 0.3", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    clearOcrCache(FAKE_DOC_FILENAME);
    // Seed with confidence 0.1 (below 0.3 threshold)
    seedOcrCache(FAKE_DOC_FILENAME, 0.1, "x");

    const mockInsert = makeMockInsertAnalysis();

    const result = await fetchParseAndStoreBctc({
      actionCode: "VCB",
      year: 2025,
      quarter: "Q4",
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      insertAnalysisFn: mockInsert.fn,
    });

    // Confidence < 0.3 — pipeline should return null
    expect(result).toBeNull();
  });

  // ── 5. No OCR cache at all: pipeline returns null (no tesseract in test env) ─
  it("returns null when pdf-parse returns empty and there is no OCR cache", async () => {
    const { fetchParseAndStoreBctc } = await import(
      "../application/usecases/fetchParseAndStoreBctc.js"
    );

    clearOcrCache(FAKE_DOC_FILENAME);

    const mockInsert = makeMockInsertAnalysis();

    // No pdfTextOverride, no OCR cache, isOcrAvailable() is false in test env
    // → pipeline falls through to empty text guard → returns null
    const result = await fetchParseAndStoreBctc({
      actionCode: "FPT",
      year: 2025,
      quarter: "Q1",
      sscHttpClient: makeMockSscHttpClient(),
      pdfHttpClient: makeMockPdfHttpClient(),
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result).toBeNull();
  });

  // ── 6. Regression: pdfTextOverride="" still returns null ─────────────────────
  it("still returns null when pdfTextOverride is empty string (regression)", async () => {
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
      pdfTextOverride: "",
      insertAnalysisFn: mockInsert.fn,
    });

    expect(result).toBeNull();
  });
});
