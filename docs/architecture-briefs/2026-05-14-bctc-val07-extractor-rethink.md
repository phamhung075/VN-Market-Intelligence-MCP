# Architecture Brief — BCTC VAL-07 / totalAssets Positional Extraction Rethink

**Date:** 2026-05-14
**Author:** architect
**Triggered by:** recurring-bug rule (task 1815 + task 1908a spike = 2 fix commits on same module)
**Deadline:** banking cohort 2026-05-15 (24-48h window)
**Task:** 1908c (FIX)
**Zone:** dev-pdf-extractor

---

## 1. Problem Statement

`balanceSheetExtractor.ts` uses `extractSplitBlockAll` to map BCTC line codes to values. In VPBank-style multi-page balance sheets, code "270" (TONG TAI SAN — grand total assets) appears on page 5 but a sub-item on page 6 (`Tài sản dài hạn khác`, line 260) whose value column spatially overlaps the code 270 position in the merged text stream. The parser captures the sub-item value (~957 billion VND) instead of the grand total (~53.3 trillion VND). Because `totalAssets` is non-zero, the existing zero-guard fallback (line 714) never fires. The wrong value propagates to BCTC-VAL-07 (`totalLiabilities / totalAssets = 19.7x > 5`), which hard-fails to `confidence_financial = 0.0`. VNM Q4 2025 is blocked for all downstream FA tools. DIG Q4 2025 has the same pattern. The banking cohort arriving 2026-05-15 shares the multi-page layout risk.

---

## 2. Why Task 1815 Did Not Catch This

Task 1815 (BCTC-VAL-01-POSITION guard, committed 2026-05-02) addressed a specific symptom: `totalAssets < totalEquity` when netRevenue exceeds 30x totalAssets. Its guard fires on VAL-01 only. VAL-07 is a separate hard-fail rule evaluated independently at line 247 of `financialFiguresValidator.ts`. Even with the 1815 guard in place, once the extractor emits a sub-total as `totalAssets`, VAL-07 fires unconditionally because it has no positional-error awareness. The root cause — `extractSplitBlockAll` non-deterministically matching code "270" to a nearby sub-item value — was not addressed; 1815 only softened one downstream symptom of a different validation rule.

---

## 3. Option A vs Option B Trade-off

| Dimension | Option A — VAL-07 downstream guard (mirror 1815 pattern) | Option B — upstream plausibility override in extractor |
|---|---|---|
| **Scope** | Validator only (`financialFiguresValidator.ts` ~5 lines) | Extractor only (`balanceSheetExtractor.ts` ~5 lines, after line 716) |
| **Data quality** | Bad totalAssets enters DB, stored as low_confidence; downstream FA tools still get wrong figures even on soft path | Correct totalAssets enters DB; all downstream consumers (ratioComputer, FA tools, validator) see accurate data |
| **Regression risk** | Low — mirroring an existing guard pattern; no extractor behaviour changed | Low — override only fires when `computedFromSubtotals / totalAssets > 5` AND both sub-totals > 0; does not touch any other code path |
| **Implementation effort** | S (copy-adapt VAL-01-POSITION guard, 3-condition check, soft penalty) | S (3-line guard after existing zero-fallback; same logic already drafted in 1908a §5) |
| **Banking-deadline fit** | Ships in time; but reparse still produces incorrect stored values until Option B lands | Ships in time; fixes root cause in one pass; reparse produces correct values immediately |
| **Future-proofness** | Accumulates validator complexity; every new positional-drift symptom needs its own downstream guard; does not prevent similar drift on other fields (totalLiabilities, equity) | Structural fix at data entry point; same pattern can be applied to any sub-total field; aligns with existing `liabPlausible` guard (lines 765-776) which uses identical reasoning for totalLiabilities |

**Verdict: Option B is the primary fix. Option A can be added as a defence-in-depth soft-penalty if desired, but must NOT replace Option B.**

---

## 4. Recommendation

