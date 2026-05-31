# Architect — Notebook

**Last updated:** 2026-05-31 22:30 UTC | **Sprint:** BANK-AWARE-BCTC BANK-ARCH-2 (discriminator correction)

[3 most recent cycles retained below. Archive in git history.]

## BANK-AWARE-BCTC BANK-ARCH-2 (2026-05-31T22:30 UTC) — DISCRIMINATOR CORRECTION

**Sprint:** BANK-AWARE-BCTC | Task: BANK-ARCH-2 (QA escalation — discriminator signal wrong)

**Root finding:** ALL 12 live DB tickers have `domain="other"`. The `domain` column is permanently mis-populated by the ingest path. `isBankForm("other")=false` → entire BANK-DEV-1 implementation bypassed. ACB still blocked at PUB-3.

**Secondary finding:** Aggregator's `findByCode(rows,"10")===null` also unreliable as a global signal — FPT (corporate) also has no code "10" in `bctc_table_rows` (section classifier mislabels all FPT rows as balance_sheet). The aggregator self-corrects via the fallback chain but the signal can't be exported as a SSOT.

**Correct structural signal:** presence of any 3-digit numeric code (regex `/^[0-9]{3}/`) in `bctc_table_rows` for the report. Corporates (FPT=79, HPG=26, DHG=62 such rows) vs banks (ACB=0, SHB=0, EIB=0). Signal is clean, zero false positives/negatives in live data.

**New SSOT:** `isBankFormFromRows(rows: BctcCodeRow[]): boolean` + `isBankFormFromDb(db, reportId)`. Old `isBankForm(domain)` deleted — compile errors enforce fleet-wide correction.

**Key call-site changes:**
- `bctcFullTools.ts` line ~593: `isBankForm(latestRow.domain)` → `isBankFormFromDb(db, latestRow.id)`
- `finalizeBctcRefineTool.ts`: `isBankForm(domain)` → `isBankFormFromRows(finalRows)` (rows already loaded)
- C-2, C-3, C-5, C-7: self-correct when upstream `bankForm` is correct — no signature change
- C-6 `computeBctcEval.ts`: primary `isBankFormFromDb`; scalar belt-and-suspenders if DB unavailable

**New test DV-BANK-7:** 4-seed discriminator regression in `BANK-AWARE-1-consumer-audit.test.ts`.

**Brief amended:** `docs/architecture-briefs/2026-05-31-bank-aware-bctc.md` § BANK-ARCH-2
**BANK-DEV-2 task spec:** in § BANK-ARCH-2 of the brief.

---

## BANK-AWARE-BCTC BANK-ARCH (2026-05-31T21:00 UTC) — DESIGN COMPLETE

**Sprint:** BANK-AWARE-BCTC | Task: BANK-ARCH (hard gate — recurring-bug escalation x4)
**Mode:** Exhaustive consumer enumeration — brownfield read-only, no code written.

**Root cause: four bank-vs-corporate mismatches surfaced one-per-rebuild because every consumer was written for Mẫu B01-DN corporate structure. Bank Mẫu B02-TCTD differs: no gross_profit, no current_assets, Roman-numeral codes that collide across BS/IS sections, and all rows landing in statement_section="general".**

**7 bank-unaware consumers enumerated (6 files):**
1. C-1 `bctcFullTools.ts` PUB-3: `CAST(code AS INTEGER) BETWEEN 100 AND 440` → bank Roman codes CAST to NULL → zero rows → ACB blocked.
2. C-2 `bctcFullTools.ts` buildSummarySection: renders `Gross Profit: 0.0 tỷ VND` for banks (null→0).
3. C-3 `bctcFullTools.ts` rowToMetrics/buildComparisonSection: grossProfit=0 in QoQ comparison (misleading).
4. C-4 `bctcMagnitudeValidator.ts` DT-2a: searches `statement_section="income_statement"` but bank rows all in `general`; also DT-2b searches `balance_sheet` — banks have 0 rows there.
5. C-5 `bctcValidator.ts`: `netProfit > grossProfit && grossProfit >= 0` fires false WARNING for every bank (4.3M > 0).
6. C-6 `computeBctcEval.ts` Stage 6: partially fixed (FU-6f B-1) but lacks defensive fallback when domain="".
7. C-7 `bctcValidator.ts` assetDecomposition: SAFE by accident but should be explicitly guarded.

