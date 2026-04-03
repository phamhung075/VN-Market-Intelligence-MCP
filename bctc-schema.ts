/**
 * VN Market Intelligence MCP
 * ──────────────────────────────────────────────────────────────────────────
 * BCTC Financial Report — Complete Data Model
 *
 * Covers:
 *  - Bảng cân đối kế toán     (Balance Sheet)
 *  - Báo cáo KQHĐKD           (Income Statement)
 *  - Báo cáo lưu chuyển tiền  (Cash Flow)
 *  - Chỉ số tài chính tính toán (Computed Ratios)
 *  - Delta QoQ / YoY           (Period Comparisons)
 *  - Chart data series         (For analytics & graphics)
 *  - SQLite schema             (DDL at bottom of file)
 * ──────────────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS & BASE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Exchange     = 'HOSE' | 'HNX' | 'UPCOM'
export type AuditStatus  = 'audited' | 'reviewed' | 'unaudited'
export type PeriodType   = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'H1' | 'H2' | 'ANNUAL'
export type Outlook      = 'positive' | 'neutral' | 'negative' | 'mixed'

export type DomainType =
  | 'oil_gas'          // GAS, PVD, PVS, OIL
  | 'banking'          // VCB, BID, CTG, TCB, VPB
  | 'real_estate'      // VIC, NVL, PDR, KDH
  | 'steel'            // HPG, HSG, NKG
  | 'aviation'         // HVN, VJC
  | 'retail'           // MWG, FRT, DGW
  | 'tech'             // FPT, CMG
  | 'utilities'        // REE, PC1, POW
  | 'agriculture'      // HAG, VHC, ANV
  | 'insurance'        // BVH, PVI
  | 'securities'       // SSI, VND, HCM
  | 'pharma'           // DHG, IMP, DMC (legacy alias)
  | 'pharmaceutical'   // DHG, IMP, DBD, PME, TRA, OPC (Sprint 044)
  | 'logistics'        // GMD, STG, VTP
  | 'gold_mining'      // PNJ, SJC-related
  | 'automotive'       // VEA (VEAM — Honda/Toyota/Ford JV), SVC, HHS
  | 'construction'     // HHV, CTD, VCG, HBC — infrastructure CAPEX (task 250)
  | 'energy'           // GEG, REE, PC1 — renewable energy projects (task 250)
  | 'other'

// ═══════════════════════════════════════════════════════════════════════════
// PERIOD
// ═══════════════════════════════════════════════════════════════════════════

export interface FiscalPeriod {
  year: number
  quarter: 1 | 2 | 3 | 4 | null   // null = annual or semi-annual
  periodType: PeriodType
  startDate: string                 // ISO date "2024-01-01"
  endDate: string                   // ISO date "2024-03-31"
  /** Sortable key: "2024-Q1", "2024-ANNUAL" — used for time-series ordering */
  sortKey: string
}

/** Helper: build a FiscalPeriod from year + quarter (null = annual) */
export function buildPeriod(year: number, quarter: 1|2|3|4|null): FiscalPeriod {
  const qMap: Record<number, { type: PeriodType; start: string; end: string }> = {
    1: { type: 'Q1', start: `${year}-01-01`, end: `${year}-03-31` },
    2: { type: 'Q2', start: `${year}-04-01`, end: `${year}-06-30` },
    3: { type: 'Q3', start: `${year}-07-01`, end: `${year}-09-30` },
    4: { type: 'Q4', start: `${year}-10-01`, end: `${year}-12-31` },
  }
  if (quarter === null) {
    return { year, quarter: null, periodType: 'ANNUAL',
      startDate: `${year}-01-01`, endDate: `${year}-12-31`,
      sortKey: `${year}-ANNUAL` }
  }
  // quarter is typed as 1|2|3|4 so qMap lookup is always defined
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const q = qMap[quarter]!
  return { year, quarter, periodType: q.type,
    startDate: q.start, endDate: q.end,
    sortKey: `${year}-${q.type}` }
}

// ═══════════════════════════════════════════════════════════════════════════
// BALANCE SHEET — Bảng cân đối kế toán
// All values in million VND (triệu đồng)
// ═══════════════════════════════════════════════════════════════════════════

export interface CurrentAssets {
  cash: number                      // I. Tiền và tương đương tiền
  shortTermInvestments: number      // II. Đầu tư tài chính ngắn hạn
  accountsReceivable: number        // III. Phải thu ngắn hạn
  inventory: number                 // IV. Hàng tồn kho
  otherCurrentAssets: number        // V. Tài sản ngắn hạn khác
  total: number                     // TỔNG TÀI SẢN NGẮN HẠN
}

export interface NonCurrentAssets {
  longTermReceivables: number       // I. Phải thu dài hạn
  fixedAssets: number               // II. Tài sản cố định (tangible + intangible)
  investmentProperty: number        // III. Bất động sản đầu tư
  longTermInvestments: number       // IV. Đầu tư tài chính dài hạn
  goodwill: number                  // Lợi thế thương mại
  otherLongTermAssets: number       // V. Tài sản dài hạn khác
  total: number                     // TỔNG TÀI SẢN DÀI HẠN
}

