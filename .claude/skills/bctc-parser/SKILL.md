# Skill: BCTC Parser

## Purpose

Parse Vietnamese financial reports (Báo cáo tài chính) from PDF text and map extracted values to the `FinancialReport` interface defined in `bctc-schema.ts`.

## Input

Raw text extracted from a PDF via `pdf-parse`. The text is in Vietnamese and follows the standard BCTC format required by the Vietnamese Ministry of Finance.

## Output

A `Partial<FinancialReport>` object with all extractable fields populated and `source.extractionConfidence` set between 0 and 1.

## Key extraction targets

### From Bảng cân đối kế toán (Balance Sheet)
Look for table rows with these Vietnamese labels:
- `Tiền và các khoản tương đương tiền` → `balanceSheet.currentAssets.cash`
- `Hàng tồn kho` → `balanceSheet.currentAssets.inventory`
- `Tổng cộng tài sản` → `balanceSheet.totalAssets`
- `Vay và nợ thuê tài chính ngắn hạn` → `balanceSheet.currentLiabilities.shortTermDebt`
- `Tổng vốn chủ sở hữu` → `balanceSheet.equity.total`

### From Báo cáo kết quả hoạt động kinh doanh (Income Statement)
- `Doanh thu thuần` → `incomeStatement.netRevenue`
- `Giá vốn hàng bán` → `incomeStatement.cogs`
- `Lợi nhuận gộp` → `incomeStatement.grossProfit`
- `Chi phí bán hàng` → `incomeStatement.sellingExpenses`
- `Chi phí quản lý doanh nghiệp` → `incomeStatement.adminExpenses`
- `Lợi nhuận thuần từ hoạt động kinh doanh` → `incomeStatement.operatingProfit`
- `Lợi nhuận trước thuế` → `incomeStatement.profitBeforeTax`
- `Lợi nhuận sau thuế` → `incomeStatement.netProfit`
- `Lãi cơ bản trên cổ phiếu` → `incomeStatement.eps`

### From Báo cáo lưu chuyển tiền tệ (Cash Flow)
- `Lưu chuyển tiền thuần từ hoạt động kinh doanh` → `cashFlow.operatingCF`
- `Lưu chuyển tiền thuần từ hoạt động đầu tư` → `cashFlow.investingCF`
- `Lưu chuyển tiền thuần từ hoạt động tài chính` → `cashFlow.financingCF`
- `Tiền và tương đương tiền đầu kỳ` → `cashFlow.beginningCash`
- `Tiền và tương đương tiền cuối kỳ` → `cashFlow.endingCash`

## Number parsing rules

- All values are in **million VND (triệu đồng)** unless stated otherwise
- Negative values may appear in parentheses `(1,234)` or with a minus sign
- Thousand separators use `.` in Vietnamese format: `1.234.567` = 1,234,567
- Strip all `.` and replace `,` with `.` for decimal: `"1.234.567" → 1234567`
- Numbers in parentheses are negative: `"(123.456)" → -123456`

## Period detection

Detect from filename or document header:
- `Quý I / Q1` → quarter: 1
- `Quý II / Q2` → quarter: 2
- `Quý III / Q3` → quarter: 3
- `Quý IV / Q4` → quarter: 4
- `6 tháng đầu năm / Bán niên` → periodType: 'H1'
- `Cả năm / Năm tài chính` → periodType: 'ANNUAL'

## Confidence scoring

Set `extractionConfidence` based on:
- 1.0 = all key fields extracted without ambiguity
- 0.7-0.9 = most fields extracted, minor gaps
- 0.4-0.6 = partial extraction (scanned/image PDF)
- < 0.4 = poor extraction, flag for manual review

## After extraction

Always call `computeRatios(bs, is, cf, sharesOutstanding)` from `bctc-schema.ts` to populate the `ratios` field automatically.
