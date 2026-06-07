# SPIKE 3012 — BCTC eval insights for HPG + PPC

- **Question:** What do the BCTC evaluation pipeline outputs look like for HPG and PPC, and what blocks producing solid eval insights for these two tickers?
- **Approach tried:** Live readonly DB probes via `docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e '...'` against `/app/data/market.db`. Inspected all BCTC tables (`financial_reports`, `bctc_vps_queue`, `bctc_eval_results`, `bctc_table_rows`, `bctc_balance_checks`, `bctc_refined_units`, `bctc_layout_units`, `pdf_extracted_text`) plus source-code review of `bctcValidator.ts` and `financialFiguresValidator.ts`.
- **Spike branch:** `spike/3012-bctc-eval-hpg-ppc` — DELETED after findings extraction.
- **Timebox:** 120 min — completed within limit.

---

## Probe 1 — financial_reports rows for HPG and PPC

### PPC

**Zero rows** in `financial_reports`. No PDF has ever been successfully extracted.

`bctc_vps_queue` for PPC:
- Q4 2025: `status=url_not_found`, 6 attempts, `source_url=NULL`. Permanently stuck.
- Q1 2026: `status=pending`, 0 attempts, source URL present (HSX static, URL has spaces).
- Q3 2025: `status=pending`, 0 attempts — source URL is the **Q1 2026 PDF URL** (wrong document assigned to Q3 slot).
- Q2 2025 through Q4 2023: `status=pending`, 0 attempts, `source_url=NULL` (no PDF URL on record).

**Result for PPC: no eval possible. Zero data exists.**

### HPG

**One row** in `financial_reports`, report_id `d6f1885f-e692-4927-bda0-52a7eb63e737`:

| field | value |
|---|---|
| period | 2025-Q4 |
| company_name | "" (blank) |
| pdf_path | `/app/data/pdfs/20260130-HPG-Bao-cao-tai-chinh-rieng-Cong-ty-me-va-giai-trinh-Q4.2025.pdf` |
| text_status | COMPLETE |
| refine_status | DONE |
| confirm_status | PENDING |
| extraction_confidence | 0.4375 |
| ocr_confidence | 0.4375 |
| confidence_financial | 1.0 |
| validation_status | **failed** |
| total_assets | 98,670,778.69 million VND |
| total_liabilities | 4,239,852.22 million VND |
| equity_total | 94,430,926.47 million VND |
| net_revenue | 0 |
| gross_profit | -482,482.08 million VND |
| net_profit | 5,597,856.81 million VND |

Identity guard check: `total_assets > 0` AND `total_assets >= equity_total` (98.67T >= 94.43T) — **guard does NOT fire**. HPG is NOT a corrupt-identity row. The serve-guard from c381 (CTG/VNM/VEA pattern) will pass HPG through.

`bctc_vps_queue` for HPG:
- Q4 2025: `status=done`, 1 attempt. PDF fetched from VPS.
- Q1 2026: `status=pending`, 0 attempts. Source URL present (HSX static, spaces in URL).
- Q3 2025: `status=pending`, 0 attempts. Source URL is the Q1 2026 PDF URL (same wrong-document bug as PPC).
- Q2 2025 through Q4 2023: `status=pending`, 0 attempts, `source_url=NULL`.

---

## Probe 2 — eval path: gate results, identity rows, low-confidence skips

### HPG — bctc_eval_results (6 gates)

| stage | name | status | key metrics |
|---|---|---|---|
| 1 | RASTERIZE | **yellow** | `backfill:true` — placeholder; awaiting pdf-extractor push |
| 2 | LAYOUT_DETECT | **yellow** | `backfill:true` — placeholder; awaiting pdf-extractor push |
| 3 | OCR | **yellow** | `backfill:true` — placeholder; awaiting pdf-extractor push |
| 4 | TABLE_RECONSTRUCT | **RED** | `exact_dup_count=2`, gate threshold=0; `total_rows=72`, `label_coverage=1`, `code_coverage=1` |
| 5 | MARKDOWN_RENDER | **yellow** | `roundtrip_row_match_ratio=0`, `md_table_count=0` |
| 6 | STRUCTURED_EXTRACT | **green** | `golden_row_match_ratio=1`, `balance_pass:true (signal_only)`, no qoq_outlier_flags |

Overall eval status: **RED** (stage 4 fires).

**Stage 4 RED — exact duplicate rows in bctc_table_rows:**
Two label+value_current pairs appear twice each:
1. `Hàng tồn kho` (Inventory, code 140 and 141): value_current = 1,986,588,655 VND
2. `LNST chưa phân phối kỳ này` (code 421b): value_current = 5,597,856,806,673 VND — appears in both `income_statement` and `balance_sheet` sections.

The second duplicate is a cross-section spill (code 421b is legitimately present on both the balance sheet and income statement of a parent-company standalone report). The first (Hàng tồn kho with codes 140 vs 141) is a genuine OCR-parse duplicate row.

**Stage 5 yellow** is a downstream consequence: `md_table_count=0` because `bctc_md_tables` has no row for HPG (NULL). bctc_refined_units has 1 unit (unit-0001, 74 rows, confidence=0.82, window_status=DONE) but no markdown roundtrip was computed.

