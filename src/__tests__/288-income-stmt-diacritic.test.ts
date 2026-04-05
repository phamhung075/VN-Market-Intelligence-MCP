/**
 * Task 288 — incomeStatementExtractor: NFC normalization + ASCII-stripped fallback patterns
 *
 * Tests for FR-3:
 *  1. NFC normalization of input text before processing
 *  2. ASCII (diacritic-stripped) fallback patterns when primary patterns fail
 *  3. Both primaryLines (NFC-normalized) and fallbackLines (NFC + diacritic-strip) are searched
 *
 * Simulates corrupted pdf-parse output where Vietnamese diacritics are stripped.
 */
import { describe, it, expect } from "bun:test";
import { extractIncomeStatement } from "../domain/services/incomeStatementExtractor";

// ---------------------------------------------------------------------------
// Sample: All diacritics stripped (simulating corrupted pdf-parse output)
// This is what pdf-parse may produce for some scanned PDFs.
// ---------------------------------------------------------------------------
const SAMPLE_DIACRITIC_STRIPPED = `
BAO CAO KET QUA HOAT DONG KINH DOANH
Quy 4/2024
Don vi: trieu dong

1. Doanh thu ban hang va cung cap dich vu           10.000.000
2. Cac khoan giam tru doanh thu                        500.000
3. Doanh thu thuan ve ban hang va CCDV                9.500.000
4. Gia von hang ban                                   6.000.000
5. Loi nhuan gop ve ban hang va CCDV                  3.500.000

6. Doanh thu hoat dong tai chinh                        200.000
7. Chi phi tai chinh                                    400.000
   Trong do: Chi phi lai vay                            300.000
8. Phan lai/lo trong cong ty lien ket                    50.000

9. Chi phi ban hang                                     800.000
10. Chi phi quan ly doanh nghiep                        600.000

11. Loi nhuan thuan tu hoat dong kinh doanh           1.950.000
12. Thu nhap khac                                       100.000
13. Chi phi khac                                         30.000
14. Loi nhuan khac                                       70.000

15. Tong loi nhuan ke toan truoc thue                 2.020.000
16. Chi phi thue TNDN hien hanh                         380.000
17. Chi phi thue TNDN hoan lai                           20.000
18. Tong chi phi thue TNDN                              400.000

19. Loi nhuan sau thue thu nhap doanh nghiep          1.620.000
20. Loi ich cua co dong khong kiem soat                 120.000
21. Loi nhuan sau thue cua co dong cong ty me         1.500.000

22. Lai co ban tren co phieu (VND)                       3.750
23. Lai suy giam tren co phieu (VND)                     3.600
`;

// ---------------------------------------------------------------------------
// Sample: NFC-composed text (same content as canonical Vietnamese but
// composed differently — NFD-like byte sequences normalised to NFC).
// We simulate this by building a string with decomposed diacritics and
// verifying that NFC normalisation makes it parse correctly.
// ---------------------------------------------------------------------------
const NET_REVENUE_NFD = "Doanh thu thua\u0300n"; // NFD: "thuần" written as "than" + combining grave
// After NFC → "thuần" (precomposed), which the primary regex matches.

// ---------------------------------------------------------------------------
// Sample: Partial diacritic strip — only some fields have diacritics stripped
// ---------------------------------------------------------------------------
const SAMPLE_PARTIAL_STRIP = `
BAO CAO KQHDKD
Don vi: trieu dong

Doanh thu thuan                     2.000.000
Gia von hang ban                    1.200.000
Loi nhuan gop                         800.000
Loi nhuan thuan tu HDKD               500.000
Loi nhuan truoc thue                  500.000
Loi nhuan sau thue TNDN               400.000
Lai co ban tren co phieu                1.000
`;

// ---------------------------------------------------------------------------
// Sample: Mixed — some lines have diacritics, others do not
// ---------------------------------------------------------------------------
const SAMPLE_MIXED = `
BÁO CÁO KQHĐKD
Đơn vị: triệu đồng

Doanh thu thuan                     5.000.000
Gia von hang ban                    3.000.000
Lợi nhuận gộp                       2.000.000
Chi phi ban hang                      500.000
Chi phi quan ly doanh nghiep          400.000
Loi nhuan thuan tu hoat dong kinh doanh  1.100.000
Thu nhap khac                          50.000
Chi phi khac                           20.000
Loi nhuan khac                         30.000
Tong loi nhuan truoc thue           1.130.000
Chi phi thue TNDN hien hanh           226.000
Lợi nhuận sau thuế TNDN              904.000
Lai co ban tren co phieu               2.260
`;

