# Tool Group: financial-reports (mcp-server)

**Module path:** `src/interface/mcp/tools/financial-reports/`
**Scheduler:** `src/scheduler/financial-reports/` (2 jobs)
**Domain services:** `src/domain/services/financial-reports/` — balanceSheetExtractor, incomeStatementExtractor, cashFlowExtractor, ratioComputer (22 ratios), periodDeltaComputer (QoQ/YoY), bctcValidator, earningsCalendar, priceNewsValidator

Individual tool signatures: `.claude/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `get_bctc_full` | Full BCTC financial report for a ticker + period | ticker, period | market.db (financial_reports) |
| `list_stored_pdfs` | List all stored BCTC PDF reports | ticker? | market.db (financial_reports) |
| `get_earnings_calendar` | Upcoming + recent earnings filing dates | lookback_days | market.db (financial_reports) |
| `compare_financials` | Side-by-side financial comparison of 2 tickers | ticker1, ticker2, period | market.db |
| `trigger_bctc_vps_fetch` | Manually trigger VPS to fetch BCTC PDFs | — | vps-scripts/vn-bctc-fetch.service |

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `bctcOverdueCheckJob` | Daily | Alert on overdue BCTC filings (threshold from earnings calendar) |
| `bctcReparseJob` | On-demand / 6h | Re-parse previously stored PDFs with improved extractor |

---

## Invariants

1. Confidence threshold: `get_bctc_full` includes `low_confidence` flag when OCR confidence < 0.2.
2. `bctcValidator` checks accounting identities (Assets = Liabilities + Equity) before storing.
3. 22 financial ratios: P/E, P/B, ROE, ROA, EBITDA, D/E, current ratio, quick ratio, gross margin, operating margin, net margin, asset turnover, inventory turnover, debt service coverage, interest coverage, working capital, capex ratio, free cash flow, dividend yield, EPS, book value/share, enterprise value.
4. periodDeltaComputer: QoQ (quarter-on-quarter) and YoY (year-on-year) deltas computed on-the-fly.
5. VPS BCTC pipeline is PULL-based: VPS pulls queue (`bctc_vps_queue` table) → downloads → pushes back. MCP never initiates PDF downloads.
