# BEQ-8 Handoff — Fix isBankPath Discriminator in aggregateScalars

**Task ID:** BEQ-8  
**Title:** Replace isBankPath = findByCode(rows,"10")===null with isBankFormFromRows(rows) from bctcFormType.ts in aggregateScalars (line 578)  
**Owner:** dev-mcp-server  
**Size:** XS (~1h)  
**Sprint:** BCTC-EXTRACT-QUALITY Phase-2  
**Arch Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md (§4, Decision B)

---

## Context

The `aggregateScalars` function at line 578 uses `isBankPath = findByCode(rows, "10") === null` as its bank discriminator. This is a **false-positive trap** for balance-sheet-only corporate rows:

- **Corporate balance-sheet-only rows** (FPT, VNM, DHG) contain codes like "100", "280", "300" but NO code "10" (which is an income-statement code).
- **Bank rows** should have Roman numerals (I, II, XIII, etc.) as codes, not 3-digit corporate codes.
- **Current bug:** When code "10" is absent due to incomplete row sections, the discriminator wrongly classifies the corporate as a bank.
- **Consequence:** The `notApplicable=["gross_profit","current_assets","gross_margin_pct"]` null-clear fires on a corporate, wiping those fields irreversibly until agentic refine overwrites them.

The proven discriminator from BANK-AWARE-BCTC sprint (`isBankFormFromRows`) uses a **hybrid signal**: anchored Roman-numeral presence AND absence of 3-digit corporate codes. This correctly handles balance-sheet-only corporates.

---

## Acceptance Criteria

### AC-1: Replace Local Discriminator with SSOT Function
- **File:** `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`
- **Location:** Line 578
- **Before:**
  ```typescript
  const isBankPath = findByCode(rows, "10") === null;
  ```
- **After:**
  ```typescript
  import { isBankFormFromRows } from "./bctcFormType.js";
  const isBankPath = isBankFormFromRows(rows);
  ```
- **Verification:** `isBankFormFromRows` is already imported by `finalizeBctcRefineTool.ts` (proof of existing usage)

### AC-2: Understand the Discriminator Logic
- **isBankFormFromRows returns true IF:**
  - Has Roman-numeral/section codes (I, II, XIII, A, B) as positive evidence
  - AND does NOT have 3-digit corporate codes as veto
- **isBankFormFromRows returns false IF:**
  - No Roman numerals (normal for corporates)
  - OR has 3-digit corporate codes (proof of corporate)
  - OR empty rows (fail-safe default)
- **Result:** Balance-sheet-only corporates with codes "100", "280", etc. return false (corporate), not true (bank)

### AC-3: Test Deliberate Violations
- **File:** extend `apps/mcp-server/src/__tests__/BEQ-BANK-DISCRIM.test.ts` (new) or merge into BEQ-SECTION-GUARD.test.ts
- **DV-BANK-1:** balance-sheet-only corporate rows (FPT codes: "100", "280", "300", "400") → `isBankPath=false`, `notApplicable=[]` (NO null-clear)
- **DV-BANK-2:** bank rows (ACB with Roman codes I, II, XIII) → `isBankPath=true`, `notApplicable=["gross_profit","current_assets","gross_margin_pct"]` (null-clear fires)
- **DV-BANK-3:** empty rows → `isBankPath=false` (fail-safe, corporate default)
- All must FAIL before implementation (old code would return true for FPT), PASS after

### AC-4: No Functional Change to aggregateScalars Output
- The function's scalar computation is unchanged
- Only the internal bank flag changes
- **Behavior change:** Corporates with balance-sheet-only rows no longer receive the notApplicable null-clear
- **No schema change:** isBankPath is an internal decision variable, not stored

---

## Dependencies

- **Requires:** BEQ-5 (checkSectionCompleteness exported and available)
- **Blocks:** BEQ-9, BEQ-10 (cannot dispatch refine until this ships + image rebuilt)
- **Co-dependent:** BEQ-6, BEQ-7, BEQ-8b (same tool zone, sequenced in git)
- **Related:** BEQ-6 and BEQ-7 also call aggregateScalars; their guards ensure this function is never called on incomplete rows

---

## Implementation Notes

- **Import location:** `isBankFormFromRows` is in `apps/mcp-server/src/domain/services/financial-reports/bctcFormType.ts`
- **Existing usage:** Already used in `finalizeBctcRefineTool.ts` line 38 and elsewhere → no new dependency
- **DRY compliance:** Removes a local proxy discriminator; converges on single SSOT
- **No breaking changes:** Return type and semantics of aggregateScalars unchanged; internal flag only
- **Testing scope:** Discriminator behavior change must be proven by DV tests before/after

---

## Commit Format

```
fix(bctc): replace isBankPath discriminator with isBankFormFromRows (BEQ-8)

Line 578 of aggregateScalars: replace the false-positive discriminator
(findByCode(rows,"10")===null) with the proven BANK-AWARE-BCTC function
(isBankFormFromRows). Balance-sheet-only corporates (FPT, VNM, DHG) now
correctly return false instead of being mis-classified as banks.

Consequence: notApplicable null-clear no longer fires on corporates with
incomplete row sections. DRY compliance: single SSOT discriminator.

DV tests: BEQ-BANK-DISCRIM.test.ts (FPT false, ACB true, empty false).

Task: BEQ-8
Depends: BEQ-5
```

---

## Handoff Checklist

- [ ] Line 578 replaced with isBankFormFromRows call
- [ ] Import statement added correctly
- [ ] No circular imports introduced
- [ ] DV tests written (3/3): corporate false, bank true, empty false
- [ ] Discriminator behavior verified before/after (use test output)
- [ ] Commit message follows format, references BEQ-5
- [ ] QA verifies before next task dispatch

---

## RETURN

**Status:** Ready for dev-mcp-server dispatch (after BEQ-5 DONE)  
**Blocker:** BEQ-5 completion  
**Next:** dev-mcp-server implements BEQ-8; QA verifies DV tests; then seq unblock BEQ-8b  