describe("288 — incomeStatementExtractor: NFC normalization + ASCII fallback", () => {
  // -- Test 1: Fully diacritic-stripped input should parse correctly via ASCII fallback
  it("parses fully diacritic-stripped income statement via ASCII fallback patterns", () => {
    const is = extractIncomeStatement(SAMPLE_DIACRITIC_STRIPPED);

    expect(is.grossRevenue).toBe(10_000_000);
    expect(is.revenueDeductions).toBe(500_000);
    expect(is.netRevenue).toBe(9_500_000);
    expect(is.cogs).toBe(6_000_000);
    expect(is.grossProfit).toBe(3_500_000);

    expect(is.financialIncome).toBe(200_000);
    expect(is.financialExpenses).toBe(400_000);
    expect(is.interestExpenses).toBe(300_000);
    expect(is.shareOfAssociates).toBe(50_000);

    expect(is.sellingExpenses).toBe(800_000);
    expect(is.adminExpenses).toBe(600_000);

    expect(is.operatingProfit).toBe(1_950_000);
    expect(is.otherIncome).toBe(100_000);
    expect(is.otherExpenses).toBe(30_000);
    expect(is.otherProfit).toBe(70_000);

    expect(is.profitBeforeTax).toBe(2_020_000);
    expect(is.incomeTaxCurrent).toBe(380_000);
    expect(is.incomeTaxDeferred).toBe(20_000);
    expect(is.totalIncomeTax).toBe(400_000);

    expect(is.netProfit).toBe(1_620_000);
    expect(is.minorityInterest).toBe(120_000);
    expect(is.netProfitParent).toBe(1_500_000);

    expect(is.eps).toBe(3_750);
    expect(is.dilutedEps).toBe(3_600);
    expect(is.ebit).toBe(1_950_000);
  });

  // -- Test 2: NFD-encoded text normalised via NFC preprocessing
  it("NFC-normalises NFD input before pattern matching", () => {
    // Construct text with NFD diacritic (combining grave on 'a' making 'à')
    // NFD: "Doanh thu thua\u0300n" → after NFC → "Doanh thu thuần"
    const nfdText = `
${NET_REVENUE_NFD}                     3.000.000
Gia von hang ban                    1.500.000
Loi nhuan sau thue TNDN             1.200.000
Lai co ban tren co phieu               3.000
`;
    const is = extractIncomeStatement(nfdText);
    // NFC normalization should make P_NET_REVENUE match
    expect(is.netRevenue).toBe(3_000_000);
  });

  // -- Test 3: Partial diacritic strip
  it("parses partial diacritic-stripped income statement (minimal fields)", () => {
    const is = extractIncomeStatement(SAMPLE_PARTIAL_STRIP);

    expect(is.netRevenue).toBe(2_000_000);
    expect(is.cogs).toBe(1_200_000);
    expect(is.grossProfit).toBe(800_000);
    expect(is.operatingProfit).toBe(500_000);
    expect(is.profitBeforeTax).toBe(500_000);
    expect(is.netProfit).toBe(400_000);
    expect(is.eps).toBe(1_000);
  });

  // -- Test 4: Mixed diacritics/ASCII in same document
  it("parses mixed diacritics/ASCII document correctly", () => {
    const is = extractIncomeStatement(SAMPLE_MIXED);

    expect(is.netRevenue).toBe(5_000_000);
    expect(is.cogs).toBe(3_000_000);
    expect(is.grossProfit).toBe(2_000_000);
    expect(is.sellingExpenses).toBe(500_000);
    expect(is.adminExpenses).toBe(400_000);
    expect(is.operatingProfit).toBe(1_100_000);
    expect(is.otherIncome).toBe(50_000);
    expect(is.otherExpenses).toBe(20_000);
    expect(is.otherProfit).toBe(30_000);
    expect(is.profitBeforeTax).toBe(1_130_000);
    expect(is.incomeTaxCurrent).toBe(226_000);
    expect(is.netProfit).toBe(904_000);
    expect(is.eps).toBe(2_260);
  });

  // -- Test 5: Primary (diacritics) patterns still work after refactor
  it("primary Vietnamese diacritic patterns still match after refactor", () => {
    // Re-validate the original full sample still parses correctly
    const SAMPLE_FULL = `
BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH
Quý 4/2024
Đơn vị: triệu đồng

1. Doanh thu bán hàng và cung cấp dịch vụ           10.000.000
2. Các khoản giảm trừ doanh thu                        500.000
3. Doanh thu thuần về bán hàng và CCDV               9.500.000
4. Giá vốn hàng bán                                   6.000.000
5. Lợi nhuận gộp về bán hàng và CCDV                  3.500.000

11. Lợi nhuận thuần từ hoạt động kinh doanh          1.950.000
15. Tổng lợi nhuận kế toán trước thuế                2.020.000
19. Lợi nhuận sau thuế thu nhập doanh nghiệp         1.620.000
22. Lãi cơ bản trên cổ phiếu (VND)                      3.750
23. Lãi suy giảm trên cổ phiếu (VND)                    3.600
`;
    const is = extractIncomeStatement(SAMPLE_FULL);
    expect(is.grossRevenue).toBe(10_000_000);
    expect(is.netRevenue).toBe(9_500_000);
    expect(is.cogs).toBe(6_000_000);
    expect(is.grossProfit).toBe(3_500_000);
    expect(is.operatingProfit).toBe(1_950_000);
    expect(is.profitBeforeTax).toBe(2_020_000);
    expect(is.netProfit).toBe(1_620_000);
    expect(is.eps).toBe(3_750);
    expect(is.dilutedEps).toBe(3_600);
  });

  // -- Test 6: ASCII EPS diluted before basic (greedy-match guard)
  it("diluted EPS pattern matches before basic EPS when both present in ASCII", () => {
    const text = `
Lai co ban tren co phieu (EPS)      5.000
Lai suy giam tren co phieu          4.800
`;
    const is = extractIncomeStatement(text);
    expect(is.eps).toBe(5_000);
    expect(is.dilutedEps).toBe(4_800);
  });

  // -- Test 7: Empty input still returns zeroed struct after NFC + fallback refactor
  it("returns zeroed IncomeStatement for empty input after refactor", () => {
    const is = extractIncomeStatement("");
    expect(is.grossRevenue).toBe(0);
    expect(is.netRevenue).toBe(0);
    expect(is.cogs).toBe(0);
    expect(is.grossProfit).toBe(0);
    expect(is.operatingProfit).toBe(0);
    expect(is.profitBeforeTax).toBe(0);
    expect(is.netProfit).toBe(0);
    expect(is.eps).toBe(0);
    expect(is.dilutedEps).toBe(0);
    expect(is.ebit).toBe(0);
    expect(is.ebitda).toBe(0);
  });
});
