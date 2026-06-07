# BEQ-6 Handoff — Apply Section Guard in backfillBctcScalarsTool

**Task ID:** BEQ-6  
**Title:** Apply section guard in backfillBctcScalarsTool (remove unconditional refine_status='DONE' at line 249; balance-sheet-only→PARTIAL)  
**Owner:** dev-mcp-server  
**Size:** XS (~1.5h)  
**Sprint:** BCTC-EXTRACT-QUALITY Phase-2  
**Arch Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md (§3, Decision A; §8, Risk Flag R-1)

---

## Context

`backfillBctcScalarsTool.ts` line 249 contains an unconditional `refine_status='DONE'` set even when `updates.length === 0 && nullClearCols.length === 0`. For balance-sheet-only corporate rows (e.g., FPT-2025Q4, VNM, DHG), this zero-update path fires and marks DONE, poisoning the guardiant (BEQ-4a/4b) and preventing the agentic refine from ever re-evaluating the ticker.

This task applies the section-completeness check **before** the aggregation call and guards the unconditional-DONE path.

---

## Acceptance Criteria

### AC-1: Section Gate Before Aggregation
- **File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.ts`
- **Location:** After line 156 (tableRows fetch, before aggregateScalars call)
- **Implementation:**
  ```typescript
  import { checkSectionCompleteness } from "../../domain/services/financial-reports/bctcSectionCompleteness.js";
  
  const completeness = checkSectionCompleteness(tableRows);
  
  if (!completeness.isComplete) {
    // balance-sheet-only or other incomplete section set
    if (completeness.hasBalanceSheet && !completeness.hasIncomeStatement && !completeness.hasCashFlow) {
      // Exact balance-sheet-only case
      return {
        status: "SKIPPED",
        reason: "balance_sheet_only: section completeness violated",
        section_breakdown: {
          hasBalanceSheet: completeness.hasBalanceSheet,
          hasIncomeStatement: completeness.hasIncomeStatement,
          hasCashFlow: completeness.hasCashFlow
        },
        refine_status: "PARTIAL",
        updated_cols: [],
        nullClearCols: []
      };
    }
    // Other incompleteness patterns
    return {
      status: "SKIPPED",
      reason: "section_incomplete: cannot aggregate",
      refine_status: "PARTIAL",
      updated_cols: [],
      nullClearCols: []
    };
  }
  // Proceed to aggregateScalars only if completeness.isComplete === true
  const aggregated = aggregateScalars(...);
  ```
- **Never call** `aggregateScalars` on incomplete row sets

### AC-2: Guard Unconditional-DONE Path (Line 249)
- **Current logic (line 249):** `"No scalars resolved — still mark DONE"`
- **New logic:**
  - If updates.length === 0 AND nullClearCols.length === 0:
    - Re-check section completeness
    - If `!completeness.isComplete` → set `refine_status='PARTIAL'` (not DONE)
    - If `completeness.isComplete` → OK to set DONE (as before)
  - Store completeness check result early so it can be re-used

### AC-3: Return Type Consistency
- Return object includes `reason`, `section_breakdown` on SKIPPED paths
- `refine_status` field is always set (DONE, PARTIAL, PENDING, FAILED)
- Test caller (QA) can verify reason string in dry_run output

### AC-4: Test Deliberate Violations
- **File:** extend `apps/mcp-server/src/__tests__/BEQ-SECTION-GUARD.test.ts` (or BEQ-6-specific tests)
- **DV-BACKFILL-1:** balance-sheet-only rows → backfill returns `status=SKIPPED`, `refine_status=PARTIAL` (NOT DONE)
- **DV-BACKFILL-2:** zero-update balance-sheet-only rows → same SKIPPED+PARTIAL result
- **DV-BACKFILL-3:** complete three-section rows + zero updates → `refine_status=DONE` allowed
- All must FAIL before implementation, PASS after

---

## Dependencies

- **Requires:** BEQ-5 (checkSectionCompleteness function)
- **Blocks:** BEQ-9, BEQ-10 (agentic refine cannot start until this ships + image rebuilt)
- **Co-dependent:** BEQ-7, BEQ-8, BEQ-8b (same tool zone, sequenced in git)
- **Prerequisite met:** BEQ-5 completed and exported

---

## Implementation Notes

- **Import path:** `import { checkSectionCompleteness } from "../../domain/services/financial-reports/bctcSectionCompleteness.js"`
- **Type:** function signature matches what BEQ-5 exports; no circular imports
- **No DB writes in this task** (only tool return type modified)
- **Live caller:** backfill_bctc_scalars MCP tool; dry_run=true can be re-run to verify output changes
- **Risk mitigation:** Never remove BEQ-4a/4b guards (PARTIAL now returns null for net_profit, so no regression)

---

## Commit Format

```
feat(bctc): apply section guard in backfillBctcScalarsTool (BEQ-6)

Gate backfillBctcScalarsTool on section completeness check.
Balance-sheet-only rows now return status=SKIPPED, refine_status=PARTIAL
instead of false-DONE. Guards against corpus poisoning before agentic refine.

Line 249 unconditional-DONE also protected: re-checks completeness before
setting DONE on zero-update cases.

DV tests: BEQ-SECTION-GUARD.test.ts DV-BACKFILL-1/2/3.

Task: BEQ-6
Depends: BEQ-5
```

---

## Handoff Checklist

- [ ] Section completeness check added before aggregateScalars call
- [ ] Zero-update path guarded (line 249 revisited)
- [ ] Return structure includes reason + section_breakdown
- [ ] DV tests written (3/3): balance-sheet-only SKIPPED, complete rows DONE
- [ ] Dry-run re-run manually (router: `backfill_bctc_scalars(dry_run=true)`) to verify output changes
- [ ] Commit message references BEQ-5 prerequisite
- [ ] QA verifies before next task dispatch

---

## RETURN

**Status:** Ready for dev-mcp-server dispatch (after BEQ-5 DONE)  
**Blocker:** BEQ-5 completion  
**Next:** dev-mcp-server implements BEQ-6; QA runs dry-run verification; then seq unblock BEQ-7/8/8b  
