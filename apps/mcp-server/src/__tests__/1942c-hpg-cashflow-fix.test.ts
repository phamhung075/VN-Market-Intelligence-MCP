/**
 * Task 1942c — HPG get_cash_flow all-zeros fix
 *
 * 6 tests covering:
 *   T1  Scenario B: non-zero operating_cf_bn → buildFallbackResponse returns non-zero operating_cf
 *   T2  Scenario B: operating_cf_bn = NULL in DB → buildFallbackResponse returns operating_cf: null
 *   T3  Scenario A: OCR text with "sản xuất kinh doanh" label → extractCashFlow returns non-zero operatingCF
 *   T4  Scenario A: existing VCB "luồng tiền thuần" label still matched (regression guard)
 *   T5  Scenario A: existing standard "hoạt động kinh doanh" label still matched (regression guard)
 *   T6  EC-1: genuine zero (operating_cf_bn = 0.0) returned as 0, not null (documents limitation)
 *
 * All fixtures are inline OCR mocks — no real PDF in repo.
 * Follows 1909a-cashflow-extractor-expansion.test.ts template.
 */

import { describe, it, expect } from "bun:test";
import Database from "bun:sqlite";

import { buildGetCashFlowHandler } from "../interface/mcp/tools/financial-reports/cashFlowTool.js";
import { extractCashFlow } from "../domain/services/financial-reports/cashFlowExtractor.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTestDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE financial_reports (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code           TEXT    NOT NULL,
      period_year           INTEGER NOT NULL,
      period_quarter        INTEGER,
      net_profit            REAL,
      operating_cf          REAL,
      investing_cf          REAL,
      financing_cf          REAL,
      capex                 REAL,
      free_cash_flow        REAL,
      operating_cash_flow   REAL,
      net_profit_api_bridge REAL,
      inventory             REAL,
      current_assets        REAL,
      cash                  REAL
    );
    CREATE TABLE vnstock_cash_flow (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      code             TEXT    NOT NULL,
      year_report      INTEGER NOT NULL,
      quarter          INTEGER NOT NULL,
      operating_cf_bn  REAL,
      investing_cf_bn  REAL,
      financing_cf_bn  REAL,
      net_cf_bn        REAL,
      source           TEXT    NOT NULL DEFAULT 'vnstock',
      fetched_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, year_report, quarter, source)
    );
    CREATE TABLE vnstock_financials (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      code             TEXT    NOT NULL,
      year_report      INTEGER NOT NULL,
      quarter          INTEGER NOT NULL,
      net_profit_bn    REAL,
      source           TEXT    NOT NULL DEFAULT 'vnstock',
      fetched_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, year_report, quarter, source)
    );
  `);
  return db;
}

function insertVcfRow(
  db: InstanceType<typeof Database>,
  row: { code: string; year_report: number; quarter: number; operating_cf_bn: number | null },
): void {
  db.prepare(`
    INSERT INTO vnstock_cash_flow
      (code, year_report, quarter, operating_cf_bn, fetched_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(row.code, row.year_report, row.quarter, row.operating_cf_bn);
}

