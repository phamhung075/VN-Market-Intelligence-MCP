/**
 * hotfix-bctc-parser2 — Tests for 3 critical BCTC extraction bugs
 *
 * Bug 1 (DIG/SHB — ticker code case mismatch in scanDiskForStrandedPdfs):
 *   watchlist codes returned from DB may be lowercase/mixed-case. The regex
 *   was built from the raw code value and tested against filename.toUpperCase(),
 *   so a code "dig" would produce /dig/ which never matched "...DIG...".
 *   Fix: uppercase the code when building the regex.
 *
 * Bug 2 (FPT — unit scale: raw VND × tỷ multiplier = quadrillions):
 *   incomeStatementExtractor magnitude inference only fires when m === 1.
 *   When detectUnitMultiplier returns 1000 (tỷ) but the extracted values are
 *   already raw VND đồng, the values are multiplied by 1000 instead of
 *   divided by 1,000,000. Fix: fire magnitude inference for any m when the
 *   scaled result exceeds MAX_REALISTIC_TRIEU (1e14 triệu).
 *
 * Bug 3 (DGC/BSR — phantom confidence on zero-core data):
 *   computeConfidence counts non-zero fields linearly; cash flow sub-fields
 *   can yield non-zero counts even when netRevenue, totalAssets, netProfit
 *   are all zero, producing confidence = 13–63%. Fix: cap confidence at 0.05
 *   when all three core fields (netRevenue, totalAssets, netProfit) are zero.
 *
 * Layer: domain unit tests — pure functions, no I/O.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1: scanDiskForStrandedPdfs — ticker code case mismatch
// ─────────────────────────────────────────────────────────────────────────────

describe("Bug 1: scanDiskForStrandedPdfs — lowercase watchlist code matches uppercase filename", () => {
  it("detects DIG stranded when watchlist code is stored as lowercase 'dig'", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    db.exec(`
      CREATE TABLE watchlist (code TEXT);
      CREATE TABLE financial_reports (
        action_code TEXT, period_year INTEGER, period_type TEXT
      );
    `);
    // Watchlist code stored lowercase — this is the bug trigger
    db.prepare("INSERT INTO watchlist VALUES (?)").run("dig");

    const pdfDir = join(tmpdir(), `bctc-bug1-${Date.now()}`);
    mkdirSync(pdfDir, { recursive: true });
    // Vietnamese-style filename — DIG is uppercase in the filename
    writeFileSync(join(pdfDir, "BCTC DIG 31.12.2025 - HOP NHAT - VN.pdf"), "");

    try {
      const stranded = await scanDiskForStrandedPdfs(db, pdfDir);
      // After fix: should find DIG even though watchlist stores lowercase "dig"
      expect(stranded.length).toBe(1);
      expect(stranded[0]!.ticker).toBe("DIG");
    } finally {
      rmSync(pdfDir, { recursive: true, force: true });
    }
  });

  it("detects SHB stranded when watchlist code is stored as mixed-case 'Shb'", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    db.exec(`
      CREATE TABLE watchlist (code TEXT);
      CREATE TABLE financial_reports (
        action_code TEXT, period_year INTEGER, period_type TEXT
      );
    `);
    db.prepare("INSERT INTO watchlist VALUES (?)").run("Shb");

    const pdfDir = join(tmpdir(), `bctc-bug1b-${Date.now()}`);
    mkdirSync(pdfDir, { recursive: true });
    writeFileSync(join(pdfDir, "BCTC SHB Q4 2025.pdf"), "");

    try {
      const stranded = await scanDiskForStrandedPdfs(db, pdfDir);
      expect(stranded.length).toBe(1);
      expect(stranded[0]!.ticker).toBe("SHB");
    } finally {
      rmSync(pdfDir, { recursive: true, force: true });
    }
  });

  it("still skips PDFs already in financial_reports (idempotent)", async () => {
    const { scanDiskForStrandedPdfs } = await import(
      "../scheduler/financial-reports/bctcReparseJob.js"
    );

    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    db.exec(`
      CREATE TABLE watchlist (code TEXT);
      CREATE TABLE financial_reports (
        action_code TEXT, period_year INTEGER, period_type TEXT
      );
    `);
    db.prepare("INSERT INTO watchlist VALUES (?)").run("dig");
    db.prepare("INSERT INTO financial_reports VALUES (?,?,?)").run("DIG", 2025, "Q4");

    const pdfDir = join(tmpdir(), `bctc-bug1c-${Date.now()}`);
    mkdirSync(pdfDir, { recursive: true });
    writeFileSync(join(pdfDir, "BCTC DIG 31.12.2025 - HOP NHAT - VN.pdf"), "");

    try {
      const stranded = await scanDiskForStrandedPdfs(db, pdfDir);
      expect(stranded.length).toBe(0);
    } finally {
      rmSync(pdfDir, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 2: incomeStatementExtractor — magnitude inference when m = 1000 (tỷ)
// but extracted values are raw VND đồng
// ─────────────────────────────────────────────────────────────────────────────

describe("Bug 2: extractIncomeStatement — no quadrillion net profit when unit=tỷ but values are raw VND", () => {
  it("does NOT produce netProfit > 1e14 triệu when PDF declares tỷ but numbers are raw VND", async () => {
    const { extractIncomeStatement } = await import(
      "../domain/services/financial-reports/incomeStatementExtractor.js"
    );

    // FPT-style: header says "Tỷ đồng", but OCR extracted absolute raw VND integers
    // Raw net profit ≈ 14,324,284,500 đồng = ~14.3 tỷ (reasonable for FPT quarterly)
    // Bug: 14,324,284,500 * 1000 = 14,324,284,500,000 triệu → quadrillions
    // Fix: magnitude inference caps it at reasonable triệu scale
    const fptStyleText = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Đơn vị tính: Tỷ đồng
Doanh thu thuần              54,632,184,000
Giá vốn hàng bán             38,210,900,000
Lợi nhuận gộp                16,421,284,000
Lợi nhuận sau thuế           14,324,284,500
    `.trim();

    const result = extractIncomeStatement(fptStyleText);

    // After fix: netProfit must be in a plausible triệu range (not quadrillions)
    // 14,324,284,500 đồng = ~14,324 triệu → reasonable
    // The unrealistic magnitude guard caps it below 1e14
    expect(result.netProfit).toBeLessThan(1e14);
    expect(result.netProfit).toBeGreaterThan(0);
  });

  it("still correctly scales tỷ-declared values that ARE in tỷ units (not raw VND)", async () => {
    const { extractIncomeStatement } = await import(
      "../domain/services/financial-reports/incomeStatementExtractor.js"
    );

    // Normal tỷ case: 5,432 tỷ net revenue, 234 tỷ net profit — should become ×1000 triệu
    const normalTyText = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Đơn vị tính: Tỷ đồng
Doanh thu thuần              5.432
Giá vốn hàng bán             3.100
Lợi nhuận gộp                2.332
Lợi nhuận sau thuế             234
    `.trim();

    const result = extractIncomeStatement(normalTyText);
    // "5.432" in Vietnamese notation = 5,432 tỷ (thousands separator is "."),
    // × 1000 = 5,432,000 triệu — realistic for a large corp.
    // The upper guard is 1e14 triệu (the magnitude inference threshold).
    expect(result.netRevenue).toBeGreaterThan(1000); // > 1000 triệu
    expect(result.netRevenue).toBeLessThan(1e14);    // < magnitude inference threshold
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 3: computeConfidence — phantom confidence when core fields are all zero
// ─────────────────────────────────────────────────────────────────────────────

describe("Bug 3: computeConfidence — cap at 0.05 when netRevenue, totalAssets, netProfit all zero", () => {
  it("returns ≤ 0.05 when netRevenue=0, totalAssets=0, netProfit=0 even if cashflow fields non-zero", async () => {
    const { parseBctcReport } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    // BSR-style: text has some cash flow numbers but no income / balance sheet
    // This produces non-zero CF fields (beginningCash, endingCash) but zero core fields
    const bsrStyleText = `
BCTC Q4 2025
Đơn vị: triệu đồng
Tiền đầu kỳ       1.250
Tiền cuối kỳ      1.180
Lưu chuyển tiền thuần từ HĐKD    (70)
    `.trim();

    // parseBctcReport stores to DB — use in-memory DB via env already set above
    // We only need to check extractionConfidence on the returned report
    const { Database: BunDb } = await import("bun:sqlite");
    // We can't easily inject DB here, so check the confidence indirectly
    // by calling computeConfidence via the extractors directly

    // Build zero-core balance sheet
    const zeroBS = {
      totalAssets: 0,
      currentAssets: { cash: 0, shortTermInvestments: 0, accountsReceivable: 0, inventory: 0, otherCurrentAssets: 0, total: 0 },
      nonCurrentAssets: { longTermReceivables: 0, fixedAssets: 0, investmentProperty: 0, longTermInvestments: 0, goodwill: 0, otherLongTermAssets: 0, total: 0 },
      totalLiabilities: 0,
      equity: { shareCapital: 0, sharePremium: 0, treasuryShares: 0, retainedEarnings: 0, otherEquityFunds: 0, minorityInterest: 0, total: 0 },
      totalLiabilitiesAndEquity: 0,
    };

    // Income statement with all zeros (the core fields)
    const zeroIS = {
      netRevenue: 0, grossRevenue: 0, revenueDeductions: 0, cogs: 0, grossProfit: 0,
      financialIncome: 0, financialExpenses: 0, interestExpenses: 0, shareOfAssociates: 0,
      sellingExpenses: 0, adminExpenses: 0, operatingProfit: 0,
      otherIncome: 0, otherExpenses: 0, otherProfit: 0,
      profitBeforeTax: 0, incomeTaxCurrent: 0, incomeTaxDeferred: 0, totalIncomeTax: 0,
      netProfit: 0, minorityInterest: 0, netProfitParent: 0,
      eps: 0, dilutedEps: 0, ebitda: 0, ebit: 0,
    };

    // Cash flow with some non-zero fields (simulates BSR OCR picking up cash figures)
    const partialCF = {
      operatingCF: -70,
      investingCF: 0,
      financingCF: 0,
      capex: 0,
      freeCashFlow: -70,
      netCashFlow: -70,
      beginningCash: 1250,
      endingCash: 1180,
      depreciationAmortization: 0,
    };

    // Import the module and call computeConfidence via the test-accessible path
    // computeConfidence is not exported — so test via parseBctcReport's output
    // We test extractionConfidence on the returned report
    // Use a text that only has CF data, no income or BS
    const report = await parseBctcReport({
      rawText: bsrStyleText,
      actionCode: "BSR",
      period: {
        year: 2025,
        quarter: 4,
        periodType: "Q4",
        startDate: "2025-10-01",
        endDate: "2025-12-31",
        sortKey: "2025-Q4",
      },
    });

    // Core fields (netRevenue, totalAssets, netProfit) should all be 0 from this text
    // After fix: confidence capped at ≤ 0.05
    expect(report.source.extractionConfidence).toBeLessThanOrEqual(0.05);
  });

  it("does NOT cap confidence when at least one core field is non-zero", async () => {
    const { parseBctcReport } = await import(
      "../application/usecases/parseBctcReport.js"
    );

    // Text has real revenue — confidence should be normal
    const realText = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Đơn vị tính: triệu đồng
Doanh thu thuần              5.432.000
Giá vốn hàng bán             3.100.000
Lợi nhuận gộp                2.332.000
Lợi nhuận sau thuế             234.000
Tổng cộng tài sản           18.000.000
Nợ phải trả                 10.000.000
Vốn chủ sở hữu               8.000.000
Tổng cộng nguồn vốn          18.000.000
    `.trim();

    const report = await parseBctcReport({
      rawText: realText,
      actionCode: "DGC",
      period: {
        year: 2025,
        quarter: 4,
        periodType: "Q4",
        startDate: "2025-10-01",
        endDate: "2025-12-31",
        sortKey: "2025-Q4",
      },
    });

    // At least netRevenue > 0, so cap should NOT apply
    expect(report.source.extractionConfidence).toBeGreaterThan(0.05);
  });
});