export interface CurrentLiabilities {
  shortTermDebt: number             // Vay và nợ thuê tài chính ngắn hạn
  accountsPayable: number           // Phải trả người bán ngắn hạn
  advancesFromCustomers: number     // Người mua trả tiền trước
  taxPayable: number                // Thuế và các khoản phải nộp NN
  payablesToEmployees: number       // Phải trả người lao động
  otherCurrentLiabilities: number
  total: number                     // TỔNG NỢ NGẮN HẠN
}

export interface LongTermLiabilities {
  longTermDebt: number              // Vay và nợ thuê tài chính dài hạn
  deferredTaxLiabilities: number    // Thuế TNDN hoãn lại
  otherLongTermLiabilities: number
  total: number                     // TỔNG NỢ DÀI HẠN
}

export interface Equity {
  shareCapital: number              // Vốn góp của chủ sở hữu
  sharePremium: number              // Thặng dư vốn cổ phần
  treasuryShares: number            // Cổ phiếu quỹ (negative)
  retainedEarnings: number          // Lợi nhuận sau thuế chưa phân phối
  otherEquityFunds: number          // Quỹ khác thuộc VCSH
  minorityInterest: number          // Lợi ích cổ đông không kiểm soát
  total: number                     // TỔNG VỐN CHỦ SỞ HỮU
}

export interface BalanceSheet {
  currentAssets: CurrentAssets
  nonCurrentAssets: NonCurrentAssets
  totalAssets: number               // TỔNG TÀI SẢN

  currentLiabilities: CurrentLiabilities
  longTermLiabilities: LongTermLiabilities
  totalLiabilities: number          // TỔNG NỢ PHẢI TRẢ

  equity: Equity
  totalLiabilitiesAndEquity: number // TỔNG NGUỒN VỐN (= totalAssets)
}

// ═══════════════════════════════════════════════════════════════════════════
// INCOME STATEMENT — Báo cáo kết quả hoạt động kinh doanh
// All values in million VND — cumulative for the period
// ═══════════════════════════════════════════════════════════════════════════

export interface IncomeStatement {
  grossRevenue: number              // Doanh thu bán hàng và CCDV
  revenueDeductions: number         // Các khoản giảm trừ doanh thu
  netRevenue: number                // Doanh thu thuần (= grossRevenue - deductions)
  cogs: number                      // Giá vốn hàng bán
  grossProfit: number               // Lợi nhuận gộp

  financialIncome: number           // Doanh thu hoạt động tài chính
  financialExpenses: number         // Chi phí tài chính
  interestExpenses: number          //   Trong đó: chi phí lãi vay
  shareOfAssociates: number         // Phần lãi/lỗ trong CT liên kết

  sellingExpenses: number           // Chi phí bán hàng
  adminExpenses: number             // Chi phí quản lý doanh nghiệp

  operatingProfit: number           // Lợi nhuận thuần từ HĐKD (EBIT approx)
  otherIncome: number               // Thu nhập khác
  otherExpenses: number             // Chi phí khác
  otherProfit: number               // Lợi nhuận khác

  profitBeforeTax: number           // Tổng LN trước thuế (EBT)
  incomeTaxCurrent: number          // Thuế TNDN hiện hành
  incomeTaxDeferred: number         // Thuế TNDN hoãn lại
  totalIncomeTax: number            // Tổng chi phí thuế TNDN

  netProfit: number                 // Lợi nhuận sau thuế TNDN
  minorityInterest: number          // Lợi ích cổ đông không kiểm soát
  netProfitParent: number           // LNST của cổ đông công ty mẹ

  eps: number                       // Lãi cơ bản trên cổ phiếu (VND)
  dilutedEps: number                // Lãi pha loãng trên cổ phiếu (VND)

  // Computed fields (calculated during parse)
  ebitda: number                    // EBITDA = EBIT + Depreciation & Amortization
  ebit: number                      // Approximation: operatingProfit
}

// ═══════════════════════════════════════════════════════════════════════════
// CASH FLOW — Báo cáo lưu chuyển tiền tệ
// All values in million VND
// ═══════════════════════════════════════════════════════════════════════════

export interface CashFlowStatement {
  // I. Hoạt động kinh doanh — Operating
  profitBeforeTax: number           // Lợi nhuận trước thuế
  depreciationAmortization: number  // Khấu hao TSCĐ và BĐSĐT
  workingCapitalChanges: number     // Thay đổi vốn lưu động
  interestPaid: number              // Tiền lãi vay đã trả
  incomeTaxPaid: number             // Thuế TNDN đã nộp
  operatingCF: number               // Lưu chuyển tiền từ HĐKD

  // II. Hoạt động đầu tư — Investing
  capex: number                     // Mua sắm TSCĐ (negative)
  proceedsFromAssetSales: number    // Thu từ thanh lý TSCĐ
  investmentPurchases: number       // Mua các khoản đầu tư TC (negative)
  investmentProceeds: number        // Thu hồi đầu tư TC
  dividendsReceived: number         // Cổ tức và lãi tiền gửi đã thu
  investingCF: number               // Lưu chuyển tiền từ HĐ đầu tư

