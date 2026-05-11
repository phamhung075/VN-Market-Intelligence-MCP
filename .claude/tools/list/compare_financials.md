# compare_financials

**Category:** News-Analysis / Comparison

**Module:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/compareTools.ts`

## Purpose

Deep BCTC (Financial Report) comparison across multiple stocks. Shows revenue trends, profitability metrics, growth rates, and balance sheet ratios. Useful for fundamental stock selection and sector rotation analysis.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `stocks` | array | Yes | — | List of 2-5 stock codes for comparison |
| `metric` | string | No | all | Specific metric filter: 'revenue', 'profit', 'pe', 'roe', 'debt', or 'all' |
| `periods` | number | No | 4 | Number of prior periods to include (1-8, typically quarters) |

## Return Format

```
Financial Comparison — VNM, VCB, HPG (4 periods, latest first)

─── VNM (Latest period: Q1-2026) ───
  Net Revenue:      42,850 B VND (YoY: +8.2%)
  Gross Profit:     12,450 B VND (margin: 29.0%)
  Net Profit:       6,350 B VND (margin: 14.8%)
  P/E Ratio:        18.5x
  ROE:              12.3%
  Debt/Equity:      0.42

─── VCB (Latest period: Q1-2026) ───
  Net Revenue:      28,500 B VND (YoY: +5.1%)
  Gross Profit:     15,200 B VND (margin: 53.3%)
  Net Profit:       9,850 B VND (margin: 34.6%)
  P/E Ratio:        12.1x
  ROE:              15.8%
  Debt/Equity:      0.28

─── HPG (Latest period: Q1-2026) ───
  Net Revenue:      35,200 B VND (YoY: -2.1%)
  Gross Profit:     7,840 B VND (margin: 22.3%)
  Net Profit:       2,800 B VND (margin: 7.9%)
  P/E Ratio:        9.3x
  ROE:              18.2%
  Debt/Equity:      0.65

Summary:
  Growth: VNM (+8.2%) > VCB (+5.1%) > HPG (-2.1%)
  Profitability: VCB (34.6% margin) > VNM (14.8%) > HPG (7.9%)
  Valuation: HPG (9.3x P/E) < VCB (12.1x) < VNM (18.5x)
  Leverage: VCB (0.28x) < VNM (0.42x) < HPG (0.65x)
```

## Metrics Available

| Metric | Definition |
|--------|-----------|
| **Net Revenue** | Total sales (million VND) with YoY change % |
| **Gross Profit** | Revenue minus cost of goods sold (margin %) |
| **Net Profit** | Bottom-line earnings (net margin %) |
| **P/E Ratio** | Price-to-earnings valuation (latest market price) |
| **ROE** | Return on equity (profit / shareholder equity %) |
| **Debt/Equity** | Financial leverage ratio |

## Use Cases

- **Report Analyzer** deep-dives into peer fundamental metrics
- **Financial Analyst** compares BCTC across watchlist for value opportunities
- **Digest & Predict** includes fundamental trends in monthly analysis
- **Market Watcher** correlates financial health with technical setup

## Data Sources

- `financial_reports` table (sorted by sort_key DESC per stock)
- Latest metrics from most recent report period
- Historical comparison across up to 8 prior quarters
- YoY calculation from prior-year equivalent period

## Related Tools

- `compare_stocks` — quick metric overview
- `get_bctc_full` — detailed single-stock financial data
- `get_sector_comparison` — sector aggregates

## Notes

- Accepts 2-5 stocks; rejects >5 or <2
- Revenue/profit in billion VND (B = 10^9)
- YoY % calculated vs. same period prior year
- Margins shown as percentages (profit / revenue)
- Debt/Equity is total debt / total equity
- Missing data shows "—" in output
- Latest period determined by MAX(sort_key) per stock
- Plain text format for consistency with system