Ship Option B as the sole required fix for task 1908c. The extractor already applies an analogous plausibility guard for `totalLiabilities` (the `liabPlausible` block at lines 765-776). Adding a symmetric guard for `totalAssets` after the existing zero-fallback (line 716) is a natural extension of the same DDD domain-rule pattern — it keeps bad data out of the system entirely, so the validator, ratio computer, and FA tools all benefit without code changes. The three-condition check from 1908a §5 (`computedFromSubtotals / totalAssets > 5`, both sub-totals positive, optionally cross-checked against `totalLiabilitiesAndEquity`) is sufficient and safe. Option A (VAL-07 soft-penalty) may be added as a belt-and-suspenders guard in the same task but is secondary; it must never be shipped alone.

---

## 5. Implementation Handoff

**Zone:** dev-pdf-extractor
**Task id:** 1908c
**Owner:** dev-pdf-extractor

### Files to modify

| File | Layer | Change |
|---|---|---|
| `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts` | domain | After line 716 (zero-fallback), insert plausibility override block |
| `apps/mcp-server/src/domain/services/financial-reports/financialFiguresValidator.ts` | domain | (Optional / secondary) add BCTC-VAL-07-POSITION soft-penalty mirroring 1815 pattern |

### Atomic change spec — balanceSheetExtractor.ts

Insert immediately after line 716 (`totalAssets = currentAssets.total + nonCurrentAssets.total;`):

```
// BCTC-1908c: Plausibility override — positional extraction drift on code 270.
// When extractSplitBlockAll captures a sub-item value instead of the grand total,
// computedFromSubtotals will be >> totalAssets (ratio > 5). Discard and recompute.
const computedFromSubtotals = currentAssets.total + nonCurrentAssets.total;
if (totalAssets > 0 && computedFromSubtotals > 0 && computedFromSubtotals / totalAssets > 5) {
  console.warn("[balanceSheetExtractor] BCTC-1908c: totalAssets positional drift detected; overriding with sub-total sum.");
  totalAssets = computedFromSubtotals;
}
```

### Test strategy

**New test file:** `apps/mcp-server/src/__tests__/1908c-totalassets-plausibility-override.test.ts`

Golden fixture set (required — do not mock):

| Fixture | Purpose |
|---|---|
| VNM Q4 2025 raw OCR text (or balance_sheet_json snapshot) | Primary trigger case: totalAssets sub-item drift, ratio ~55x |
| DIG Q4 2025 raw OCR text (or balance_sheet_json snapshot) | Systemic validation: same drift, ratio ~28,460x |
| VCB Q4 2025 (passing) | Regression guard: override must NOT fire on correct extractions |
| FPT Q4 2025 (passing) | Regression guard: override must NOT fire on correct extractions |

Test assertions per fixture:
1. `totalAssets === currentAssets.total + nonCurrentAssets.total` for VNM + DIG (override fired)
2. `totalAssets` unchanged for VCB + FPT (override did not fire)
3. After override, `financialFiguresValidator` returns `confidence_financial > 0` for VNM + DIG

Baseline pass requirement: all existing tests in `042-bctc-balance-sheet.test.ts`, `1120-split-block-balance-sheet.test.ts`, `287-balance-sheet-unit-header.test.ts` must continue to pass.

---

## 6. Post-Fix Verification

After task 1908c is merged and container redeployed:

1. Delete stale VNM and DIG Q4 2025 rows:

```sql
DELETE FROM financial_reports WHERE action_code='VNM' AND period_year=2025 AND period_quarter=4;
DELETE FROM financial_reports WHERE action_code='DIG' AND period_year=2025 AND period_quarter=4;
```

2. Trigger reparse via `bctcReparseJob` (MCP tool or cron manual trigger).
3. Confirm new DB rows: `confidence_financial > 0`, `validation_status = passed`, `totalAssets ≈ 53,312,371 triệu` for VNM.
4. Run `get_financial_report VNM 2025 Q4` — must return without error.
5. Monitor WORK Telegram channel for any new `[BCTC-*] Low financial confidence` alerts in the banking cohort batch (2026-05-15).
