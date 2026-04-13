/**
 * Task 1181 — Integration test for financial_reports persistence.
 *
 * Verifies that fetchParseAndStoreBctc persists a FinancialReport row into the
 * financial_reports SQLite table, and that the row is visible via the same DB
 * singleton immediately after the call returns.
 *
 * RED intent: on the current codebase (before task 1182), the storeReport call
 * is a bare call with no WAL checkpoint; the TECH_072 spec notes the test "may
 * behave differently" on :memory: vs file DBs and the real value is catching
 * future regressions at the persistence boundary.
 *
 * GREEN after task 1182: storeReport try/catch + WAL checkpoint are applied;
 * the pipeline correctly persists the row in all code paths.
 *
 * Design: docs/TECH_072.md § Integration Test Design
 *
 * Setup contract (per TECH_072 § Test setup requirements):
 *   1. closeDb() resets the singleton before each test body
 *   2. process.env["DB_PATH"] = ":memory:" before initDatabase()
 *   3. initDatabase() creates schema on the :memory: connection
 *   4. closeDb() in afterEach — reset singleton between tests
 *   5. DB_PATH restored in afterAll
 *   6. insertAnalysisFn mocked to async () => {} (avoids LanceDB dependency)
 */

import { describe, it, expect, afterEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { fetchParseAndStoreBctc } from "../application/usecases/fetchParseAndStoreBctc.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal BCTC text fixture
//
// Must contain at least one keyword from each of the three extractors so that
// the domain services return some non-zero values. A zero-confidence report is
// still stored; the test only asserts the row exists, not that values are
// meaningful. Required keywords per TECH_072.md:
//   - Balance sheet:    Tổng tài sản
//   - Income statement: Doanh thu
//   - Cash flow:        Lưu chuyển tiền thuần
//   - VN number:        1.234.567
// ─────────────────────────────────────────────────────────────────────────────

const MINIMAL_BCTC_FIXTURE = `
CÔNG TY CỔ PHẦN VNM
BÁO CÁO TÀI CHÍNH QUÝ 4/2025

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                    1.234.567
Tổng tài sản                                       20.000.000

Nợ phải trả                                         8.000.000
Vốn chủ sở hữu                                     12.000.000
TỔNG CỘNG NGUỒN VỐN                                20.000.000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu thuần                                     5.000.000
Lợi nhuận gộp                                       2.000.000
Lợi nhuận sau thuế                                  1.200.000

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền thuần từ hoạt động kinh doanh       1.100.000
Tiền và tương đương tiền đầu kỳ                       500.000
Tiền và tương đương tiền cuối kỳ                    1.600.000
`;

const ORIGINAL_DB_PATH = process.env["DB_PATH"];

afterEach(() => {
  // Reset singleton between tests so each test body starts with a clean DB
  closeDb();
});

afterAll(() => {
  // Restore DB_PATH to its pre-test value
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env["DB_PATH"];
  } else {
    process.env["DB_PATH"] = ORIGINAL_DB_PATH;
  }
});

describe("1181 — financial_reports persistence", () => {
  it("persists one row in financial_reports after fetchParseAndStoreBctc", async () => {
    // Step 1: reset any singleton left open by a prior test or import
    closeDb();

    // Step 2: point the DB singleton to an in-memory DB (hermetic, no disk I/O)
    process.env["DB_PATH"] = ":memory:";

    // Step 3: initialise schema on the fresh :memory: connection
    await initDatabase();

    // Step 4: run the pipeline with a minimal PDF text fixture.
    //   - pdfUrl bypasses the SSC portal listing step (no network)
    //   - pdfTextOverride bypasses the PDF download + extraction step (no network)
    //   - insertAnalysisFn mock avoids pulling in LanceDB / embeddings
    const result = await fetchParseAndStoreBctc({
      actionCode: "VNM",
      year: 2025,
      quarter: "Q4",
      pdfUrl: "https://congbothongtin.ssc.gov.vn/bctc/VNM_2025_Q4.pdf",
      pdfTextOverride: MINIMAL_BCTC_FIXTURE,
      insertAnalysisFn: async () => {
        // No-op mock — LanceDB insertion is non-fatal when omitted per design
      },
    });

    // Step 5: result must not be null — pipeline must not abort
    expect(result).not.toBeNull();

    // Step 6: query the same singleton that storeReport used internally
    const db = getDb();
    const row = db
      .query<{ cnt: number }, []>(
        "SELECT COUNT(*) as cnt FROM financial_reports WHERE action_code = 'VNM'",
      )
      .get();

    // Step 7: exactly one row must exist for action_code = 'VNM'
    expect(row).not.toBeNull();
    expect(row!.cnt).toBe(1);
  });
});