function insertVfRow(
  db: InstanceType<typeof Database>,
  row: { code: string; year_report: number; quarter: number; net_profit_bn: number | null },
): void {
  db.prepare(`
    INSERT INTO vnstock_financials (code, year_report, quarter, net_profit_bn, fetched_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(row.code, row.year_report, row.quarter, row.net_profit_bn);
}

// ===========================================================================
// Fixture: HPG steel-sector OCR layout (Scenario A — "sản xuất kinh doanh")
// ===========================================================================
// Steel/manufacturing BCTC PDF uses "sản xuất kinh doanh" instead of
// "hoạt động kinh doanh". Values in triệu đồng.
// ===========================================================================
const HPG_STEEL_OCR = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ HỢP NHẤT
Cho năm tài chính kết thúc ngày 31/12/2024
Đơn vị tính: Triệu đồng

I. Lưu chuyển tiền từ hoạt động sản xuất kinh doanh
1. Lợi nhuận trước thuế                                 8.500.000
2. Khấu hao TSCĐ và BĐSĐT                              3.200.000
7. Thay đổi vốn lưu động                              (1.200.000)
11. Tiền lãi vay đã trả                                 (350.000)
12. Thuế TNDN đã nộp                                    (850.000)
Lưu chuyển tiền thuần từ hoạt động sản xuất kinh doanh  9.300.000

II. Lưu chuyển tiền từ hoạt động đầu tư
Tiền chi mua sắm TSCĐ                                 (4.500.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư             (4.500.000)

III. Lưu chuyển tiền từ hoạt động tài chính
Tiền vay nhận được                                      5.000.000
Tiền trả nợ gốc vay                                   (4.800.000)
Cổ tức và lãi tiền gửi đã thu                            100.000
Lưu chuyển tiền thuần từ hoạt động tài chính              300.000

Lưu chuyển tiền thuần trong kỳ                          5.100.000
Tiền và tương đương tiền đầu kỳ                         2.000.000
Tiền và tương đương tiền cuối kỳ                        7.100.000
`;

// ===========================================================================
// Fixture: VCB bank OCR layout (Scenario A regression — "luồng tiền thuần")
// ===========================================================================
const VCB_BANK_OCR = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ HỢP NHẤT
Đơn vị tính: Triệu đồng

I. Luồng tiền thuần từ hoạt động kinh doanh              9.947.260

II. Lưu chuyển tiền từ hoạt động đầu tư
Tiền chi mua sắm TSCĐ                                   (200.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư               (200.000)

III. Lưu chuyển tiền từ hoạt động tài chính
Tiền vay nhận được                                        500.000
Tiền trả nợ gốc vay                                     (300.000)
Lưu chuyển tiền thuần từ hoạt động tài chính              200.000

Lưu chuyển tiền thuần trong kỳ                          9.947.260
`;

// ===========================================================================
// Fixture: FPT standard OCR layout (Scenario A regression — "hoạt động kinh doanh")
// ===========================================================================
const FPT_STANDARD_OCR = `
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Đơn vị tính: Triệu đồng

I. Lưu chuyển tiền từ hoạt động kinh doanh
1. Lợi nhuận trước thuế                                 4.500.000
2. Khấu hao TSCĐ và BĐSĐT                                800.000
Lưu chuyển tiền thuần từ hoạt động kinh doanh           4.108.450

II. Lưu chuyển tiền từ hoạt động đầu tư
Tiền chi mua sắm TSCĐ                                   (500.000)
Lưu chuyển tiền thuần từ hoạt động đầu tư               (500.000)

III. Lưu chuyển tiền từ hoạt động tài chính
Tiền vay nhận được                                        200.000
Tiền trả nợ gốc vay                                     (150.000)
Lưu chuyển tiền thuần từ hoạt động tài chính               50.000

Lưu chuyển tiền thuần trong kỳ                          3.658.450
`;

// ===========================================================================
// Tests
// ===========================================================================

describe("1942c — HPG cash flow fix", () => {
  // T1: Scenario B — non-zero operating_cf_bn stored → tool returns non-zero operating_cf
  it("T1: Scenario B: operating_cf_bn=3500 → operating_cf=3_500_000", async () => {
    const db = makeTestDb();
    insertVcfRow(db, { code: "HPG", year_report: 2024, quarter: 4, operating_cf_bn: 3500 });
    insertVfRow(db, { code: "HPG", year_report: 2024, quarter: 4, net_profit_bn: 2800 });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "HPG" });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.data_source).toBe("vnstock_direct");
    expect(envelope.operating_cf).toBe(3_500_000);   // 3500 bn × 1000 = 3_500_000 triệu
    expect(envelope.operating_cf).not.toBe(0);
    expect(envelope.operating_cf).not.toBeNull();
    expect(envelope.ocf_source).toBe("vnstock_direct");
  });

  // T2: Scenario B — operating_cf_bn = NULL in DB → buildFallbackResponse returns null (honest missing)
  it("T2: Scenario B: operating_cf_bn=NULL → operating_cf=null (honest missing, not 0)", async () => {
    const db = makeTestDb();
    insertVcfRow(db, { code: "HPG", year_report: 2024, quarter: 4, operating_cf_bn: null });
    insertVfRow(db, { code: "HPG", year_report: 2024, quarter: 4, net_profit_bn: 2800 });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "HPG" });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.operating_cf).toBeNull();
    expect(envelope.operating_cf).not.toBe(0);  // AC-7: must not be 0.0
    expect(envelope.data_source).toBe("vnstock_direct");
  });

  // T3: Scenario A — OCR with "sản xuất kinh doanh" label → extractCashFlow returns non-zero operatingCF
  it("T3: Scenario A: steel OCR label 'sản xuất kinh doanh' → extractCashFlow returns non-zero operatingCF", () => {
    const result = extractCashFlow(HPG_STEEL_OCR);

    expect(result).not.toBeNull();
    expect(result.operatingCF).not.toBe(0);
    expect(result.operatingCF).toBe(9_300_000);  // value from OCR fixture
  });

  // T4: Scenario A — VCB "luồng tiền thuần" regression guard
  it("T4: Scenario A regression: VCB bank label 'luồng tiền thuần' still matched", () => {
    const result = extractCashFlow(VCB_BANK_OCR);

    expect(result).not.toBeNull();
    expect(result.operatingCF).not.toBe(0);
    expect(result.operatingCF).toBe(9_947_260);
  });

  // T5: Scenario A — FPT standard "hoạt động kinh doanh" regression guard
  it("T5: Scenario A regression: FPT standard label 'hoạt động kinh doanh' still matched", () => {
    const result = extractCashFlow(FPT_STANDARD_OCR);

    expect(result).not.toBeNull();
    expect(result.operatingCF).not.toBe(0);
    expect(result.operatingCF).toBe(4_108_450);
  });

  // T6: EC-1 — genuine zero operating_cf_bn = 0.0 → tool returns 0 (correct, not null)
  // Documents the known limitation: upstream Python fix prevents false 0.0 storage.
  // After the fix, a 0.0 in DB means either genuine zero OR missed key (indistinguishable).
  // The tool returns 0, not null. This is the documented EC-1 edge case.
  it("T6: EC-1: operating_cf_bn=0 → operating_cf=0 (genuine zero stored as zero, not null)", async () => {
    const db = makeTestDb();
    insertVcfRow(db, { code: "HPG", year_report: 2024, quarter: 4, operating_cf_bn: 0 });
    insertVfRow(db, { code: "HPG", year_report: 2024, quarter: 4, net_profit_bn: 100 });

    const handler = buildGetCashFlowHandler(db);
    const result = await handler({ ticker: "HPG" });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    // 0.0 * 1000 = 0 (not null) — documents EC-1 limitation
    expect(envelope.operating_cf).toBe(0);
    expect(envelope.operating_cf).not.toBeNull();
  });
});