**Discriminator: `isBankForm(domain: string|null): boolean` = `/bank/i.test(domain ?? "")`**
Single SSOT in new file `bctcFormType.ts`. All consumers import from here. Domain column already exists on `financial_reports` (DDL line 732 in bctc-schema.ts, indexed `idx_fr_domain`).

**Change list (5 files modified, 2 new):**
- NEW `bctcFormType.ts`: canonical `isBankForm()` utility
- `bctcFullTools.ts`: PUB-3 bank SQL path + gross_profit display + QoQ bank guard
- `bctcMagnitudeValidator.ts`: `isBankForm` param, skip DT-2a, extend DT-2b to `general`
- `bctcValidator.ts`: `isBankForm` on ValidatableReport, guard gross_profit comparisons
- `computeBctcEval.ts`: defensive fallback when domain="" + gross_profit null
- `finalizeBctcRefineTool.ts`: thread `isBankForm` to magnitude validator
- NEW `BANK-AWARE-1-consumer-audit.test.ts`: DV-BANK-1..6 (all RED-before-GREEN)

**Anti-false-green (DV-BANK-6 acceptance proof):** `get_bctc_full(ACB)` via gateway returns real data; `equity_total=98,751,052M` confirmed via `get_bctc_refined`; in-container bun:sqlite COUNT > 0; balance badge FORBIDDEN as sole gate.

**Brief:** `docs/architecture-briefs/2026-05-31-bank-aware-bctc.md`

---

## FU-TRUST-REFRESH FU-6-redo ARCH (2026-05-31T20:00 UTC) — DESIGN COMPLETE

**Sprint:** FU-TRUST-REFRESH | Task: FU-6-redo (recurring-bug escalation)
**Mode:** Holistic root-cause — read actual bctc_table_rows before designing. No code written.

**Root cause: aggregator-only. Upstream (OCR/refine/parse) is clean.**

**Three confirmed bugs (grounded in live DB rows):**
1. FPT total_assets: code "270" = "V. Tài sản dài hạn khác" (3.4T). Real total_assets at code "280" = "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)" (68.6T). Aggregator's hardcoded "270" assumption is wrong for FPT's Mẫu B01-DN variant.
2. ACB equity_total: `findByLabel` for "vốn chủ sở hữu" matches "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (1,030,900,741M) first because it appears earlier in row_order with is_summary_row=1. Correct equity: code "VIII" / "VỐN CHỦ SỞ HỮU" (98,751,052M).
3. ACB net_revenue: code "I" collision — balance sheet row "Tiền mặt, vàng bạc, đá quý" (8,157,465M) appears before income row "Thu nhập lãi thuần" (6,989,162M). No section filter on `findByCode`.

**Resolution: label-canonical + exclusion-filter + section-scoped code lookup + balance-identity invariant.**

**False-green explanation:** DV-FU5-1/2 used idealized fixtures where code "270" was labeled "Tổng tài sản" and code "I" was unambiguous. Real data differs. The balance-identity invariant (total_assets ≈ liabilities + equity, ±1%) is the natural correctness gate — both FPT (3.4T ≠ 28.5T + 40.1T) and ACB (1,030.9B ≠ 932.1B + 1,030.9B) would have thrown.

**Change list (4 files, dev-mcp-server only):**
- `bctcScalarAggregator.ts`: `findTotalAssetsCorporate`, `findByLabelExcluding`, `labelHint` param on `findByCode`, `enforceBalanceIdentity` (structured return `{scalars, balanceViolation}`)
- `finalizeBctcRefineTool.ts`: call site only — check `balanceViolation`, skip UPDATE + log.error if violated
- `FU-6-scalar-correctness.test.ts`: NEW — DV-FU6-1 through DV-FU6-5 (realistic fixtures + deliberate-wrong-pick that invariant must catch)
- `FU-5-scalar-backfill.test.ts`: amend DV-FU5-1 (use code "280" for FPT) + DV-FU5-2 (add code "I" collision)

**Brief:** `docs/architecture-briefs/2026-05-31-bctc-scalar-aggregator-root-cause.md`

---
