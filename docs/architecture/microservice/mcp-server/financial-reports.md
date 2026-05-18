# Tool Group: financial-reports (mcp-server)

**Module path:** `src/interface/mcp/tools/financial-reports/`
**Scheduler:** `src/scheduler/financial-reports/` (2 cron jobs + 1 startup probe)
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
| `vnstockStartupProbe` | Once on startup (+90s delay) | Detects cold/stale vnstock_fetch_log (< 10 codes or > 7d old) → fires `runVnstockFundamentalsJob()`. Non-fatal. |

---

## Invariants

1. Confidence threshold: `get_bctc_full` includes `low_confidence` flag when OCR confidence < 0.2.
2. `bctcValidator` checks accounting identities (Assets = Liabilities + Equity) before storing.
3. 22 financial ratios: P/E, P/B, ROE, ROA, EBITDA, D/E, current ratio, quick ratio, gross margin, operating margin, net margin, asset turnover, inventory turnover, debt service coverage, interest coverage, working capital, capex ratio, free cash flow, dividend yield, EPS, book value/share, enterprise value.
4. periodDeltaComputer: QoQ (quarter-on-quarter) and YoY (year-on-year) deltas computed on-the-fly.
5. VPS BCTC pipeline is PULL-based: VPS pulls queue (`bctc_vps_queue` table) → downloads → pushes back. MCP never initiates PDF downloads.
6. `push-bctc-pdf` extraction: when VPS pushes a PDF via `POST /api/push-bctc-pdf`, extraction uses `triggerPushBctcExtraction` (`scheduler/financial-reports/pushBctcExtraction.ts`) — OCR via `extractAndStorePdfPagesWithRetry` + `pdfTextOverride` to `fetchParseAndStoreBctc`. Direct URL download is bypassed (geo-blocked; Task 1945d GAP-B fix).
7. `bctcReparseJob` disk scan: runs unconditionally every cycle (not just when `agent_feedback` is empty). Fresh PDFs stored between D-7c audit runs are picked up without 18+ h wait (Task 1945d GAP-A fix). Deduplicates with feedback-row filenames to avoid double-processing.

---

## Schema: `financial_reports.operating_cash_flow` (Sprint 1878a)

**Column:** `operating_cash_flow REAL` (nullable, no default) — added via idempotent ALTER TABLE migration in `initFinancialReportsTables`.

**Source:** `vnstock_cash_flow.operating_cf_bn * 1000.0` (tỷ VND → triệu VND).

**Purpose:** API-grade OCF distinct from `operating_cf` (BCTC OCR/PDF). Both columns coexist — divergence between them is useful for 1885a forensics.

**Bridge:** `bridgeOCFToFinancialReports(db, ticker)` in `schema-financial-reports.ts` — runs UPDATE for ALL quarters of ticker after each `storeCashFlow()` call. Also called via `backfillAllOCF(db)` on `initFinancialReportsTables` (migration block).

**Constraints:**
- Annual rows (`period_quarter IS NULL`) are never bridged — vnstock provides quarterly only.
- `vnstock_cash_flow.quarter = 0` (legacy annual marker) is excluded from JOIN via `quarter BETWEEN 1 AND 4`.
- Unit conversion mandatory: multiply by 1000.0 (1 tỷ = 1000 triệu).

**Downstream:** unblocks 1878b `compute_accruals`, 1885a Beneish/Piotroski, 1886a BTN forensics.
