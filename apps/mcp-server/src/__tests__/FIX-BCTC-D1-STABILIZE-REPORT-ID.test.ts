Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-D1-STABILIZE-REPORT-ID
 *
 * Proves `financial_reports.id` is stable across repeat parses of the same
 * (action_code, sort_key). Before this fix, storeReport() used
 * `INSERT OR REPLACE`, which resolves UNIQUE(action_code, sort_key)
 * conflicts via DELETE-then-INSERT — minting a brand-new `id` on every
 * re-parse. Downstream PEK tables (bctc_layout_units, bctc_page_zones)
 * reference financial_reports.id via a plain TEXT column (no real FK), so a
 * replaced id silently orphans any rows already written against the old id.
 *
 * The fix: `INSERT ... ON CONFLICT(action_code, sort_key) DO UPDATE SET
 * <all columns except id>` — the existing row is updated in place, `id` is
 * never touched by the DO UPDATE clause, so it survives every re-parse.
 *
 * See: docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D1.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { parseBctcReport } from "../application/usecases/parseBctcReport.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { FiscalPeriod } from "../../bctc-schema.js";

const ACTION_CODE = "D1STABLE";

const TEST_PERIOD: FiscalPeriod = {
  year: 2024,
  quarter: 1,
  periodType: "Q1",
  startDate: "2024-01-01",
  endDate: "2024-03-31",
  sortKey: "2024-Q1-D1STABLE",
};

/**
 * First-parse fixture — full BCTC text (balance sheet + income statement +
 * cash flow), structurally identical to the proven 047-bctc-orchestrator.test.ts
 * fixture. "Doanh thu thuần" (net revenue) = 39.500.000.
 */
const BCTC_TEXT_V1 = `
CÔNG TY CỔ PHẦN D1STABLE
BÁO CÁO TÀI CHÍNH QUÝ 1/2024

BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                    50.000.000
  Tiền và tương đương tiền                            5.000.000
  Đầu tư tài chính ngắn hạn                          10.000.000
  Phải thu ngắn hạn                                  20.000.000
  Hàng tồn kho                                       12.000.000
  Tài sản ngắn hạn khác                               3.000.000
Tài sản dài hạn                                     30.000.000
  Tài sản cố định                                    25.000.000
  Đầu tư tài chính dài hạn                            5.000.000
TỔNG CỘNG TÀI SẢN                                   80.000.000

Nợ ngắn hạn                                         20.000.000
  Vay và nợ thuê tài chính ngắn hạn                   8.000.000
  Phải trả người bán ngắn hạn                         6.000.000
  Thuế và các khoản phải nộp                          1.000.000
  Người mua trả tiền trước                            2.000.000
  Nợ ngắn hạn khác                                   3.000.000
Nợ dài hạn                                          10.000.000
  Vay và nợ thuê tài chính dài hạn                   10.000.000
Nợ phải trả                                         30.000.000
Vốn chủ sở hữu                                      50.000.000
  Vốn góp của chủ sở hữu                             30.000.000
  Thặng dư vốn cổ phần                                5.000.000
  Lợi nhuận sau thuế chưa phân phối                  15.000.000
TỔNG CỘNG NGUỒN VỐN                                 80.000.000

BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Doanh thu bán hàng và cung cấp dịch vụ              40.000.000
Giảm trừ doanh thu                                     500.000
Doanh thu thuần                                     39.500.000
Giá vốn hàng bán                                    25.000.000
Lợi nhuận gộp                                       14.500.000
Doanh thu hoạt động tài chính                         1.000.000
Chi phí tài chính                                     2.000.000
  Chi phí lãi vay                                    1.500.000
Chi phí bán hàng                                     3.000.000
Chi phí quản lý doanh nghiệp                         2.000.000
Lợi nhuận thuần từ hoạt động kinh doanh              8.500.000
Thu nhập khác                                          200.000
Chi phí khác                                           100.000
Lợi nhuận khác                                        100.000
Lợi nhuận trước thuế                                 8.600.000
Thuế TNDN hiện hành                                  1.720.000
Lợi nhuận sau thuế                                   6.880.000
Lãi cơ bản trên cổ phiếu                                 3.440

BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lợi nhuận trước thuế                                 8.600.000
Khấu hao TSCĐ                                        1.500.000
Thay đổi vốn lưu động                               (1.000.000)
Tiền lãi vay đã trả                                 (1.500.000)
Thuế TNDN đã nộp                                    (1.720.000)
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
Tiền chi mua sắm TSCĐ                               (3.000.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư           (3.000.000)
Tiền vay nhận được                                   5.000.000
Tiền trả nợ gốc vay                                 (4.000.000)
Cổ tức đã trả                                       (1.000.000)
Lưu chuyển tiền thuần từ hoạt động tài chính           (0)
Lưu chuyển tiền thuần trong kỳ                       2.880.000
Tiền và tương đương tiền đầu kỳ                      2.120.000
Tiền và tương đương tiền cuối kỳ                     5.000.000
`;

