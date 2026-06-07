# BEQ-5 Handoff — bctcSectionCompleteness Domain Function

**Task ID:** BEQ-5  
**Title:** bctcSectionCompleteness.ts pure domain fn checkSectionCompleteness(rows)→{hasBalanceSheet,hasIncomeStatement,hasCashFlow,isComplete} + DV tests  
**Owner:** dev-mcp-server  
**Size:** XS (~2h)  
**Sprint:** BCTC-EXTRACT-QUALITY Phase-2  
**Arch Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md (§3, Decision A)

---

## Context

The BCTC data layer contains balance-sheet-only row fragments for tickers like VNM, FPT-Q4, EIB, DHG, SHB, VEA. These rows are missing income_statement and cash_flow sections entirely — a legacy artifact from the pdf-parse geometry extractor. When the aggregator processes these incomplete sets, it produces false-DONE status and premature null-clears, poisoning the corpus for downstream agentic refine.

This task creates the **pure domain function** that detects section incompleteness so that BEQ-6/7 can guard against false-DONE.

---

## Acceptance Criteria

### AC-1: Domain Function Creation
- **File:** `apps/mcp-server/src/domain/services/financial-reports/bctcSectionCompleteness.ts` (NEW)
- **Export:** `checkSectionCompleteness(rows: AggregatorRow[]): SectionCompletenessResult`
- **Type:** `SectionCompletenessResult = { hasBalanceSheet: boolean; hasIncomeStatement: boolean; hasCashFlow: boolean; isComplete: boolean }`
- **Logic:**
  - `hasBalanceSheet = rows.some(r => r.statement_section === 'balance_sheet')`
  - `hasIncomeStatement = rows.some(r => r.statement_section === 'income_statement')`
  - `hasCashFlow = rows.some(r => r.statement_section === 'cash_flow')`
  - `isComplete = hasBalanceSheet && hasIncomeStatement && hasCashFlow`
- **Edge case:** Empty rows → all false
- **No I/O:** Pure function, zero database or file access
- **No external side effects**

### AC-2: Test File Creation
- **File:** `apps/mcp-server/src/__tests__/BEQ-SECTION-GUARD.test.ts` (NEW)
- **DV-GUARD-1:** balance-sheet-only rows → `isComplete=false`, `hasBalanceSheet=true`, `hasIncomeStatement=false`, `hasCashFlow=false`
- **DV-GUARD-2:** all three sections present → `isComplete=true`
- **DV-GUARD-3:** income-only rows (no balance/cash) → `isComplete=false`
- **DV-GUARD-4:** empty array → all false
- All tests must PASS after implementation, FAIL before (deliberate-violation proof)

### AC-3: Integration Readiness
- No changes to existing production files in this task
- No schema changes, no DB mutations
- Function is testable standalone (no mocking)

---

## Dependencies

- **Blocks:** BEQ-6, BEQ-7, BEQ-8, BEQ-8b, BEQ-9, BEQ-10
- **Prerequisite:** BEQ-3 (shipped — fundament scalar-mapping completed)
- **No blockers:** Can ship immediately

---

## Technical Notes

- **DDD Layer:** domain (pure business logic)
- **AggregatorRow type:** already defined in `apps/mcp-server/src/domain/types/` (reference existing import)
- **statement_section enum:** already enforced in schema-financial-reports.ts (balance_sheet | income_statement | cash_flow | null)
- Keep function ~10 lines; single responsibility
- No try-catch; let callers handle errors upstream

---

## Commit Format

```
feat(bctc): add bctcSectionCompleteness domain fn (BEQ-5)

Pure function checkSectionCompleteness(rows) detects section
completeness (balance_sheet + income_statement + cash_flow all present).
Guards BEQ-6/7 against false-DONE on balance-sheet-only fragments.

DV tests: BEQ-SECTION-GUARD.test.ts (4/4 proof).

Task: BEQ-5
```

---

## Handoff Checklist

- [ ] Function written and exported correctly
- [ ] Type definition matches SectionCompletenessResult
- [ ] 4 DV tests written, all pass
- [ ] No external dependencies (pure function verified)
- [ ] Commit message follows format
- [ ] Ready for QA before BEQ-6 dispatch

---

## RETURN

**Status:** Ready for dev-mcp-server dispatch  
**Blocker:** None  
**Next:** dev-mcp-server implements BEQ-5; QA verifies DV tests FAIL→PASS; then seq unblock BEQ-6/7/8/8b in queue  
