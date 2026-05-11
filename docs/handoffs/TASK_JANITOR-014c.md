# TASK JANITOR-014c — Migrate incomeStatementExtractor.ts to use extractorHelpers

## Context

incomeStatementExtractor.ts defines private copies of `LOOKAHEAD_LINES`, `extractNumber`, `stripDiacritics`, and `detectUnitMultiplier`. The local `detectUnitMultiplier` is the inferior version (50-line scan, missing patterns). After this migration the extractor will use the canonical 400-line version from extractorHelpers.ts.

Additionally, the income statement extractor uses `detectUnitMultiplier` sentinels -1 and -2 before the 1e14 magnitude guard — sentinel resolution must be added explicitly if not already present.

## Target File

`apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts`

## Acceptance Criteria

1. Remove private declarations of: `LOOKAHEAD_LINES`, `extractNumber`, `stripDiacritics`, `detectUnitMultiplier`.
2. Add import at top of file:
   ```typescript
   import { LOOKAHEAD_LINES, extractNumber, stripDiacritics, detectUnitMultiplier } from "./extractorHelpers.js";
   ```
3. After calling `detectUnitMultiplier(lines)`, add sentinel resolution before any 1e14 magnitude guard:
   - If result === -1 (đồng detected), treat as multiplier = 1e-6 (values are in đồng, convert to triệu VND).
   - If result === -2 (no header found), fall back to magnitude inference (existing behavior).
   - Otherwise use multiplier as-is.
4. All call sites compile and behave identically.
5. `bun tsc --noEmit` passes with zero errors.
6. `bun test` >= 8519. Income statement specific tests (including FPT Q4, HPG Q4 fixtures from task 1810a) must all pass.

## Implementation Notes

- Read the existing sentinel handling in balanceSheetExtractor.ts first — it already resolves -1/-2 correctly. Port that pattern.
- The income statement's old 50-line `detectUnitMultiplier` was silently returning wrong multipliers for bank BCTC reports. The canonical version is strictly better.

## Dependencies

- Requires: JANITOR-014a complete and merged

## Branch

`task/JANITOR-014c-income-statement-migrate`

## Estimated effort

~45min