**Stages 1–3 yellow (backfill placeholders)**: These were backfilled on 2026-05-28 with `{"note":"Backfill placeholder","backfill":true}`. No real rasterize/layout/OCR metrics were pushed.

**No corrupt-identity rows**: balance_sheet_json.equity.total (94,430,926.47M) < total_assets (98,670,778.69M) — identity holds in the scalars columns.

**Low-confidence check**: extraction_confidence = 0.4375. This is below the standard 0.5 threshold. The pipeline serves it (not skipped) because the current serve-guard only checks `total_assets <= 0 OR total_assets < equity_total`, not confidence gating. No low-confidence skip fires.

### Critical bug found: balance_sheet_json.totalLiabilities = prior-period value

`balance_sheet_json.totalLiabilities` = **1,012,889.94 million VND** — this is the Q4 2024 (prior period) NỢ PHẢI TRẢ value from `bctc_table_rows.value_prior` for code 300 (1012889937592 VND / 1e6).

The correct Q4 2025 current-period value is 4,239,852.22 million VND (confirmed via `bctc_table_rows.value_current` for code 300 AND matching `financial_reports.total_liabilities`).

**Consequence in bctcValidator.ts**: the identity check reads `bs?.totalLiabilities` from `balance_sheet_json`, gets the prior-period value, and produces a false violation:

```
Assets (98,670,778.69) ≠ Liabilities (1,012,889.94) + Equity (94,430,926.47) — mismatch 3.3%
```

With the CORRECT current-period liabilities: 1,012,889.94 + 3,226,962.29 = 4,239,852.23 (matches current total). Identity: 98,670,778.69 = 4,239,852.22 + 94,430,926.47 → **delta = 0.00**, identity passes.

This is a parser bug in `fetchParseAndStoreBctc.ts` or `parseBctcReport.ts`: the balance-sheet extractor wrote `totalLiabilities` from the prior-period column instead of the current-period column.

Also: `balance_sheet_json.currentLiabilities.total + longTermLiabilities.total = 1,380,352.22 + 2,859,500 = 4,239,852.22` which IS correct — so the sub-components were extracted from the current period correctly but the totalLiabilities summary was taken from the prior column.

**validation_status = "failed"** is therefore a false positive for HPG on the identity check. The report data is structurally sound.

### Additional income statement issues (HPG parent-company report)

The report is `Báo cáo tài chính riêng` (parent company standalone, not consolidated):
- `net_revenue = 0`: correct for a holding company that books only dividend/investment income from subsidiaries. HPG parent company recognises revenue from financial income (subsidiaries: 5,675,436,125,886 VND).
- `gross_profit = -482,482.08M`: OCR parse artefact — the gross profit line was computed as revenue (0 or small) minus COGS, which is meaningless for a holding company. Not a corruption; just an inappropriate field for this report type.
- `income_stmt_json.netProfit = 5597`: unit is BILLION VND (tỷ). `financial_reports.net_profit = 5,597,856.81M = 5,597.86 tỷ` — consistent. The 5597 value is truncated due to integer rounding in the JSON.

### PPC — bctc_eval_results

Zero rows. No eval has ever run. No financial_reports row exists.

---

## Probe 3 — Blockers and recommended follow-up tasks

### HPG blockers

**B1 — CRITICAL: balance_sheet_json.totalLiabilities uses prior-period value**
- Location: `fetchParseAndStoreBctc.ts` / `parseBctcReport.ts` — the field that aggregates totalLiabilities from extracted rows reads from the wrong column (value_prior instead of value_current for the NỢ PHẢI TRẢ code-300 row).
- Impact: `validation_status="failed"` is a false positive. bctcValidator identity check fires on bad data.
- Fix: locate the totalLiabilities assignment in the balance-sheet extractor; ensure it reads `value_current` for code 300.

**B2 — Stage 4 RED: exact_dup_count=2**
- Duplicate 1 (Hàng tồn kho codes 140+141): Both rows have the same label and value. Code 141 is the sub-item of code 140. The extractor should suppress the sub-item when the parent total row has an identical value and is already present. Fix: dedup logic in `pushBctcTableHandler.ts` or post-extraction cleanup.
- Duplicate 2 (LNST chưa phân phối kỳ này code 421b): Present in both `income_statement` and `balance_sheet` sections — this is semantically valid for VN parent-company reports. The stage-4 gate should treat cross-section duplicates as a WARNING (yellow), not a gate failure (red). Fix: stage-4 gate logic to scope dedup check within a single `statement_section`.

**B3 — Stages 1–3 are backfill placeholders (yellow)**
All three stages are marked `backfill:true` from 2026-05-28 — no real rasterize/layout/OCR metrics. These slots cannot provide diagnostic value until re-computed from the actual PDF pipeline run. Fix: re-trigger pdf-extractor evaluation for HPG Q4 2025.

**B4 — Stage 5 yellow: no markdown roundtrip**
`bctc_md_tables` has no row for HPG. The markdown table pipeline was never run against this report. Fix: trigger pushBctcMdTables for HPG Q4 2025.

