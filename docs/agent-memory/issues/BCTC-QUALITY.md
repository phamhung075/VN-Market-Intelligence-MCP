---
agents: financial-analyst, developer, qa
trigger: bctc-fetch, pdf-parsing, data-validation
---

# BCTC Data Quality Issues

## Critical Parsing Errors (2026-04-22)

### VEA Q4-2025 (Automotive)
**Issue**: Impossible profit margins in parsed data
- Net Revenue: 259.9B VND
- Operating Profit: 858.5B VND (claimed 330.3% margin)
- Net Profit: 7,188B VND (claimed 2765.6% margin)
- **Root cause**: Likely decimal place or scale parsing error. Operating profit should NOT exceed revenue.
- **Detection**: Operating margin > 100% is mathematically impossible
- **Impact**: Cannot rely on P/L figures for VEA Q4-2025. Affects ROE/ROA calculations.
- **Confidence**: 88% (system already flagged moderate confidence)

### VNM Q4-2025 (Retail - Vinamilk)
**Issue**: Zero profit despite strong revenue
- Net Revenue: 63,645.9B VND (reasonable for major dairy company)
- Operating Profit: 0B VND (0.0% margin - WRONG)
- Net Profit: 0B VND (0.0% margin - WRONG)
- EPS: 2.025 VND (contradicts zero profit)
- D/E calculation: Net Debt/EBITDA = -74786654952.96x (division by zero on EBITDA)
- **Root cause**: Income statement parsing likely failed to extract operating profit. May be OCR failure on consolidated vs. standalone statements.
- **Detection**: (operatingProfit === 0 && grossProfit > 0 && netRevenue > threshold)
- **Impact**: Cannot use profitability ratios for VNM. Q4-2025 analysis unreliable.
- **Confidence**: 69% (system flagged lower confidence)
- **Note**: VNM sentiment data shows BULLISH (+1.00 slope) over 30 days, suggesting real positive fundamentals exist but weren't parsed.

## Reporting Compliance Issue
- **Deadline**: 30/03/2026 (HOSE) / 14/04/2026 (banks)
- **As of 2026-04-22**: 29/31 watchlist stocks are OVERDUE
- **Filed**: Only VEA (04/21) + VNM (04/21)
- **Missing**: 23 days past deadline for most companies
- **Severity**: CRITICAL - suggests SSC data feed may be stalled or servers not ingesting late filings

## Prevention Measures
1. For financial metrics: Validate profit margin < 100% before accepting income statement data
2. For zero profit with positive gross profit: Flag as likely OCR/parsing failure
3. For EBITDA division operations: Handle zero EBITDA explicitly (return N/A, not Inf)
4. Implement cross-check: If BCTC confidence < 70% AND multiple profit fields = 0, mark data as UNRELIABLE
5. Monitor SSC filing lag: If >20 reports overdue, alert dev team to check VPS data pipeline
