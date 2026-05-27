# Tool Group: financial-reports (mcp-server)

**Module path:** `src/interface/mcp/tools/financial-reports/`
**Scheduler:** `src/scheduler/financial-reports/` (2 cron jobs + 1 startup probe)
**Domain services:** `src/domain/services/financial-reports/` — balanceSheetExtractor, incomeStatementExtractor, cashFlowExtractor, ratioComputer (22 ratios), periodDeltaComputer (QoQ/YoY), bctcValidator, earningsCalendar, priceNewsValidator

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

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

---

## BT-3i: Structured Table Storage + Inspector Render (BCTC-TABLE sprint)

### New Tables (BT-3i-A, commit `40b0b50e`)

**`bctc_table_rows`** — per-doc per-row structured BCTC table data.

| Column | Type | Notes |
|--------|------|-------|
| `report_id` | TEXT | FK → financial_reports.id (UUID) |
| `page_number` | INTEGER | 1-indexed PDF page |
| `statement_section` | TEXT | "balance_sheet" / "income_statement" / "cash_flow" |
| `row_order` | INTEGER | Global row order (monotone across pages) |
| `code` | TEXT nullable | BCTC line code (100, 110, 270…); NULL for header rows |
| `label` | TEXT | Vietnamese label |
| `period_current` | TEXT | e.g. "31/12/2025" |
| `value_current` | REAL nullable | Full VND (not millions) |
| `period_prior` | TEXT nullable | e.g. "31/12/2024" |
| `value_prior` | REAL nullable | Full VND (not millions) |
| `unit` | TEXT | "vnd" or "billion_vnd" |
| `is_summary_row` | INTEGER | 1 for major subtotal codes {100,200,270,300,400,440} |

**`bctc_balance_checks`** — per-doc balance sheet identity check.

| Column | Type | Notes |
|--------|------|-------|
| `report_id` | TEXT UNIQUE | FK → financial_reports.id |
| `statement_section` | TEXT | Always "balance_sheet" |
| `total_assets` | REAL | Code 270 value (full VND) |
| `total_liabilities` | REAL | Code 300 value (full VND) |
| `total_equity` | REAL | Code 400 value (full VND) |
| `balance_delta` | REAL | Assets − (Liab + Equity), 0.0 = perfectly balanced |
| `balance_pass` | INTEGER | 1 = identity holds within 1 VND tolerance |

### New Endpoints

**`POST /api/push-bctc-table`** — receives structured rows from pdf-extractor.
- Handler: `src/interface/mcp/routes/pushBctcTableHandler.ts`
- Idempotent: DELETE+INSERT per report_id; UPSERT balance_check.
- UUID-validates report_id before any DB write.
- Parameterized SQL only (no string interpolation).

**`GET /api/bctc-inspect/table/{doc_id}`** — returns stored table rows + balance check.
- Handler: `handleBctcInspectTable()` in `bctcInspectHandler.ts`
- Returns `{has_table: false, rows: []}` with HTTP 200 when no rows stored (not 404).
- UUID-validates doc_id.

### HTML Inspector (BT-3i-B, commit `d639a478`)

`src/interface/bctc-inspector.html` updated with:
- `#table-section` div between `.figures-section` and `.ocr-section`.
- `renderTable(docId)` JS function: fetches `/api/bctc-inspect/table/{doc_id}`, renders HTML `<table>` with Code|Label|Current|Prior columns.
- Summary rows (is_summary_row=true) displayed bold.
- Header rows (code=null) displayed italic with colspan.
- Balance badge: green "BALANCE PASS" or red "BALANCE FAIL" with delta.
- "No structured table yet — re-extract pending (BT-4b)" shown for legacy docs.
- Called automatically on document selection after renderOcr().

---

## PEK-RENDER-MCP: Render Seam — PEK SSOT Inspector Panels (Sprint PEK-INTEGRATE Round 6)

### Problem (Root Cause)

The BCTC inspector OCR Text and structured-table panels were reading from stale OLD-pipeline tables (`pdf_extracted_text`, `bctc_table_rows`) while PEK writes exclusively to `bctc_layout_units` + `bctc_page_zones`. A perfect PEK extraction could never change the OCR Text render — dual-path render drift.

### Solution: Option A — Repoint Inspector Panels to PEK SSOT Tables

`handleBctcInspectOcr` and `handleBctcInspectTable` now check `bctc_layout_units` FIRST for any given `report_id`. The `has_pek` flag is ALWAYS present in every response branch — it is the fail-loud guard (never omitted).

### Read Contract

**`GET /api/bctc-inspect/ocr/{doc_id}?page=N`:**

| State | has_pek | pek_coverage_gap | text_content source |
|-------|---------|-----------------|-------------------|
| PEK units exist + page covered | true | absent | `stitched_markdown` from `bctc_layout_units` |
| PEK units exist + page NOT covered | true | true | empty string (no silent fallback) |
| No PEK units for this report | false | absent | `pdf_extracted_text` (legacy) |

**`GET /api/bctc-inspect/table/{doc_id}`:**

| State | has_pek | Response shape |
|-------|---------|---------------|
| PEK units exist | true | `{ has_pek: true, has_table: false, units: [...] }` |
| No PEK units | false | `{ has_pek: false, has_table: bool, rows: [...] }` |

### New Endpoint: `POST /api/trigger-pek-extract`

- Accepts `{ report_id: string }`
- Looks up `financial_reports.pdf_path` (mcp-server owns market.db)
- Returns 404 when `pdf_path IS NULL` (VCB geo-restricted — 2 known rows)
- Calls `POST http://pdf-extractor:5001/pek-extract` with `{ report_id, pdf_path }`
- Returns 202 on success; propagates 503 (market-hours guard from pdf-extractor)
- Does NOT change `PekExtractRequestSchema` on pdf-extractor side — `pdf_path` stays mandatory

### HTML Inspector (PEK-RENDER-MCP)

`src/interface/bctc-inspector.html` updated:
- OCR panel: removes prior PEK banners before re-render; branches on `data.has_pek`
- C-1 HARD: unmistakable gold/orange stale banner when `has_pek:false` (mirroring `ocr-sync-note` pattern)
- Coverage-gap banner when `has_pek:true AND pek_coverage_gap:true`
- Renders `stitched_markdown` (pre-formatted) when `has_pek:true` and page covered
- Table panel: stale banner when `has_pek:false`; PEK SSOT badge + unit list when `has_pek:true`

### Tests

`src/__tests__/pek-render-seam.test.ts` — 12 tests, 0 fail:
- (a) has_pek:true + stitched_markdown when PEK unit covers requested page
- (b) has_pek:false + legacy fallback when no PEK units
- (c) pek_coverage_gap:true when PEK units exist but page not covered
- (d) Table: has_pek:true + units array for PEK reports
- (e) Table: has_pek:false + rows for non-PEK reports
- (f) financial_reports pdf_path DB verification (trigger endpoint contract)