**B5 — company_name blank**
`financial_reports.company_name = ""`. The extractor did not populate the company name. Minor but affects display quality.

**B6 — extraction_confidence = 0.4375 (below 0.5 threshold)**
Low OCR confidence means derived figures should be treated as provisional. No blocking issue for inspection, but eval quality is limited by OCR quality on this parent-company PDF.

**B7 — HPG Q1 2026 and Q3 2025 pending with wrong/stale source URLs**
Both Q1 2026 and Q3 2025 share the same HSX URL (pointing to Q1 2026 PDF). Q3 2025 will fail if ever attempted as it will fetch the wrong document. The URL assignment logic in the queue enricher needs to be audited for these entries.

### PPC blockers

**B8 — CRITICAL: zero financial data; no financial_reports row**
PPC has never been successfully extracted. The Q4 2025 entry exhausted 6 attempts with `url_not_found`. No Q2–Q3 2025 URLs on record.

**B9 — Q1 2026 and Q3 2025 share the same HSX URL (same wrong-document bug as HPG)**
The HSX URL for Q1 2026 was incorrectly assigned to the Q3 2025 slot during queue enrichment.

**B10 — Q4 2025 permanently stuck at url_not_found (6 attempts)**
The queue entry for PPC Q4 2025 has no source_url and 6 failed attempts. It will never resolve without a manual URL injection or a queue reset with a valid PDF URL sourced from HNX/SSC.

---

## Recommended next tasks for po

| Priority | Task ID (proposed) | Description |
|---|---|---|
| P0 | FIX-BCTC-LIAB-PRIOR-PERIOD | Fix balance-sheet extractor: totalLiabilities reads from prior-period column. Root cause in `parseBctcReport.ts` / `balanceSheetExtractor.ts`. Fix → re-parse HPG Q4 2025 → validation_status becomes "passed". |
| P0 | FIX-BCTC-STAGE4-CROSS-SECTION-DUP | Stage-4 dedup gate: scope exact_dup check within statement_section. Cross-section duplicates (421b in both BS and IS) are semantically valid for VN parent-company reports. Reclassify as yellow warning, not red gate failure. |
| P1 | FIX-BCTC-STAGE4-SUBITEM-DUP | Stage-4 dedup: suppress sub-item rows (code 141) that duplicate parent summary rows (code 140) with identical values. |
| P1 | SPRINT-PPC-PDF-SOURCING | Research and inject correct PDF URLs for PPC: Q4 2025 (SSC/HNX direct), Q3/Q2/Q1 2025, Q4 2024. Reset PPC Q4 2025 url_not_found to pending with valid URL. |
| P1 | SPRINT-HPG-QUEUE-URL-FIX | Correct wrong URL assignments: HPG Q3 2025 currently points to Q1 2026 PDF. Same for PPC Q3 2025. Audit all entries where period_quarter vs PDF filename mismatch. |
| P2 | FIX-BCTC-EVAL-BACKFILL-RERERUN | Re-trigger stages 1–3 for HPG Q4 2025 (currently backfill placeholders). Push real metrics from pdf-extractor evaluation. |
| P2 | FIX-HPG-COMPANY-NAME | Populate company_name="Công ty Cổ phần Tập đoàn Hòa Phát" for HPG Q4 2025 row. |
| P3 | SPRINT-HPG-MULTI-PERIOD-BACKFILL | Once URL-fix complete, extract HPG Q3/Q2/Q1 2025 and Q4 2024 to enable trend analysis. |
| P3 | SPRINT-PPC-FULL-BACKFILL | After PDF URL sourcing, extract PPC Q1 2026, Q4/Q3/Q2/Q1 2025, Q4 2024 in sequence. |

---

## Verdict

**HPG:** one financial_reports row (Q4 2025 parent-company standalone). The report IS structurally valid — balance sheet identity holds in the raw data and financial_reports scalar columns. The `validation_status="failed"` is a **false positive** caused by a prior-period contamination bug in `balance_sheet_json.totalLiabilities`. The identity serve-guard (c381) will NOT incorrectly fire (assets=98.67T > equity=94.43T). However, stage-4 eval is RED due to duplicate rows — partly a genuine sub-item dup (Hàng tồn kho 140/141), partly a cross-section valid dup (421b). No low-confidence skip fires, but extraction_confidence=0.4375 is low. Stages 1–3 are backfill placeholders — no real OCR metrics available. Net: HPG can produce eval insights once B1 (prior-period liabilities fix) and B2 (stage-4 cross-section dup reclassification) are resolved.

**PPC:** no data at all. Zero financial_reports rows. Queue fully stuck (Q4 2025 exhausted 6 attempts with null URL; other periods have wrong URLs or no URLs). PPC requires a dedicated PDF-sourcing effort before any eval is possible.

**Recommended next step:** po should spawn FIX-BCTC-LIAB-PRIOR-PERIOD as P0 (small, targeted fix in the balance-sheet extractor) and SPRINT-PPC-PDF-SOURCING + SPRINT-HPG-QUEUE-URL-FIX as P1 parallel efforts.
