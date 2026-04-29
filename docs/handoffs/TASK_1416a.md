# TASK 1416a — VCB total_assets Extraction Fails (HIGH)

## Symptom

VCB Q1-2025: `total_assets = 35,202,546` (triệu). Expected: ~2,400,000,000 triệu.
VCB Q4-2025: `total_assets = 12,895,433` (triệu). Both records have `validation_status = low_confidence`.

The imbalance reported — Assets(35,202,546) != Liabilities(2,214,393,069) + Equity(204,941,834) — is a direct consequence of `total_assets` parsing to the wrong value.

## Root Cause Hypothesis

### Path taken for VCB total_assets

In `extractBalanceSheet`, the `fv()` helper resolves `totalAssets` via split-block key `"270"` first, then falls back to `findValue(lines, P_TOTAL_ASSETS)`.

VCB BCTCs are banking format (Mẫu B02a/TCTD-HN). The banking-label fallback in `parseSplitBlockBalanceSheet` (lines 434-483) only extracts keys `"300"`, `"400"`, `"440"` — it never produces key `"270"`. So `sbMap["270"]` is always `undefined` for VCB.

The fallback therefore goes to `findValue(lines, P_TOTAL_ASSETS)` where:

```
P_TOTAL_ASSETS = /t[ổo]ng\s+(?:c[ộo]ng\s+)?t[àa]i\s+s[ảa]n/i
```

In a VCB Q4 PDF the OCR text for the total-assets line is a multi-column header merged into one line (e.g. `"Tổng cộng tài sản  31/12/2025  31/12/2024"`). The `extractNumber` function scans left-to-right and picks the **first large number** — which is the year `2025` (skipped by the year guard) or a sub-total that happens to appear before the grand total on that line. For VCB Q1, the value `35,202,546` looks like a plausible triệu figure (~35 billion VND) but is in fact a sub-item value, not the balance sheet total.

The unit multiplier is detected as `1` ("Triệu VND" confirmed from the header), so no magnitude-inference rescue fires — `totalAssets` is committed as-is.

### Why 1415b did not fix this

Task 1415b fixed liabilities/equity by improving the banking-label triple-search in `parseSplitBlockBalanceSheet` (keys `"300"`, `"400"`, `"440"`). It did not add key `"270"` to the output of that path, so `total_assets` still takes the `findValue` fallback.

## Files to Investigate

- `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`
  - `parseSplitBlockBalanceSheet` — banking-label fallback (lines 434-483): does not emit key `"270"`
  - `extractBalanceSheet` — totalAssets resolution (lines 673-677): fallback arithmetic exists but only fires when `totalAssets === 0`
  - `extractSplitBlockAll` — page-merge logic: confirm VCB pages with grand total are included in the merged pass

- `apps/mcp-server/src/domain/services/financial-reports/extractorGuards.ts`
  - Confirm whether `guardBalanceSheet` enforces any floor on `totalAssets`

## Fix Options (for Architect to decide)

**Option A — Emit "270" from banking-label fallback.**
After the triple-search finds `grandTotal`, store it as `"440"` (already done) AND `"270"`. This is semantically correct: for banks the grand total of assets equals the grand total of nguồn vốn.

**Option B — Derive total_assets from sub-totals in extractBalanceSheet.**
After the split-block + findValue passes, if `sbMap` returned keys `"300"/"400"/"440"` but not `"270"`, set `totalAssets = sbMap["440"]` (same numeric value, different label).

**Option C — Post-extraction consistency guard.**
If `Math.abs(totalAssets - (totalLiabilities + equity.total)) / totalAssets > 0.05` and `totalLiabilitiesAndEquity > totalAssets`, replace `totalAssets` with `totalLiabilitiesAndEquity`.

## Acceptance Criteria