  // III. Hoạt động tài chính — Financing
  proceedsFromDebt: number          // Tiền vay nhận được
  debtRepayments: number            // Tiền trả nợ gốc vay (negative)
  proceedsFromShareIssuance: number // Thu từ phát hành cổ phiếu
  dividendsPaid: number             // Cổ tức đã trả (negative)
  financingCF: number               // Lưu chuyển tiền từ HĐ tài chính

  netCashFlow: number               // Lưu chuyển tiền thuần trong kỳ
  beginningCash: number             // Tiền và tương đương tiền đầu kỳ
  endingCash: number                // Tiền và tương đương tiền cuối kỳ

  // Computed
  freeCashFlow: number              // FCF = operatingCF + capex (capex is negative)
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTED FINANCIAL RATIOS
// ═══════════════════════════════════════════════════════════════════════════

export interface FinancialRatios {
  // ── Profitability ─────────────────────────────────────────────────────
  grossMarginPct: number            // Gross Profit / Net Revenue × 100
  operatingMarginPct: number        // Operating Profit / Net Revenue × 100
  netMarginPct: number              // Net Profit / Net Revenue × 100
  ebitdaMarginPct: number           // EBITDA / Net Revenue × 100

  roe: number                       // Net Profit / Avg Equity × 100 (%)
  roa: number                       // Net Profit / Avg Total Assets × 100 (%)
  roic: number                      // NOPAT / (Equity + Net Debt) × 100 (%)

  // ── Liquidity ─────────────────────────────────────────────────────────
  currentRatio: number              // Current Assets / Current Liabilities
  quickRatio: number                // (Current Assets - Inventory) / Current Liabilities
  cashRatio: number                 // Cash / Current Liabilities

  // ── Leverage / Solvency ──────────────────────────────────────────────
  debtToEquity: number              // Total Debt / Equity
  debtToAssets: number              // Total Liabilities / Total Assets
  netDebt: number                   // Short+Long Term Debt - Cash (million VND)
  netDebtToEbitda: number           // Net Debt / EBITDA
  interestCoverageRatio: number     // EBIT / Interest Expenses

  // ── Efficiency ────────────────────────────────────────────────────────
  assetTurnover: number             // Net Revenue / Avg Total Assets
  inventoryTurnover: number         // COGS / Avg Inventory
  inventoryDays: number             // 365 / Inventory Turnover
  receivablesTurnover: number       // Net Revenue / Avg Accounts Receivable
  receivablesDays: number           // 365 / Receivables Turnover
  payablesTurnover: number          // COGS / Avg Accounts Payable
  payablesDays: number              // 365 / Payables Turnover
  cashConversionCycle: number       // Inventory Days + Receivable Days - Payable Days

  // ── Per Share ─────────────────────────────────────────────────────────
  eps: number                       // Earnings Per Share (VND) — from income stmt
  bvps: number                      // Book Value Per Share (VND)
  revenuePerShare: number           // Revenue Per Share (VND)
  fcfPerShare: number               // Free Cash Flow Per Share (VND)

  // ── Valuation (requires market data) ─────────────────────────────────
  pe: number | null                 // Price / EPS — null if no market price
  pb: number | null                 // Price / BVPS
  ps: number | null                 // Price / Revenue Per Share
  evToEbitda: number | null         // Enterprise Value / EBITDA
  dividendYieldPct: number | null   // Dividend Per Share / Price × 100
}

// ═══════════════════════════════════════════════════════════════════════════
// PERIOD DELTA — For QoQ and YoY comparison
// ═══════════════════════════════════════════════════════════════════════════

export interface ValueChange {
  current: number
  previous: number
  changeAbsolute: number
  changePct: number | null          // null if previous = 0
}

export interface RatioChange {
  current: number
  previous: number
  changePP: number                  // change in percentage points
}

export interface PeriodDelta {
  comparedTo: string                // sortKey of previous period e.g. "2023-Q1"
  deltaType: 'QoQ' | 'YoY'

  // Income Statement deltas
  netRevenue: ValueChange
  grossProfit: ValueChange
  operatingProfit: ValueChange
  netProfit: ValueChange
  ebitda: ValueChange
  eps: ValueChange

  // Balance Sheet deltas
  totalAssets: ValueChange
  equity: ValueChange
  totalDebt: ValueChange
  cash: ValueChange

  // Ratio deltas (in percentage points)
  grossMarginPP: RatioChange
  netMarginPP: RatioChange
  roePP: RatioChange
  debtToEquityPP: RatioChange