/**
 * Second-parse fixture — IDENTICAL structure to V1, only "Doanh thu thuần"
 * changed (39.500.000 -> 60.000.000). Simulates a re-parse of the same
 * report (same action_code + sort_key) that resolves a different scalar.
 */
const BCTC_TEXT_V2 = BCTC_TEXT_V1.replace(
  "Doanh thu thuần                                     39.500.000",
  "Doanh thu thuần                                     60.000.000",
);

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

describe("FIX-BCTC-D1-STABILIZE-REPORT-ID — financial_reports.id survives re-parse", () => {
  it("fixture sanity: V1 and V2 differ only in the net-revenue line", () => {
    expect(BCTC_TEXT_V2).not.toBe(BCTC_TEXT_V1);
    expect(BCTC_TEXT_V1).toContain("39.500.000");
    expect(BCTC_TEXT_V2).toContain("60.000.000");
  });

  it("keeps the SAME id and DOES update scalar columns across two parses of the identical (action_code, sort_key)", async () => {
    // ── Parse #1 — first-ever write for this (action_code, sort_key) ────────
    const first = await parseBctcReport({
      rawText: BCTC_TEXT_V1,
      actionCode: ACTION_CODE,
      period: TEST_PERIOD,
      _telegramBugFn: async () => true,
    });

    const db = getDb();
    const row1 = db
      .prepare(
        "SELECT id, net_revenue FROM financial_reports WHERE action_code = ? AND sort_key = ?",
      )
      .get(ACTION_CODE, TEST_PERIOD.sortKey) as { id: string; net_revenue: number } | null;

    expect(row1).not.toBeNull();
    const firstId = row1!.id;
    expect(firstId).toBeTruthy();
    expect(row1!.net_revenue).toBeGreaterThan(0);
    // First-ever write: the in-memory report.id returned to the caller
    // matches the id actually persisted.
    expect(first.id).toBe(firstId);

    // ── Parse #2 — re-parse of the SAME (action_code, sort_key), different
    //    scalar values (net_revenue changed via BCTC_TEXT_V2) ───────────────
    const second = await parseBctcReport({
      rawText: BCTC_TEXT_V2,
      actionCode: ACTION_CODE,
      period: TEST_PERIOD,
      _telegramBugFn: async () => true,
    });

    const row2 = db
      .prepare(
        "SELECT id, net_revenue FROM financial_reports WHERE action_code = ? AND sort_key = ?",
      )
      .get(ACTION_CODE, TEST_PERIOD.sortKey) as { id: string; net_revenue: number } | null;

    expect(row2).not.toBeNull();

    // ── Core D1 assertion: id UNCHANGED across the re-parse ──────────────────
    expect(row2!.id).toBe(firstId);
    // The returned in-memory report also carries the stable, pre-existing id
    // (not a freshly minted, never-persisted uuid) — see parseBctcReport.ts
    // Step 6 pre-check.
    expect(second.id).toBe(firstId);

    // ── Scalar values DID update (upsert actually applied the new data) ─────
    expect(row2!.net_revenue).not.toBe(row1!.net_revenue);
    expect(row2!.net_revenue).toBeGreaterThan(row1!.net_revenue);

    // ── Exactly one row for this (action_code, sort_key) — no duplicate ─────
    const countRow = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM financial_reports WHERE action_code = ? AND sort_key = ?",
      )
      .get(ACTION_CODE, TEST_PERIOD.sortKey) as { cnt: number };
    expect(countRow.cnt).toBe(1);
  });

  it("a genuinely different sort_key for the same action_code gets its own id (no cross-period bleed)", async () => {
    const otherPeriod: FiscalPeriod = {
      ...TEST_PERIOD,
      quarter: 2,
      periodType: "Q2",
      sortKey: "2024-Q2-D1STABLE",
    };

    const report = await parseBctcReport({
      rawText: BCTC_TEXT_V1,
      actionCode: ACTION_CODE,
      period: otherPeriod,
      _telegramBugFn: async () => true,
    });

    const db = getDb();
    const q1Row = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, TEST_PERIOD.sortKey) as { id: string } | null;
    const q2Row = db
      .prepare("SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?")
      .get(ACTION_CODE, otherPeriod.sortKey) as { id: string } | null;

    expect(q1Row).not.toBeNull();
    expect(q2Row).not.toBeNull();
    expect(q2Row!.id).toBe(report.id);
    expect(q2Row!.id).not.toBe(q1Row!.id);
  });
});