- `financial_reports WHERE action_code='VCB' AND period_year=2025 AND period_quarter=1`: `total_assets > 1,000,000,000` (triệu VND, i.e., > 1 quadrillion VND raw = plausible for VCB)
- `financial_reports WHERE action_code='VCB' AND period_year=2025 AND period_quarter=4`: same guard passes
- `Math.abs(total_assets - (total_liabilities + equity_total)) / total_assets < 0.01` for both VCB records
- `validation_status` upgrades from `low_confidence` to `valid` for VCB Q1 and Q4 after re-extraction
- No regression: VNM, FPT, other non-banking tickers retain correct `total_assets`

## Architect Decision

**Chosen option: B — emit key "270" from the banking-label fallback return statement.**

### Rationale

Option B is a single-line change confined entirely to `parseSplitBlockBalanceSheet`. The banking fallback already derives `grandTotal` (the accounting identity: total liabilities + equity = total assets). Emitting it under key `"270"` as well as `"440"` means `fv(P_TOTAL_ASSETS, "270")` in `extractBalanceSheet` (line 673) picks it up directly from `sbMap` without touching any other code path.

Option A is functionally identical — both touch the same `return` statement. Option C is a downstream patch that would mask the real absence of `"270"` while leaving the data model inconsistent; rejected.

No changes needed in `extractBalanceSheet`, `extractorGuards.ts`, or `parseBctcReport.ts`.

### Exact code change

**File:** `apps/mcp-server/src/domain/services/financial-reports/balanceSheetExtractor.ts`

Find the banking-label fallback `return` inside `parseSplitBlockBalanceSheet` (currently around line 478):

```typescript
// BEFORE (current code)
return { "300": liab, "400": eq, "440": grandTotal };
```

```typescript
// AFTER
return { "270": grandTotal, "300": liab, "400": eq, "440": grandTotal };
```

That is the entire change. Key `"270"` is set to the same value as `"440"` because for Vietnamese banking BCTCs (Mẫu B02a/TCTD-HN), total assets equals total sources of capital (nguồn vốn) by the balance sheet identity.

### Why this is safe

- The change is inside the `codeSet.size === 0` branch, which only fires for banking-format PDFs. Non-banking PDFs (VNM, FPT, HPG) extract item codes 100-440 normally and never enter this branch.
- `fv(P_TOTAL_ASSETS, "270")` already prefers `sbMap["270"]` over `findValue`. Once `"270"` is present, `findValue(lines, P_TOTAL_ASSETS)` is never called for VCB — the mis-parsing root cause is fully bypassed.
- The existing `totalAssets === 0` arithmetic fallback (lines 675-677) remains as a belt-and-suspenders guard.

### Test plan

**Unit tests** (add to `apps/mcp-server/src/__tests__/hotfix-vcb-parser.test.ts` or a new `1416a-vcb-total-assets.test.ts`):

1. Construct minimal banking-format split-block text that exercises the `codeSet.size === 0` branch. Call `extractBalanceSheet(text)`. Assert `result.totalAssets === result.totalLiabilitiesAndEquity` and both values are the correct grand total (not a sub-item).
2. Construct a standard non-banking split-block text (VNM format with explicit item codes). Call `extractBalanceSheet`. Assert `result.totalAssets` is unchanged — regression guard.
3. Pass the above banking text with a deliberate `P_TOTAL_ASSETS`-matching line that would return the wrong sub-value. Assert that `sbMap["270"]` wins over `findValue` (i.e. the fix suppresses the `findValue` path).

**Integration / reparse check:**
- After deploying, trigger `runBctcReparseJob` for VCB Q1-2025 and Q4-2025.
- Query: `SELECT total_assets, equity_total, total_liabilities, validation_status FROM financial_reports WHERE action_code='VCB' AND period_year=2025`.
- Assert `total_assets > 1_000_000_000` (triệu), `ABS(total_assets - (total_liabilities + equity_total)) / total_assets < 0.01`, `validation_status` is not `low_confidence`.

---
*Spec authored: 2026-04-29 | BA agent | Sprint 1416a*
*Architecture decision: 2026-04-29 | Architect | Sprint 1416*