  // Cash Flow deltas
  operatingCF: ValueChange
  freeCashFlow: ValueChange
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKET DATA at report publication date
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketDataSnapshot {
  price: number                     // Giá cổ phiếu ngày công bố (VND)
  priceDate: string                 // ISO date
  marketCap: number                 // Vốn hóa thị trường (million VND)
  sharesOutstanding: number         // Số cổ phiếu đang lưu hành
  floatShares: number               // Số cổ phiếu tự do (free float)
  pe: number                        // P/E tại ngày công bố
  pb: number                        // P/B tại ngày công bố
  dividendPerShare: number          // Cổ tức gần nhất (VND/CP)
}

// ═══════════════════════════════════════════════════════════════════════════
// AI ANALYSIS OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

export type FinancialSignal =
  | 'strong_revenue_growth'         // Doanh thu tăng mạnh (>20% YoY)
  | 'revenue_decline'               // Doanh thu giảm
  | 'margin_expansion'              // Biên lợi nhuận mở rộng
  | 'margin_compression'            // Biên lợi nhuận thu hẹp
  | 'strong_profit_growth'          // Lợi nhuận tăng mạnh
  | 'profit_decline'                // Lợi nhuận giảm
  | 'high_debt'                     // D/E > 2.0
  | 'debt_reduction'                // Trả nợ đáng kể
  | 'strong_cashflow'               // FCF dương và tăng
  | 'negative_cashflow'             // FCF âm
  | 'dividend_increase'             // Tăng cổ tức
  | 'beat_expectations'             // Kết quả vượt kỳ vọng
  | 'miss_expectations'             // Kết quả dưới kỳ vọng
  | 'inventory_buildup'             // Tồn kho tăng bất thường
  | 'receivables_concern'           // Phải thu tăng nhanh hơn doanh thu
  | 'one_time_item'                 // Có mục bất thường ảnh hưởng lợi nhuận

export interface AIAnalysis {
  summary: string                   // Tóm tắt kết quả kỳ này (200–400 từ)
  keyStrengths: string[]            // Điểm mạnh nổi bật
  keyWeaknesses: string[]           // Điểm yếu cần chú ý
  signals: FinancialSignal[]        // Tín hiệu đầu tư phát hiện
  outlook: Outlook                  // Nhận định chung
  watchPoints: string[]             // Điểm cần theo dõi kỳ tới
  generatedAt: string               // ISO timestamp
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART DATA — Ready-to-render time series
// ═══════════════════════════════════════════════════════════════════════════

export interface ChartDataPoint {
  periodLabel: string               // "Q1 2024", "2023", "H1 2025"
  sortKey: string                   // "2024-Q1" — for ordering
  value: number
  yoyChangePct: number | null       // % vs same period last year
  qoqChangePct: number | null       // % vs previous quarter
}

export interface ChartSeries {
  actionCode: string
  metricKey: string                 // "netRevenue", "roe", "netMarginPct"
  label: string                     // "Doanh thu thuần"
  unit: string                      // "tỷ VND" | "%" | "VND/CP" | "x"
  scaleUnit: number                 // divide stored value by this: 1000 → display in tỷ
  data: ChartDataPoint[]
}

/**
 * Pre-built chart definitions — call buildChartSeries() with reports array
 * to generate all standard charts for a given action.
 */
export type StandardChart =
  | 'revenue_trend'                 // Doanh thu thuần theo quý/năm
  | 'profit_trend'                  // Lợi nhuận gộp + LNST theo quý/năm
  | 'margin_trend'                  // Gross / Operating / Net margin (%)
  | 'roe_roa_trend'                 // ROE vs ROA (%)
  | 'debt_structure'                // D/E, Net Debt/EBITDA
  | 'cashflow_comparison'           // Operating CF vs Investing CF vs FCF
  | 'eps_trend'                     // EPS & diluted EPS
  | 'liquidity_trend'               // Current ratio & Quick ratio
  | 'asset_structure'               // Composition of assets over time
  | 'revenue_profit_yoy'            // YoY growth: revenue + profit (bar)

/** Extract chart series from an ordered array of FinancialReport */
export function buildChartSeries(
  reports: FinancialReport[],
  chart: StandardChart
): ChartSeries {
  const sorted = [...reports].sort((a, b) =>
    a.period.sortKey.localeCompare(b.period.sortKey)
  )
  const code = sorted[0]?.actionCode ?? 'N/A'

  const seriesMap: Record<StandardChart, ChartSeries> = {
    revenue_trend: {
      actionCode: code, metricKey: 'netRevenue',
      label: 'Doanh thu thuần', unit: 'tỷ VND', scaleUnit: 1000,
      data: sorted.map((r, i) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: r.incomeStatement.netRevenue / 1000,
        yoyChangePct: calcYoY(sorted, i, 'netRevenue'),
        qoqChangePct: calcQoQ(sorted, i, 'netRevenue'),
      }))
    },
    profit_trend: {
      actionCode: code, metricKey: 'netProfit',
      label: 'Lợi nhuận sau thuế', unit: 'tỷ VND', scaleUnit: 1000,
      data: sorted.map((r, i) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: r.incomeStatement.netProfit / 1000,
        yoyChangePct: calcYoY(sorted, i, 'netProfit'),
        qoqChangePct: calcQoQ(sorted, i, 'netProfit'),
      }))
    },
    margin_trend: {
      actionCode: code, metricKey: 'netMarginPct',
      label: 'Biên lợi nhuận ròng', unit: '%', scaleUnit: 1,
      data: sorted.map((r, i) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: r.ratios.netMarginPct,
        yoyChangePct: calcYoY(sorted, i, 'netMarginPct', true),
        qoqChangePct: calcQoQ(sorted, i, 'netMarginPct', true),
      }))
    },
    roe_roa_trend: {
      actionCode: code, metricKey: 'roe',
      label: 'ROE', unit: '%', scaleUnit: 1,
      data: sorted.map((r, i) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: r.ratios.roe,
        yoyChangePct: calcYoY(sorted, i, 'roe', true),
        qoqChangePct: calcQoQ(sorted, i, 'roe', true),
      }))
    },
    eps_trend: {
      actionCode: code, metricKey: 'eps',
      label: 'EPS', unit: 'VND/CP', scaleUnit: 1,
      data: sorted.map((r, i) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: r.incomeStatement.eps,
        yoyChangePct: calcYoY(sorted, i, 'eps'),
        qoqChangePct: calcQoQ(sorted, i, 'eps'),
      }))
    },
    debt_structure: {
      actionCode: code, metricKey: 'debtToEquity',
      label: 'D/E Ratio', unit: 'x', scaleUnit: 1,
      data: sorted.map((r, i) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: r.ratios.debtToEquity,
        yoyChangePct: null,
        qoqChangePct: null,
      }))
    },
    cashflow_comparison: {
      actionCode: code, metricKey: 'operatingCF',
      label: 'Tiền từ HĐKD', unit: 'tỷ VND', scaleUnit: 1000,
      data: sorted.map((r) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: r.cashFlow.operatingCF / 1000,
        yoyChangePct: null,
        qoqChangePct: null,
      }))
    },
    liquidity_trend: {
      actionCode: code, metricKey: 'currentRatio',
      label: 'Current Ratio', unit: 'x', scaleUnit: 1,
      data: sorted.map((r) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: r.ratios.currentRatio,
        yoyChangePct: null,
        qoqChangePct: null,
      }))
    },
    asset_structure: {
      actionCode: code, metricKey: 'totalAssets',
      label: 'Tổng tài sản', unit: 'tỷ VND', scaleUnit: 1000,
      data: sorted.map((r) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: r.balanceSheet.totalAssets / 1000,
        yoyChangePct: null,
        qoqChangePct: null,
      }))
    },
    revenue_profit_yoy: {
      actionCode: code, metricKey: 'netRevenue_yoy',
      label: 'Tăng trưởng doanh thu YoY', unit: '%', scaleUnit: 1,
      data: sorted.map((r, i) => ({
        periodLabel: r.period.sortKey,
        sortKey: r.period.sortKey,
        value: calcYoY(sorted, i, 'netRevenue') ?? 0,
        yoyChangePct: null,
        qoqChangePct: null,
      }))
    },
  }

  return seriesMap[chart]
}

