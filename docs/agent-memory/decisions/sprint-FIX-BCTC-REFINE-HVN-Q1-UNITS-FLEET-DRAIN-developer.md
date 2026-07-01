---
task_id: FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN
bundled_task_id: FIX-GET-BCTC-OCF-SQL-COLUMN
agent: developer (dev-mcp-server)
zone: apps/mcp-server/
date: 2026-07-01
commit: 927d4e8f
---

# Decision Journal

## Root Cause Analysis

**PRIMARY: FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN**

HVN Q1-2026 served all-zero income statement and cash flow in financial_reports
despite the BCTC PDF having valid OCR text. Disambiguation branch confirmed:
pages had text (187–4018 chars each) → refine-stage bug, not OCR gap.

Three-layer bug:

1. **Section detection** — `SECTION_HEADERS` in `refinedMarkdownParser.ts` had Vietnamese-only
   patterns. Refine subagent wrote English H1 headings for bilingual PDFs
   ("# Income Statement Q1 2026", "# Cash Flow Statement Q1 2026 (Indirect Method)",
   "# Balance Sheet - Liabilities and Equity Q1 2026").
   These fell through to "general", so BEQ-7 saw hasCashFlow=false → PARTIAL forever.
   **Fix**: added English patterns to `SECTION_HEADERS`.

2. **Aggregator total_assets** — `findTotalAssetsCorporate` used Vietnamese regex only.
   OCR degraded "TÀI SẢN" → "S᰺ N" (U+1C3A Lepcha char). Regex failed, total_assets=null.
   Null total_assets triggered `enforceBalanceIdentity` fail-loud branch (REQUIRED SCALAR
   UNRESOLVED) → BLOCK-1 scalar update skipped entirely.
   **Fix**: added code "280"/"440" OCR-degraded fallback in `findTotalAssetsCorporate`,
   plus English "Total Assets" pattern in `TOTAL_ASSETS_LABEL`.

3. **Aggregator English label fallbacks absent** — All IS and CF rows from English-headed
   sections have code=null. Aggregator code-based lookups (code "10", "20", "30", etc.)
   all return null. No corporate English label fallbacks existed.
   **Fix**: added `P_CORP_NET_REVENUE_EN`, `P_CORP_GROSS_PROFIT_EN`, `P_CORP_OPERATING_PROFIT_EN`,
   `P_CORP_NET_PROFIT_EN`, `P_CORP_OPERATING_CF_EN`, `P_CORP_INVESTING_CF_EN`,
   `P_CORP_FINANCING_CF_EN` label patterns; wired as fallback after code-based lookups.

**SECONDARY: FIX-GET-BCTC-OCF-SQL-COLUMN**

`getBctcOcfTool.ts` SELECT referenced columns `ocf_operating`, `ocf_investing`,
`ocf_financing`, `confidence` which don't exist in live schema. Live schema uses
`operating_cf`, `investing_cf`, `financing_cf`, `extraction_confidence`.
**Fix**: SQL now uses aliases (`operating_cf AS ocf_operating`, etc.) matching the
`BctcOcfRow` interface. Test `makeTestDb()` updated to use live column names.

## Decisions

- OCR-fallback uses VAS code "280" (asset side canonical) preferred over "440" (equity side)
  because both represent the same accounting identity value.
- English label patterns are guarded with `!isBankPath` for IS scalars (gross_profit is N/A
  for banks); CF label fallbacks apply to both paths (English CF labels are universal).
- `findTotalAssetsCorporate` retains label-canonical strategy as primary (preserves FU-6c
  correctness for FPT/VNM corpus); OCR-fallback fires only when label set is empty.

## Verification

After fix + rebuild + re-finalize:
- HVN Q1-2026 refine_status: DONE, extraction_confidence: 1
- bctc_table_rows sections: balance_sheet=45, income_statement=45, cash_flow=28, general=211
- financial_reports scalars: net_revenue=29,030,239M, gross_profit=6,025,579M,
  operating_profit=3,019,061M, net_profit=3,948,257M,
  total_assets=67,051,931M, total_liabilities=54,308,378M, equity_total=12,743,553M,
  operating_cf=5,018,783M, investing_cf=-4,017,555M, financing_cf=-560,223M, cash=7,930,541M
- Balance identity: 67,051,931 ≈ 54,308,378 + 12,743,553 = 67,051,931 ✓

Fleet drain: 7 stuck-PARTIAL candidates re-finalized. GVR→DONE. Remaining PARTIAL
(ACB/HPG/VCB/VEA) have genuine missing sections (bank B02-TCTD structure / incomplete
OCR coverage) — pre-existing condition, not caused by this fix.

## Tests

- `FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN.test.ts`: 12 pass, 0 fail
- `1909b-get-bctc-ocf.test.ts`: 8 pass, 0 fail
- Scalar regression suite (7 files, 61 tests): all pass
- `bun tsc --noEmit`: clean
