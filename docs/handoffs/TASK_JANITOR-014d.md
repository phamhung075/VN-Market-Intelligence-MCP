# TASK JANITOR-014d — Migrate cashFlowExtractor.ts to use extractorHelpers

## Context

cashFlowExtractor.ts defines a private copy of `extractNumber` and a local `lineMatches` helper. `extractNumber` is now canonical in extractorHelpers.ts. `lineMatches` is small enough to inline or keep local — architect decision: inline it (it is a one-liner used in ≤3 call sites).

## Target File

`apps/mcp-server/src/domain/services/financial-reports/cashFlowExtractor.ts`

## Acceptance Criteria

1. Remove private declaration of `extractNumber`.
2. Add import at top of file:
   ```typescript
   import { extractNumber } from "./extractorHelpers.js";
   ```
3. `lineMatches` helper: if it is a pure one-liner (e.g. `text.includes(keyword)`), inline it at each call site and remove the function. If it is more than one line, keep it as a private module-level function (no import needed).
4. All call sites compile and behave identically.
5. `bun tsc --noEmit` passes with zero errors.
6. `bun test` >= 8519. Cash flow specific test `044-bctc-cashflow.test.ts` must pass explicitly — verify by name.

## Implementation Notes

- Run `bun test --testNamePattern 044` or `bun test apps/mcp-server/src/__tests__/044-bctc-cashflow.test.ts` to isolate cash flow results before and after the change.

## Dependencies

- Requires: JANITOR-014a complete and merged
- Can run in parallel with JANITOR-014b and JANITOR-014c (all depend only on 014a)

## Branch

`task/JANITOR-014d-cashflow-migrate`

## Estimated effort

~30min