// Internal helpers for chart calculations
type ISKey = keyof Pick<IncomeStatement,
  'netRevenue' | 'grossProfit' | 'netProfit' | 'eps' | 'ebitda'>
type RatioKey = keyof Pick<FinancialRatios,
  'roe' | 'roa' | 'netMarginPct' | 'grossMarginPct'>

function getMetricValue(r: FinancialReport, key: string): number {
  if (key in r.incomeStatement) return (r.incomeStatement as any)[key]
  if (key in r.ratios) return (r.ratios as any)[key]
  return 0
}

function calcYoY(
  sorted: FinancialReport[], i: number, key: string, isRatio = false
): number | null {
  if (i === 0) return null
  // sorted[i] is always defined because i > 0 and caller bounds-checks
  const current = sorted[i]!
  const curr = getMetricValue(current, key)
  // Find same quarter/type previous year
  const prev = sorted.find(r =>
    r.period.year === current.period.year - 1 &&
    r.period.quarter === current.period.quarter
  )
  if (!prev) return null
  const prevVal = getMetricValue(prev, key)
  if (prevVal === 0) return null
  if (isRatio) return curr - prevVal // percentage points
  return ((curr - prevVal) / Math.abs(prevVal)) * 100
}

function calcQoQ(
  sorted: FinancialReport[], i: number, key: string, isRatio = false
): number | null {
  if (i === 0) return null
  // sorted[i] and sorted[i-1] are always defined because i > 0 and caller bounds-checks
  const curr = getMetricValue(sorted[i]!, key)
  const prevVal = getMetricValue(sorted[i - 1]!, key)
  if (prevVal === 0) return null
  if (isRatio) return curr - prevVal
  return ((curr - prevVal) / Math.abs(prevVal)) * 100
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FinancialReport — Root entity (stored in SQLite + LanceDB)
// ═══════════════════════════════════════════════════════════════════════════

export interface FinancialReport {
  // ── Identity ────────────────────────────────────────────────────────────
  id: string                        // UUID v4
  actionCode: string                // "VCB", "HPG", "GAS"
  companyName: string               // "Ngân hàng TMCP Ngoại thương Việt Nam"
  exchange: Exchange
  domain: DomainType

  // ── Period ──────────────────────────────────────────────────────────────
  period: FiscalPeriod

  // ── Source ──────────────────────────────────────────────────────────────
  source: {
    sscUrl: string                  // URL on congbothongtin.ssc.gov.vn
    pdfPath: string | null          // Local path after download
    publishedAt: string             // ISO — date SSC published this report
    parsedAt: string                // ISO — date we extracted it
    auditStatus: AuditStatus
    auditor: string | null          // "KPMG Vietnam", "Deloitte Vietnam"...
    reportLanguage: 'vi' | 'en' | 'both'
    pageCount: number | null
    extractionConfidence: number    // 0-1: how reliable was PDF parsing
  }

  // ── Financial Statements ────────────────────────────────────────────────
  balanceSheet: BalanceSheet
  incomeStatement: IncomeStatement
  cashFlow: CashFlowStatement
  ratios: FinancialRatios

  // ── Period Comparisons ──────────────────────────────────────────────────
  yoyDelta: PeriodDelta | null      // vs same period previous year
  qoqDelta: PeriodDelta | null      // vs previous quarter (Q reports only)

  // ── Market Context at Publication ───────────────────────────────────────
  marketData: MarketDataSnapshot | null

  // ── AI Analysis ─────────────────────────────────────────────────────────
  aiAnalysis: AIAnalysis | null     // populated by Claude after parse

  // ── RAG ─────────────────────────────────────────────────────────────────
  embedding: number[] | null        // 384-dim multilingual-MiniLM vector
  /** Concatenated text used to generate embedding: summary + signals + ratios snapshot */
  embeddingText: string

  // ── Raw extracted notes ─────────────────────────────────────────────────
  notesRawText: string | null       // Thuyết minh BCTC full text from PDF
}

// ═══════════════════════════════════════════════════════════════════════════
// RATIO COMPUTATION HELPER
// ═══════════════════════════════════════════════════════════════════════════

/** Compute all financial ratios from parsed statements. Pass previous period for avg-based ratios. */
export function computeRatios(
  bs: BalanceSheet,
  is: IncomeStatement,
  cf: CashFlowStatement,
  sharesOutstanding: number,
  prevBs?: BalanceSheet,
  marketPrice?: number
): FinancialRatios {
  const avgAssets = prevBs ? (bs.totalAssets + prevBs.totalAssets) / 2 : bs.totalAssets
  const avgEquity = prevBs ? (bs.equity.total + prevBs.equity.total) / 2 : bs.equity.total
  const avgInventory = prevBs
    ? (bs.currentAssets.inventory + prevBs.currentAssets.inventory) / 2
    : bs.currentAssets.inventory
  const avgReceivables = prevBs
    ? (bs.currentAssets.accountsReceivable + prevBs.currentAssets.accountsReceivable) / 2
    : bs.currentAssets.accountsReceivable
  const avgPayables = prevBs
    ? (bs.currentLiabilities.accountsPayable + prevBs.currentLiabilities.accountsPayable) / 2
    : bs.currentLiabilities.accountsPayable

  const totalDebt = bs.currentLiabilities.shortTermDebt + bs.longTermLiabilities.longTermDebt
  const netDebt = totalDebt - bs.currentAssets.cash
  const bvps = sharesOutstanding > 0 ? bs.equity.total / sharesOutstanding : 0
  const revenuePerShare = sharesOutstanding > 0 ? is.netRevenue / sharesOutstanding : 0
  const fcfPerShare = sharesOutstanding > 0 ? cf.freeCashFlow / sharesOutstanding : 0

  const pe = (marketPrice && is.eps > 0) ? marketPrice / is.eps : null
  const pb = (marketPrice && bvps > 0) ? marketPrice / bvps : null
  const ps = (marketPrice && revenuePerShare > 0) ? marketPrice / revenuePerShare : null
  const evToEbitda = (is.ebitda > 0 && marketPrice && sharesOutstanding > 0)
    ? (marketPrice * sharesOutstanding + netDebt) / is.ebitda
    : null

  const safe = (n: number, d: number) => d !== 0 ? n / d : 0

  return {
    grossMarginPct:       safe(is.grossProfit, is.netRevenue) * 100,
    operatingMarginPct:   safe(is.operatingProfit, is.netRevenue) * 100,
    netMarginPct:         safe(is.netProfit, is.netRevenue) * 100,
    ebitdaMarginPct:      safe(is.ebitda, is.netRevenue) * 100,

    roe:   safe(is.netProfit, avgEquity) * 100,
    roa:   safe(is.netProfit, avgAssets) * 100,
    roic:  0, // requires NOPAT — compute separately if needed

    currentRatio:  safe(bs.currentAssets.total, bs.currentLiabilities.total),
    quickRatio:    safe(bs.currentAssets.total - bs.currentAssets.inventory, bs.currentLiabilities.total),
    cashRatio:     safe(bs.currentAssets.cash, bs.currentLiabilities.total),

    debtToEquity:          safe(totalDebt, bs.equity.total),
    debtToAssets:          safe(bs.totalLiabilities, bs.totalAssets),
    netDebt,
    netDebtToEbitda:       is.ebitda > 0 ? safe(netDebt, is.ebitda) : 0,
    interestCoverageRatio: safe(is.ebit, is.interestExpenses),

    assetTurnover:         safe(is.netRevenue, avgAssets),
    inventoryTurnover:     safe(is.cogs, avgInventory),
    inventoryDays:         avgInventory > 0 ? 365 / safe(is.cogs, avgInventory) : 0,
    receivablesTurnover:   safe(is.netRevenue, avgReceivables),
    receivablesDays:       avgReceivables > 0 ? 365 / safe(is.netRevenue, avgReceivables) : 0,
    payablesTurnover:      safe(is.cogs, avgPayables),
    payablesDays:          avgPayables > 0 ? 365 / safe(is.cogs, avgPayables) : 0,
    cashConversionCycle:   0, // computed after the above

    eps:              is.eps,
    bvps,
    revenuePerShare,
    fcfPerShare,

    pe, pb, ps, evToEbitda,
    dividendYieldPct: null, // set separately when dividend data is available
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SQLITE DDL SCHEMA
// ═══════════════════════════════════════════════════════════════════════════
//
// Usage:
//   import { SQLITE_DDL } from './bctc-schema'
//   db.exec(SQLITE_DDL)
//
// Design choices:
//  - Main scalar fields are columns → fast indexed queries for time-series
//  - Full nested objects (balanceSheet, cashFlow, ratios) stored as JSON
//    → easy to retrieve complete report in one row
//  - Separate view for charting queries
// ─────────────────────────────────────────────────────────────────────────

export const SQLITE_DDL = `

-- ── Main financial reports table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_reports (
  id                      TEXT PRIMARY KEY,
  action_code             TEXT NOT NULL,
  company_name            TEXT NOT NULL,
  exchange                TEXT NOT NULL,   -- HOSE | HNX | UPCOM
  domain                  TEXT NOT NULL,

  -- Period (indexed for time-series queries)
  period_year             INTEGER NOT NULL,
  period_quarter          INTEGER,         -- NULL for annual reports
  period_type             TEXT NOT NULL,   -- Q1 | Q2 | Q3 | Q4 | H1 | H2 | ANNUAL
  period_start            TEXT NOT NULL,   -- ISO date
  period_end              TEXT NOT NULL,   -- ISO date
  sort_key                TEXT NOT NULL,   -- "2024-Q1" — unique per action+period

  -- Source metadata
  ssc_url                 TEXT,
  ssc_doc_id              TEXT,            -- unique document identifier from SSC portal listing
  pdf_path                TEXT,
  published_at            TEXT,
  parsed_at               TEXT NOT NULL,
  audit_status            TEXT,            -- audited | reviewed | unaudited
  auditor                 TEXT,
  extraction_confidence   REAL DEFAULT 1.0,

  -- Income Statement (key scalars for fast queries)
  net_revenue             REAL,            -- million VND
  gross_profit            REAL,
  operating_profit        REAL,
  ebitda                  REAL,
  profit_before_tax       REAL,
  net_profit              REAL,
  eps                     REAL,            -- VND/share
  diluted_eps             REAL,

  -- Balance Sheet (key scalars)
  total_assets            REAL,
  current_assets          REAL,
  cash                    REAL,
  inventory               REAL,
  total_liabilities       REAL,
  short_term_debt         REAL,
  long_term_debt          REAL,
  equity_total            REAL,

  -- Cash Flow (key scalars)
  operating_cf            REAL,
  investing_cf            REAL,
  financing_cf            REAL,
  capex                   REAL,
  free_cash_flow          REAL,

  -- Ratios (key scalars — all others in JSON)
  gross_margin_pct        REAL,
  operating_margin_pct    REAL,
  net_margin_pct          REAL,
  roe                     REAL,
  roa                     REAL,
  current_ratio           REAL,
  debt_to_equity          REAL,
  net_debt_to_ebitda      REAL,
  pe                      REAL,
  pb                      REAL,

  -- Full data as JSON (complete nested objects)
  balance_sheet_json      TEXT NOT NULL,   -- JSON BalanceSheet
  income_stmt_json        TEXT NOT NULL,   -- JSON IncomeStatement
  cash_flow_json          TEXT NOT NULL,   -- JSON CashFlowStatement
  ratios_json             TEXT NOT NULL,   -- JSON FinancialRatios

  -- Period deltas
  yoy_delta_json          TEXT,            -- JSON PeriodDelta | null
  qoq_delta_json          TEXT,            -- JSON PeriodDelta | null

  -- Market data
  market_data_json        TEXT,            -- JSON MarketDataSnapshot | null

  -- AI Analysis
  ai_summary              TEXT,
  ai_signals_json         TEXT,            -- JSON string[]
  ai_outlook              TEXT,            -- positive | neutral | negative | mixed
  ai_generated_at         TEXT,

  -- RAG
  embedding_text          TEXT,
  -- Note: embedding vector stored in LanceDB (not SQLite)

  -- Notes
  notes_raw_text          TEXT,

  UNIQUE(action_code, sort_key)
);

-- ── Indexes for time-series queries ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fr_action     ON financial_reports(action_code);
CREATE INDEX IF NOT EXISTS idx_fr_sort_key   ON financial_reports(action_code, sort_key);
CREATE INDEX IF NOT EXISTS idx_fr_period     ON financial_reports(period_year, period_quarter);
CREATE INDEX IF NOT EXISTS idx_fr_published  ON financial_reports(published_at);
CREATE INDEX IF NOT EXISTS idx_fr_domain     ON financial_reports(domain);

-- ── View: time-series for charts ──────────────────────────────────────────
CREATE VIEW IF NOT EXISTS v_chart_timeseries AS
SELECT
  action_code,
  sort_key                AS period,
  period_year             AS year,
  period_quarter          AS quarter,
  period_type,

  -- Revenue & Profit (tỷ VND = divide by 1000)
  ROUND(net_revenue / 1000.0, 2)         AS net_revenue_ty,
  ROUND(gross_profit / 1000.0, 2)        AS gross_profit_ty,
  ROUND(operating_profit / 1000.0, 2)    AS operating_profit_ty,
  ROUND(net_profit / 1000.0, 2)          AS net_profit_ty,
  ROUND(ebitda / 1000.0, 2)              AS ebitda_ty,
  ROUND(free_cash_flow / 1000.0, 2)      AS fcf_ty,

  -- Per share
  eps,
  diluted_eps,

  -- Margins (%)
  ROUND(gross_margin_pct, 2)             AS gross_margin_pct,
  ROUND(operating_margin_pct, 2)         AS operating_margin_pct,
  ROUND(net_margin_pct, 2)               AS net_margin_pct,

  -- Returns (%)
  ROUND(roe, 2)                          AS roe,
  ROUND(roa, 2)                          AS roa,

  -- Leverage
  ROUND(debt_to_equity, 3)               AS debt_to_equity,
  ROUND(net_debt_to_ebitda, 3)           AS net_debt_to_ebitda,
  ROUND(current_ratio, 3)                AS current_ratio,

  -- Balance
  ROUND(total_assets / 1000.0, 2)        AS total_assets_ty,
  ROUND(equity_total / 1000.0, 2)        AS equity_ty,
  ROUND(cash / 1000.0, 2)               AS cash_ty,

  -- Valuation
  pe,
  pb,

  -- Cash flows
  ROUND(operating_cf / 1000.0, 2)        AS operating_cf_ty,
  ROUND(capex / 1000.0, 2)               AS capex_ty,

  audit_status,
  published_at
FROM financial_reports
ORDER BY action_code, sort_key;

-- ── View: YoY comparison ──────────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS v_yoy_comparison AS
SELECT
  curr.action_code,
  curr.sort_key                          AS period,
  curr.period_type,
  curr.period_year                       AS curr_year,
  prev.period_year                       AS prev_year,

  -- Revenue YoY
  ROUND(curr.net_revenue / 1000.0, 2)    AS curr_revenue_ty,
  ROUND(prev.net_revenue / 1000.0, 2)    AS prev_revenue_ty,
  ROUND(
    CASE WHEN prev.net_revenue > 0
    THEN (curr.net_revenue - prev.net_revenue) / prev.net_revenue * 100
    ELSE NULL END, 2)                    AS revenue_yoy_pct,

  -- Net Profit YoY
  ROUND(curr.net_profit / 1000.0, 2)     AS curr_profit_ty,
  ROUND(prev.net_profit / 1000.0, 2)     AS prev_profit_ty,
  ROUND(
    CASE WHEN prev.net_profit > 0
    THEN (curr.net_profit - prev.net_profit) / prev.net_profit * 100
    ELSE NULL END, 2)                    AS profit_yoy_pct,

  -- EPS YoY
  curr.eps                               AS curr_eps,
  prev.eps                               AS prev_eps,
  ROUND(
    CASE WHEN prev.eps > 0
    THEN (curr.eps - prev.eps) / prev.eps * 100
    ELSE NULL END, 2)                    AS eps_yoy_pct,

  -- Margin delta (percentage points)
  ROUND(curr.net_margin_pct - prev.net_margin_pct, 2) AS net_margin_pp,
  ROUND(curr.gross_margin_pct - prev.gross_margin_pct, 2) AS gross_margin_pp,
  ROUND(curr.roe - prev.roe, 2)          AS roe_pp

FROM financial_reports curr
JOIN financial_reports prev
  ON  curr.action_code   = prev.action_code
  AND curr.period_quarter = prev.period_quarter     -- same quarter type
  AND curr.period_year   = prev.period_year + 1     -- previous year
ORDER BY curr.action_code, curr.sort_key;

`;

// ═══════════════════════════════════════════════════════════════════════════
// PARSE RESULT WRAPPER — returned by the SSC PDF parser
// ═══════════════════════════════════════════════════════════════════════════

export interface ParseResult {
  success: boolean
  report: Partial<FinancialReport>  // may be partial if extraction confidence < 0.7
  confidence: number                // 0-1 overall extraction confidence
  warnings: string[]                // fields that could not be extracted
  rawPdfText: string
}

/** Minimal empty report skeleton — fill in after parsing */
export function emptyReport(
  actionCode: string,
  exchange: Exchange,
  period: FiscalPeriod
): Partial<FinancialReport> {
  return {
    id: crypto.randomUUID(),
    actionCode,
    exchange,
    period,
    source: {
      sscUrl: '',
      pdfPath: null,
      publishedAt: new Date().toISOString(),
      parsedAt: new Date().toISOString(),
      auditStatus: 'unaudited',
      auditor: null,
      reportLanguage: 'vi',
      pageCount: null,
      extractionConfidence: 0,
    },
    yoyDelta: null,
    qoqDelta: null,
    marketData: null,
    aiAnalysis: null,
    embedding: null,
    embeddingText: '',
    notesRawText: null,
  }
}